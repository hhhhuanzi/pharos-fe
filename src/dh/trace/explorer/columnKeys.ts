/**
 * Instant-query table columns, left to right.
 * `logs` is `fixed: 'right'` so it stays pinned while the other columns scroll.
 */
export const TRACE_LIST_COLUMN_KEYS = [
  'startTimeUs',
  'traceId',
  'rootInterface',
  'rootType',
  'errorSpanCount',
  'durationUs',
  'spanCount',
  'rootService',
  // 紧挨「服务」：环境是服务的限定语，两列分开看容易把不同环境的同名服务当成同一个。
  'envs',
  'logs',
] as const;

export type TraceListColumnKey = (typeof TRACE_LIST_COLUMN_KEYS)[number];
