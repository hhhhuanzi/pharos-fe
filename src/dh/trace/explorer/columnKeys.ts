/**
 * Instant-query table columns, left to right.
 * `logs` is `fixed: 'right'` so it stays pinned while the other columns scroll.
 */
export const TRACE_LIST_COLUMN_KEYS = [
  'startTimeUs',
  'traceId',
  'rootInterface',
  'errorSpanCount',
  'durationUs',
  'rootService',
  'rootType',
  'spanCount',
  'logs',
] as const;

export type TraceListColumnKey = (typeof TRACE_LIST_COLUMN_KEYS)[number];
