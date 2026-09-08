import { errorRateTone } from '@/dh/status';
import { formatDuration } from '@/pages/traceCpt/utils/date';

export function formatQps(qps?: number): string {
  if (qps == null || !Number.isFinite(qps)) return '—';
  if (qps >= 100) return qps.toFixed(0);
  if (qps >= 1) return qps.toFixed(1);
  return qps.toFixed(2);
}

export function formatErrorRate(rate?: number): string {
  if (rate == null || !Number.isFinite(rate)) return '—';
  return `${(rate * 100).toFixed(rate >= 0.1 ? 1 : 2)}%`;
}

/**
 * Kept as the list's local name for the colour, but the scale itself lives in `@/dh/status` so the
 * list, the monitoring tab, the dependency graph and the node drawer cannot drift apart.
 */
export function errorRateClass(rate?: number): string {
  return errorRateTone(rate);
}

export function formatLatency(seconds?: number): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  return formatDuration(Math.round(seconds * 1e6));
}

export function formatCount(n?: number): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString();
}

export function formatLanguage(value?: string): string {
  return value?.trim() || '—';
}
