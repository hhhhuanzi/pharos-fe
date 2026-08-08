import { useCallback, useRef, useState } from 'react';
import { Modal } from 'antd';
import { useTranslation } from 'react-i18next';

import { getLogExportAdapter } from './adapters';
import { recordLogExport, LogExportForbiddenError } from './audit';
import { saveBlobParts } from './download';
import { buildExportFilename } from './filename';
import { makeChunk, makeHeader, resolveCsvColumns } from './serialize';
import { BATCH_SIZE_TIER1, BATCH_SIZE_TIER2, MAX_OUTPUT_CHARS, NS } from './constants';
import { ExportProgress, LogExportAdapter, LogExportContext, LogExportFormValues, LogExportPrepareResult, LogRow, StopReason } from './types';

const IDLE_PROGRESS: ExportProgress = { phase: 'idle', fetched: 0, target: 0, accumulatedChars: 0 };

/** 单次导出会话的可续跑状态；仅在批失败后暂停时保留，供 retryBatch / flushPartial 使用 */
interface ExportSession {
  ctx: LogExportContext;
  values: LogExportFormValues;
  adapter: LogExportAdapter;
  controller: AbortController;
  cancelledByUser: boolean;
  prepareResult: LogExportPrepareResult;
  target: number;
  batchSize: number;
  parts: string[];
  columns: string[];
  headerWritten: boolean;
  fetched: number;
  cursor: unknown;
  total?: number;
  accumulatedChars: number;
  startedAt: number;
}

export interface UseLogExportReturn {
  progress: ExportProgress;
  start: (ctx: LogExportContext, values: LogExportFormValues) => Promise<void>;
  cancel: () => void;
  /** 某批失败后，用户选择「导出已获取部分」时调用 */
  flushPartial: () => Promise<void>;
  /** 某批失败后，用户选择「重试这一批」时调用。§10.4 要求的三选一之一，doc 的 hook 签名未列出，
   *  但没有它「重试这一批」按钮无法工作，属实现期必要补充。 */
  retryBatch: () => Promise<void>;
  reset: () => void;
}

