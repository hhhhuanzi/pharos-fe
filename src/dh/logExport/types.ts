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
  /**
   * 本次查询结果样本中实际出现过的叶子字段路径，来自 `src/dh/fieldsSidebar/resultFieldsStore`
   * （与侧边栏「可用字段/空字段」分组同一份数据）。undefined 表示暂无样本（如页面还没查询出结果）。
   *
   * 用途：勾选「全部字段」导出时，用它代替整份 `_mapping` 作为 `_source` 白名单——
   * 宽索引（如跨多个 pod、多种日志格式的 `k8s-pod*`）的 mapping 字段是所有文档字段的并集，
   * 远超单条日志实际拥有的字段数；用当前查询结果样本能显著收窄导出体积与列数。
   */
  resultFields?: string[];
  /**
   * 当前索引 mapping 的完整字段名列表，来自 `src/dh/fieldsSidebar/indexFieldsStore`
   * （与侧边栏 `FieldsList` 渲染「常用字段/可用字段」用的是同一个数组）。undefined
   * 表示还没有侧栏发布过（如宿主页面没有接入字段侧栏，或侧栏 mapping 还在加载中）。
   *
   * 用途：`resolveDefaultColumns()` 算「常用字段」默认列时优先用它作候选字段集合，
   * 不再自己另发一次 `_mapping` 请求、另用一套解析函数——避免两条独立链路各自解析
   * 同一份响应却算出不同结果（历史上出过至少两轮这类不一致）。只有它不可用时才退回
   * `getFields()` 兜底。
   */
  indexFields?: string[];
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
  /**
   * 只需要这些字段（ES 侧转成 `_source` 白名单）。
   * `undefined` 表示需要完整文档 —— JSONL / 原始文本，或勾了「全部字段」却拿不到
   * 结果样本时（见 resolveSourceFields）。
   */
  sourceFields?: string[];
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
  /** 本批命中 `guardRowValueSize` 截断上限的字段值个数，供 UI 提示「有字段被截断」 */
  truncatedCells?: number;
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
  /** CSV 默认强制包含的字段；仅用于默认列计算，不影响 raw/jsonl */
  csvPresetColumns: string[];
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
  /**
   * 本次导出实际采用的策略，`prepare()` 返回后才有值。
   *
   * UI 拿它做「进度呈现分档」的唯一判断依据：`from_size`（≤1 万条，通常几秒）走无感
   * 直接下载，`pit_search_after`（大额，分钟级）才展示进度面板。用它而不是用用户填的
   * 条数，是因为「请求 10 万条但 PIT 不可用而降级到 1 万条」这种情况必须算小额。
   */
  strategy?: ExportStrategy;
  fetched: number;
  /**
   * 【展示用】进度条分母、剩余时间预估的基准。
   *
   * 首批响应之前（`total` 还未知）等于请求条数（架构上限，如 10 万）——这是唯一能用的
   * 分母，但通常远大于真实命中数，UI 应避免据此展示一个看起来精确、实则注定要跳变的
   * 百分比（见 `LogExportModal.tsx` 的 `totalUnknown` 判断）。首批响应之后自动收窄为
   * `min(请求条数, total)`：真实命中数一旦已知，就没理由再让用户盯着一个不可能达到的
   * 分母。只会在首批返回时单向收窄一次（`total` 之后不再变化），不会导致百分比倒退。
   */
  target: number;
  /**
   * 查询命中总数。首批响应前为 `undefined`（还不知道），此后固定不变——ES 只在首批
   * `track_total_hits: true` 时返回它，本身就是免费拿到的信息，不需要额外探测请求。
   */
  total?: number;
  /** 已累计写入 parts[] 的字符数，用于字节闸门与「已生成 xx MB」的展示 */
  accumulatedChars: number;
  /** 累计有多少个字段值命中 MAX_CELL_CHARS 被截断（异常巨大的单值，如整段 stack trace） */
  truncatedCells?: number;
  /** 停止原因，决定完成提示的文案 */
  stopReason?: StopReason;
  errorMessage?: string;
  /**
   * 进度区的临时提示，如「本批超时，已把批大小降到 2500 条重试」。
   * 有它是因为自动缩批重试期间进度数字不动，不解释一句就和「卡死」长得一模一样。
   */
  notice?: string;
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
