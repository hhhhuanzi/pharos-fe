import type { TracePluginType } from '@/dh/trace';

/** i18n namespace，locale 目录会被 src/i18n.ts 自动扫描 */
export const NS = 'dhLogTrace';

/**
 * 日志跳转链路时可选的数据源类型。本期只做 Jaeger；
 * 以后支持 SkyWalking 只需在这里加一项，其余按 cate 过滤的逻辑不用动。
 */
export const LOG_TRACE_TARGET_CATES: TracePluginType[] = ['jaeger'];

/** 前端本地配置存放位置，暂不落库；结构见 config.ts 的 LogTraceConfig */
export const CONFIG_STORAGE_KEY = 'n9e-dh-log-trace-config';

export const TRACE_EXPLORER_PATH = '/trace/explorer';

/**
 * 默认识别为链路 ID 的字段名候选。
 * 比较时会忽略大小写与 `_` `-` `.`，所以 trace_id / traceId / traceID / trace.id 只需列一个。
 */
export const DEFAULT_TRACE_ID_FIELDS = ['trace_id', 'otel.trace_id', 'dd.trace_id', 'x-b3-traceid'];

/** 明显不是链路 ID 的占位值，出现时不给跳转入口 */
export const TRACE_ID_PLACEHOLDER_VALUES = ['-', 'null', 'nil', 'none', 'unknown', 'n/a', '0'];

export const TRACE_ID_MIN_LENGTH = 8;
export const TRACE_ID_MAX_LENGTH = 200;
