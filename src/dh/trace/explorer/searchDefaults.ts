import type { IRawTimeRange } from '@/components/TimeRangePicker';

/** TimeRangePicker localStorage key. Existing cached ranges are kept; first visit / cleared cache uses 15m. */
export const TRACE_SEARCH_RANGE_LS = 'n9e-dh-trace-explorer-range';
export const TRACE_SEARCH_DEFAULT_RANGE: IRawTimeRange = { start: 'now-15m', end: 'now' };

export const TRACE_SEARCH_DEFAULT_LIMIT = 100;
export const TRACE_SEARCH_MAX_LIMIT = 2000;

/** Empty / unfilled / non-numeric → 100. Does not clamp the 2000 max (the form shows an error instead). */
export function resolveNumTraces(value: unknown): number {
  if (value == null || value === '') return TRACE_SEARCH_DEFAULT_LIMIT;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return TRACE_SEARCH_DEFAULT_LIMIT;
  return n;
}
