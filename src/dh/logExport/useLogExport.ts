import { useCallback, useRef, useState } from 'react';
import { Modal } from 'antd';
import { useTranslation } from 'react-i18next';

import { getLogExportAdapter } from './adapters';
import { recordLogExport, LogExportForbiddenError } from './audit';
import { BatchTimeoutError, withBatchTimeout } from './batchTimeout';
import { saveBlobParts } from './download';
import { buildExportFilename } from './filename';
import { resolveProgressTarget } from './resolveProgressTarget';
import { resolveSourceFields } from './resolveSourceFields';
import { makeChunk, makeHeader, resolveCsvColumns } from './serialize';
import { BATCH_SIZE_TIER1, BATCH_SIZE_TIER2, BATCH_TIMEOUT_MS, MAX_OUTPUT_CHARS, MIN_BATCH_SIZE, NS } from './constants';
import {
  ExportPhase,
  ExportProgress,
  FetchPageResult,
  LogExportAdapter,
  LogExportContext,
  LogExportFormValues,
  LogExportPrepareResult,
  LogRow,
  StopReason,
} from './types';

const IDLE_PROGRESS: ExportProgress = { phase: 'idle', fetched: 0, target: 0, accumulatedChars: 0 };

/**
 * session 建立之后的进度快照：条数、体积、策略一律从 session 读，调用处只给 phase
 * 和少量差异字段。`strategy` 是 UI 分档的依据，漏传一处就会让大额导出退化成小额呈现，
 * 所以必须收在这里统一注入，而不是在每个 setProgress 里手抄一遍。
 *
 * `progress.target`（展示用分母，见 resolveProgressTarget）在这里与 `session.target`
 * （拉取循环真正用来判断何时停止的目标条数）分离：`session.target` 永远是「架构上限
 * clamp 之后的请求条数」，不受这里影响，继续驱动 `runLoop`/`fetchBatch`。
 */
function sessionProgress(session: ExportSession, patch: Partial<ExportProgress> & { phase: ExportPhase }): ExportProgress {
  return {
    fetched: session.fetched,
    target: resolveProgressTarget(session.target, session.total),
    total: session.total,
    accumulatedChars: session.accumulatedChars,
    strategy: session.prepareResult.strategy,
    truncatedCells: session.truncatedCells,
    ...patch,
  };
}

/** 单次导出会话的可续跑状态；仅在批失败后暂停时保留，供 retryBatch / flushPartial 使用 */
interface ExportSession {
  ctx: LogExportContext;
  values: LogExportFormValues;
  adapter: LogExportAdapter;
  controller: AbortController;
  cancelledByUser: boolean;
  /**
   * 用户已经把弹窗关掉、不再关心这次导出的结果（`reset()` 置位）。
   * 与 `cancelledByUser` 的区别：仍然要释放 PIT、仍然要补审计，但**不能**再写进度
   * （否则关闭时的 abort 会异步落一个 phase='failed'，下次打开弹窗就顶着一条
   * 上次遗留的 AbortError 报错），也**不能**再触发下载。
   */
  abandoned: boolean;
  prepareResult: LogExportPrepareResult;
  target: number;
  /** 会被自适应缩批就地改小，所以不是常量 */
  batchSize: number;
  /** 传给 adapter 的 `_source` 白名单；undefined 表示需要完整文档 */
  sourceFields?: string[];
  parts: string[];
  columns: string[];
  headerWritten: boolean;
  fetched: number;
  cursor: unknown;
  total?: number;
  accumulatedChars: number;
  /** 累计有多少个字段值命中 MAX_CELL_CHARS 被截断，非 0 时导出完成后要提示用户 */
  truncatedCells: number;
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
  /**
   * `preparing` 阶段（权限埋点 / 探测版本 / 建 PIT）session 还没组装好，
   * 但那时进度弹窗已经显示「取消」按钮了。只认 sessionRef 的话这个按钮是个空操作，
   * 一旦 prepare 卡住用户就没有退路。所以控制器一创建就先存到这里。
   */
  const pendingControllerRef = useRef<AbortController | null>(null);

