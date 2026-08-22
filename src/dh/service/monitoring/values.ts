import type { MonitoringSeries } from './query';

export type MonitoringReduce = 'last' | 'sumLast' | 'maxLast';

export function lastPointValue(series: MonitoringSeries | undefined): number | undefined {
  if (!series || series.points.length === 0) return undefined;
  const value = series.points[series.points.length - 1][1];
  return Number.isFinite(value) ? value : undefined;
}

/** Collapse one Prom query (possibly many series) into a single number for a stat card. */
export function reduceSeries(series: MonitoringSeries[], reduce: MonitoringReduce = 'last'): number | undefined {
  if (!series.length) return undefined;
  if (reduce === 'last' && series.length === 1) return lastPointValue(series[0]);
  const mode = reduce === 'last' ? 'sumLast' : reduce;
  if (mode === 'maxLast') {
    let max = -Infinity;
    series.forEach((item) => {
      const value = lastPointValue(item);
      if (value != null && value > max) max = value;
    });
    return max === -Infinity ? undefined : max;
  }
  let sum = 0;
  let hasValue = false;
  series.forEach((item) => {
    const value = lastPointValue(item);
    if (value == null) return;
    sum += value;
    hasValue = true;
  });
  return hasValue ? sum : undefined;
}
