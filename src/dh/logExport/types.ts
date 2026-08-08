import { DatasourceCateEnum } from '@/utils/constant';
import { IRawTimeRange } from '@/components/TimeRangePicker/types';

export type ExportFormat = 'csv' | 'jsonl' | 'raw';

/** 分批拉取的策略，由 adapter 自行选定，仅用于审计埋点与 UI 提示 */
export type ExportStrategy = 'from_size' | 'offset' | 'time_cursor' | 'pit_search_after';

/** 一批日志行。key 为字段名，value 可能是任意 JSON 值 */
export type LogRow = Record<string, unknown>;

/** 导出上下文：由 LogExportMenuItem 从 antd Form context 组装后交给 adapter */
export interface LogExportContext {
  cate: DatasourceCateEnum;
  datasourceId: number;
  datasourceName: string;
  /** 已冻结的绝对时间范围（毫秒），adapter 不得再解析相对时间 */
  start: number;
  end: number;
  /** 原始相对时间范围，仅用于文件名与审计回显 */
  rawRange?: IRawTimeRange;
  /** 数据源相关的查询条件原样透传，adapter 各自解释 */
  query: Record<string, unknown>;
  /** 排序方向，继承页面当前设置 */
  reverse: boolean;
}

/** adapter.fetchPage 的入参 */
export interface FetchPageParams {
  ctx: LogExportContext;
  /** 已经取到的条数，用于 from / offset 计算 */
  fetched: number;
  /** 本批想取多少条（末批可能小于 BATCH_SIZE_TIER1 / BATCH_SIZE_TIER2） */
  size: number;
  /** 上一批返回的游标，首批为 undefined */
  cursor?: unknown;
  signal: AbortSignal;
}

/** adapter.fetchPage 的出参 */
export interface FetchPageResult {
  rows: LogRow[];
  /** 传给下一批的游标；不需要游标的策略返回 undefined */
  cursor?: unknown;
  /** 查询命中的总条数；拿不到时为 undefined（用于「共命中 N 条」提示） */
  total?: number;
  /** 为 true 表示后端已无更多数据，即使还没取够 requestedRows 也应停止 */
  exhausted?: boolean;
}

export interface LogExportPrepareResult {
  strategy: ExportStrategy;
  /** 实际可导出的上限，可能小于 requestedRows（如 PIT 建立失败降级） */
  effectiveMaxRows: number;
  /** 策略私有状态，会原样传回 fetchPage / cleanup */
  state?: unknown;
  /** 非空时 UI 需要弹出确认（如「已降级为 1 万条」） */
  downgradeReason?: 'es_version_too_low' | 'pit_unsupported';
}

export interface LogExportAdapter {
  cate: DatasourceCateEnum;
  /** 原始日志正文字段名，供 format='raw' 使用 */
  rawKey: string;
  /** 本 adapter 在给定条数下能用的最大值。ES 在支持 PIT 时返回 MAX_ROWS_TIER2 */
  getMaxRows: (ctx: LogExportContext) => Promise<number>;
  /** 决定本次导出用哪种策略；可能需要一次探测请求（如建 PIT） */
  prepare: (ctx: LogExportContext, requestedRows: number, signal: AbortSignal) => Promise<LogExportPrepareResult>;
  fetchPage: (params: FetchPageParams & { state?: unknown }) => Promise<FetchPageResult>;
  /** 释放策略资源（如 DELETE _pit）。失败只 warn，不影响导出结果 */
  cleanup?: (ctx: LogExportContext, state?: unknown) => Promise<void>;
  /** 从 query 里提炼一个短标识用于文件名，如 ES 的 index 名 */
  getQueryDigest: (ctx: LogExportContext) => string;
}

/** 弹窗表单的值 */
export interface LogExportFormValues {
  format: ExportFormat;
  rows: number;
  /** format='csv' 时生效；其余格式导出完整文档 */
  columns: string[];
  /** 勾选后忽略 columns，取首批出现过的全部字段 */
  allFields: boolean;
}

export type ExportPhase = 'idle' | 'preparing' | 'fetching' | 'assembling' | 'done' | 'failed' | 'cancelled';

export type StopReason = 'target' | 'exhausted' | 'byte_limit';

export interface ExportProgress {
  phase: ExportPhase;
  fetched: number;
  /** 目标条数（clamp 之后） */
  target: number;
  /** 查询命中总数，可能为 undefined */
  total?: number;
  /** 已累计写入 parts[] 的字符数，用于字节闸门与「已生成 xx MB」的展示 */
  accumulatedChars: number;
  /** 停止原因，决定完成提示的文案 */
  stopReason?: StopReason;
  errorMessage?: string;
  /** 首批完成后的实测速率（条/毫秒），用于估算剩余时间 */
  rate?: number;
  startedAt?: number;
}

/** POST /api/n9e/dh/log-export/record 的请求体 */
export interface LogExportRecordRequest {
  /** 'start' 在拉取开始前发；'finish' 在结束（成功/失败/取消）后发 */
  phase: 'start' | 'finish';
  cate: string;
  datasource_id: number;
  datasource_name: string;
  /** ES 为 index 名；其余为空串 */
  index: string;
  /** 查询语句原文，服务端截断落库 */
  query: string;
  /** 已冻结的绝对时间范围，毫秒 */
  start: number;
  end: number;
  format: ExportFormat;
  strategy: ExportStrategy;
  /** phase='start' 时为用户请求的条数 */
  expect_rows: number;
  /** CSV 导出的列；其它格式为空数组 */
  fields: string[];

  /** 以下仅 phase='finish' 时有值 */
  actual_rows?: number;
  status?: 'success' | 'failed' | 'cancelled';
  /** 停止原因，用于统计「字节闸门拦人的比例」，决定要不要启动 T3 后端流式 */
  stop_reason?: StopReason;
  /** 实际输出字节数，用于容量观测 */
  output_bytes?: number;
  /** status='failed' 时的错误摘要，前端自行截断到 200 字符 */
  error?: string;
  /** 从 start 到 finish 的耗时（毫秒） */
  duration_ms?: number;
}

export interface LogExportRecordResponse {
  max_rows: number;
}