  /**
   * 弹窗关闭时调用：彻底放弃这次导出并把状态归零。
   * 标记 abandoned 而不是只 abort，是为了让还在飞的 runLoop 安静收尾 —— 见 abandoned 注释。
   */
  const reset = useCallback(() => {
    const session = sessionRef.current;
    if (session) {
      session.cancelledByUser = true;
      session.abandoned = true;
      session.controller.abort();
    }
    pendingControllerRef.current?.abort();
    pendingControllerRef.current = null;
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
      // 用户已经关掉弹窗：不下载文件、不写进度，只把 PIT 和审计收干净
      if (session.abandoned) {
        await finishAudit(session, 'cancelled');
        await cleanupAdapter(session);
        return;
      }
      // 一条都没取到：不下载空文件，交给 UI 用 message.info 提示「没有日志」（§10.4）
      if (session.fetched === 0) {
        setProgress(sessionProgress(session, { phase: 'done', stopReason }));
        await finishAudit(session, 'success', { stopReason });
        await cleanupAdapter(session);
        return;
      }
      setProgress(sessionProgress(session, { phase: 'assembling' }));
      try {
        saveBlobParts(session.parts, buildExportFilename(session.ctx, session.adapter, session.values.format), session.values.format);
      } catch (err: any) {
        const isMemoryError = err instanceof RangeError || /invalid string length/i.test(String(err?.message));
        setProgress(
          sessionProgress(session, {
            phase: 'failed',
            errorMessage: isMemoryError ? t('result.memory_error') : String(err?.message ?? err),
          }),
        );
        await finishAudit(session, 'failed', { error: String(err?.message ?? err) });
        await cleanupAdapter(session);
        return;
      }
      setProgress(sessionProgress(session, { phase: 'done', stopReason }));
      await finishAudit(session, 'success', { stopReason });
      await cleanupAdapter(session);
    },
    [cleanupAdapter, finishAudit, t],
  );

  /**
   * 取一批数据，带真实超时（umi-request 默认永不超时，见 batchTimeout.ts）。
   *
   * 超时不直接判失败：宽表 5000 条/批本来就可能拉几十 MB，先把批大小折半重试，
   * 折到 MIN_BATCH_SIZE 仍然超时才抛出，交给 runLoop 走「三选一」。
   */
  const fetchBatch = useCallback(
    async (session: ExportSession): Promise<FetchPageResult> => {
      for (;;) {
        const size = Math.min(session.batchSize, session.target - session.fetched);
        try {
          return await withBatchTimeout(
            {
              parentSignal: session.controller.signal,
              timeoutMs: BATCH_TIMEOUT_MS,
              timeoutMessage: t('error.timeout', { seconds: Math.round(BATCH_TIMEOUT_MS / 1000), size }),
            },
            (signal) =>
              session.adapter.fetchPage({
                ctx: session.ctx,
                fetched: session.fetched,
                size,
                cursor: session.cursor,
                state: session.prepareResult.state,
                sourceFields: session.sourceFields,
                signal,
              }),
          );
        } catch (err) {
          if (!(err instanceof BatchTimeoutError) || session.batchSize <= MIN_BATCH_SIZE) throw err;
          session.batchSize = Math.max(MIN_BATCH_SIZE, Math.floor(session.batchSize / 2));
          // 缩批重试期间进度数字不动，必须说明一句，否则和「卡死」无法区分
          setProgress((prev) => ({ ...prev, notice: t('progress.shrink_retry', { size: session.batchSize }) }));
        }
      }
    },
    [t],
  );

