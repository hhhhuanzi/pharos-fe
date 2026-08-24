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

export function errorRateClass(rate?: number): string {
  if (rate == null) return 'text-soft';
  if (rate >= 0.05) return 'text-error';
  if (rate >= 0.01) return 'text-warning';
  return 'text-success';
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

/** Blank for services whose RED comes from service_graph, which has no environment dimension. */
export function formatEnv(value?: string): string {
  return value?.trim() || '—';
}