export default function useLogExport(): UseLogExportReturn {
  const { t } = useTranslation(NS);
  const [progress, setProgress] = useState<ExportProgress>(IDLE_PROGRESS);
  const sessionRef = useRef<ExportSession | null>(null);

  const reset = useCallback(() => {
    sessionRef.current?.controller.abort();
    sessionRef.current = null;
    setProgress(IDLE_PROGRESS);
  }, []);

  const finishAudit = useCallback(
    async (session: ExportSession, status: 'success' | 'failed' | 'cancelled', extra?: { error?: string; stopReason?: StopReason }) => {
      try {
        await recordLogExport({
          phase: 'finish',
          cate: session.ctx.cate,
          datasource_id: session.ctx.datasourceId,
          datasource_name: session.ctx.datasourceName,
          index: session.adapter.getQueryDigest(session.ctx),
          query: JSON.stringify(session.ctx.query ?? {}),
          start: session.ctx.start,
          end: session.ctx.end,
          format: session.values.format,
          strategy: session.prepareResult.strategy,
          expect_rows: session.values.rows,
          fields: session.values.format === 'csv' ? session.columns : [],
          actual_rows: session.fetched,
          status,
          stop_reason: extra?.stopReason,
          output_bytes: session.accumulatedChars,
          error: extra?.error?.slice(0, 200),
          duration_ms: Date.now() - session.startedAt,
        });
      } catch (err) {
        // 埋点接口本身挂了不阻断导出结果，见 pharos-ops/HANDOFF-log-export.md 决策点 4
        console.warn('[dh/logExport] finish record failed:', err);
      }
    },
    [],
  );

  const cleanupAdapter = useCallback(async (session: ExportSession) => {
    try {
      await session.adapter.cleanup?.(session.ctx, session.prepareResult.state);
    } catch (err) {
      console.warn('[dh/logExport] adapter cleanup failed:', err);
    }
  }, []);

  /** 组装并下载已获取的部分（正常耗尽 / 达标 / 撞字节闸门 / 用户主动 flush 均走这里） */
  const finalize = useCallback(
    async (session: ExportSession, stopReason: StopReason) => {
      // 一条都没取到：不下载空文件，交给 UI 用 message.info 提示「没有日志」（§10.4）
      if (session.fetched === 0) {
        setProgress({ phase: 'done', fetched: 0, target: session.target, total: session.total, accumulatedChars: 0, stopReason });
        await finishAudit(session, 'success', { stopReason });
        await cleanupAdapter(session);
        return;
      }
      setProgress({
        phase: 'assembling',
        fetched: session.fetched,
        target: session.target,
        total: session.total,
        accumulatedChars: session.accumulatedChars,
      });
      try {
        saveBlobParts(session.parts, buildExportFilename(session.ctx, session.adapter, session.values.format), session.values.format);
      } catch (err: any) {
        const isMemoryError = err instanceof RangeError || /invalid string length/i.test(String(err?.message));
        setProgress({
          phase: 'failed',
          fetched: session.fetched,
          target: session.target,
          total: session.total,
          accumulatedChars: session.accumulatedChars,
          errorMessage: isMemoryError ? t('result.memory_error') : String(err?.message ?? err),
        });
        await finishAudit(session, 'failed', { error: String(err?.message ?? err) });
        await cleanupAdapter(session);
        return;
      }
      setProgress({
        phase: 'done',
        fetched: session.fetched,
        target: session.target,
        total: session.total,
        accumulatedChars: session.accumulatedChars,
        stopReason,
      });
      await finishAudit(session, 'success', { stopReason });
      await cleanupAdapter(session);
    },
    [cleanupAdapter, finishAudit, t],
  );

  /** 核心拉取循环，从 session 当前的 fetched/cursor 续跑。start 与 retryBatch 共用 */
  const runLoop = useCallback(
    async (session: ExportSession) => {
      try {
        while (session.fetched < session.target) {
          const size = Math.min(session.batchSize, session.target - session.fetched);
          const res = await session.adapter.fetchPage({
            ctx: session.ctx,
            fetched: session.fetched,
            size,
            cursor: session.cursor,
            state: session.prepareResult.state,
            signal: session.controller.signal,
          });

          if (res.total != null) session.total = res.total;
          if (res.rows.length > 0) writeRows(session, res.rows);
          session.fetched += res.rows.length;
          session.cursor = res.cursor;
          // 首批完成后就能给出实测速率（条/毫秒），供 UI 估算剩余时间（§10.3）
          const elapsedMs = Date.now() - session.startedAt;
          const rate = session.fetched > 0 && elapsedMs > 0 ? session.fetched / elapsedMs : undefined;
          setProgress({
            phase: 'fetching',
            fetched: session.fetched,
            target: session.target,
            total: session.total,
            accumulatedChars: session.accumulatedChars,
            rate,
          });

          if (res.rows.length === 0 || res.exhausted) {
            await finalize(session, 'exhausted');
            return;
          }

          // 字节闸门判断在【写入之后】，宁可多一个批次也不丢弃已拿到的数据
          if (session.accumulatedChars >= MAX_OUTPUT_CHARS) {
            await finalize(session, 'byte_limit');
            return;
          }
        }
        await finalize(session, 'target');
      } catch (err: any) {
        if (session.cancelledByUser) {
          setProgress({
            phase: 'cancelled',
            fetched: session.fetched,
            target: session.target,
            total: session.total,
            accumulatedChars: session.accumulatedChars,
          });
          await finishAudit(session, 'cancelled');
          await cleanupAdapter(session);
          sessionRef.current = null;
          return;
        }
        // 单批失败（含超时）：暂停在当前进度，交给 UI 三选一（flushPartial / retryBatch / cancel）
        setProgress({
          phase: 'failed',
          fetched: session.fetched,
          target: session.target,
          total: session.total,
          accumulatedChars: session.accumulatedChars,
          errorMessage: String(err?.message ?? err),
        });
      }
    },
    [finalize, cleanupAdapter, finishAudit],
  );

  const start = useCallback(
    async (ctx: LogExportContext, values: LogExportFormValues) => {
      const adapter = getLogExportAdapter(ctx.cate);
      if (!adapter) return;

      const controller = new AbortController();
      setProgress({ phase: 'preparing', fetched: 0, target: values.rows, accumulatedChars: 0, startedAt: Date.now() });

      let maxRows: number;
      try {
        // 权限校验 + 审计埋点（start）。此时策略尚未确定，strategy 先占位为 from_size，
        // finish 记录时会带上实际策略 —— 这是对文档 §7.3 伪代码顺序的一处必要调整
        // （LogExportRecordRequest.strategy 为必填字段，而 prepare() 在此之后才返回真实策略）。
        const startRes = await recordLogExport({
          phase: 'start',
          cate: ctx.cate,
          datasource_id: ctx.datasourceId,
          datasource_name: ctx.datasourceName,
          index: adapter.getQueryDigest(ctx),
          query: JSON.stringify(ctx.query ?? {}),
          start: ctx.start,
          end: ctx.end,
          format: values.format,
          strategy: 'from_size',
          expect_rows: values.rows,
          fields: values.format === 'csv' ? (values.allFields ? [] : values.columns) : [],
        });
        maxRows = startRes?.max_rows ?? values.rows;
      } catch (err) {
        if (err instanceof LogExportForbiddenError) {
          setProgress({ phase: 'failed', fetched: 0, target: values.rows, accumulatedChars: 0, errorMessage: t('modal.no_permission') });
          return;
        }
        setProgress({ phase: 'failed', fetched: 0, target: values.rows, accumulatedChars: 0, errorMessage: String((err as any)?.message ?? err) });
        return;
      }

      let prepareResult: LogExportPrepareResult;
      try {
        prepareResult = await adapter.prepare(ctx, values.rows, controller.signal);
      } catch (err: any) {
        setProgress({ phase: 'failed', fetched: 0, target: values.rows, accumulatedChars: 0, errorMessage: String(err?.message ?? err) });
        return;
      }

      if (prepareResult.downgradeReason) {
        const confirmed = await new Promise<boolean>((resolve) => {
          Modal.confirm({
            title: t(`downgrade.${prepareResult.downgradeReason}`),
            okText: t('downgrade.confirm'),
            cancelText: t('downgrade.cancel'),
            onOk: () => resolve(true),
            onCancel: () => resolve(false),
          });
        });
        if (!confirmed) {
          setProgress(IDLE_PROGRESS);
          return;
        }
      }

      const target = Math.min(values.rows, prepareResult.effectiveMaxRows, maxRows);
      const batchSize = prepareResult.strategy === 'pit_search_after' ? BATCH_SIZE_TIER2 : BATCH_SIZE_TIER1;

      const parts: string[] = [];
      if (values.format === 'csv' && !values.allFields) {
        parts.push('\ufeff', makeHeader('csv', values.columns));
      } else if (values.format === 'csv') {
        parts.push('\ufeff'); // allFields 时表头要等首批到达才能确定列集合
      }

      const session: ExportSession = {
        ctx,
        values,
        adapter,
        controller,
        cancelledByUser: false,
        prepareResult,
        target,
        batchSize,
        parts,
        columns: values.allFields ? [] : values.columns,
        headerWritten: values.format !== 'csv' || !values.allFields,
        fetched: 0,
        cursor: undefined,
        total: undefined,
        accumulatedChars: 0,
        startedAt: Date.now(),
      };
      sessionRef.current = session;
      await runLoop(session);
    },
    [runLoop, t],
  );

  const cancel = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    session.cancelledByUser = true;
    session.controller.abort();
  }, []);

  const flushPartial = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    // 批失败后用户选择保留已获取部分：语义上视同「查询在此提前结束」，复用 exhausted 的完成文案
    await finalize(session, 'exhausted');
    sessionRef.current = null;
  }, [finalize]);

  const retryBatch = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    setProgress({
      phase: 'fetching',
      fetched: session.fetched,
      target: session.target,
      total: session.total,
      accumulatedChars: session.accumulatedChars,
    });
    await runLoop(session);
  }, [runLoop]);

  return { progress, start, cancel, flushPartial, retryBatch, reset };
}

/** 把一批行序列化追加进 session.parts，必要时（allFields 且首批）先写表头 */
function writeRows(session: ExportSession, rows: LogRow[]): void {
  if (session.values.format === 'csv' && !session.headerWritten) {
    session.columns = resolveCsvColumns(rows, session.values);
    session.parts.push(makeHeader('csv', session.columns));
    session.headerWritten = true;
  }
  const chunk = makeChunk(rows, session.values.format, session.columns, session.adapter.rawKey);
  session.parts.push(chunk);
  session.accumulatedChars += chunk.length;
}