  /** 核心拉取循环，从 session 当前的 fetched/cursor 续跑。start 与 retryBatch 共用 */
  const runLoop = useCallback(
    async (session: ExportSession) => {
      try {
        while (session.fetched < session.target) {
          const res = await fetchBatch(session);

          if (res.total != null) session.total = res.total;
          if (res.rows.length > 0) writeRows(session, res.rows);
          if (res.truncatedCells) session.truncatedCells += res.truncatedCells;
          session.fetched += res.rows.length;
          session.cursor = res.cursor;
          // 首批完成后就能给出实测速率（条/毫秒），供 UI 估算剩余时间（§10.3）
          const elapsedMs = Date.now() - session.startedAt;
          const rate = session.fetched > 0 && elapsedMs > 0 ? session.fetched / elapsedMs : undefined;
          setProgress(sessionProgress(session, { phase: 'fetching', rate }));

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
          // abandoned（关弹窗）时不写进度：reset() 已经归零，再写就会留下残留状态
          if (!session.abandoned) setProgress(sessionProgress(session, { phase: 'cancelled' }));
          await finishAudit(session, 'cancelled');
          await cleanupAdapter(session);
          // 用户可能已经开了新一轮导出，别把新 session 清掉
          if (sessionRef.current === session) sessionRef.current = null;
          return;
        }
        // 单批失败（含超时）：暂停在当前进度，交给 UI 三选一（flushPartial / retryBatch / cancel）
        setProgress(sessionProgress(session, { phase: 'failed', errorMessage: String(err?.message ?? err) }));
      }
    },
    [fetchBatch, finalize, cleanupAdapter, finishAudit],
  );

  const start = useCallback(
    async (ctx: LogExportContext, values: LogExportFormValues) => {
      const adapter = getLogExportAdapter(ctx.cate);
      if (!adapter) return;

      const controller = new AbortController();
      pendingControllerRef.current = controller;
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
        // prepare 里要探测 ES 版本、建 PIT，同样得有超时兜底：这两个请求挂住的表现
        // 和批次挂住一样是「弹窗静止、不报错」，只是停在 0 条而不是 10000 条
        prepareResult = await withBatchTimeout(
          {
            parentSignal: controller.signal,
            timeoutMs: BATCH_TIMEOUT_MS,
            timeoutMessage: t('error.prepare_timeout', { seconds: Math.round(BATCH_TIMEOUT_MS / 1000) }),
          },
          (signal) => adapter.prepare(ctx, values.rows, signal),
        );
      } catch (err: any) {
        // 用户在 preparing 阶段点了取消：回到表单，不报错
        if (controller.signal.aborted) {
          setProgress(IDLE_PROGRESS);
          return;
        }
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
        abandoned: false,
        prepareResult,
        target,
        batchSize,
        sourceFields: resolveSourceFields(values, ctx),
        parts,
        columns: values.allFields ? [] : values.columns,
        headerWritten: values.format !== 'csv' || !values.allFields,
        fetched: 0,
        cursor: undefined,
        total: undefined,
        accumulatedChars: 0,
        truncatedCells: 0,
        startedAt: Date.now(),
      };
      sessionRef.current = session;
      // 先落一次带 strategy 的进度，UI 才能立刻切到对应的呈现分档。否则要等首批返回
      // （宽表可能十几秒）才拿到 strategy，这段时间大额导出会被当成小额来呈现。
      setProgress(sessionProgress(session, { phase: 'fetching' }));
      await runLoop(session);
    },
    [runLoop, t],
  );

  const cancel = useCallback(() => {
    const session = sessionRef.current;
    if (session) {
      session.cancelledByUser = true;
      session.controller.abort();
      return;
    }
    // preparing 阶段：还没有 session 可以走 cancelled 的收尾流程，直接掐断并回到表单
    if (!pendingControllerRef.current) return;
    pendingControllerRef.current.abort();
    setProgress(IDLE_PROGRESS);
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
    setProgress(sessionProgress(session, { phase: 'fetching' }));
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
  const chunk = makeChunk(rows, session.values.format, session.columns);
  session.parts.push(chunk);
  session.accumulatedChars += chunk.length;
}
