import type { IRawTimeRange } from '@/components/TimeRangePicker';

/** Topology always queries this window. No picker, no localStorage. */
export const GRAPH_FIXED_RANGE: IRawTimeRange = { start: 'now-1h', end: 'now' };
