import { toPromRange } from '@/dh/trace/dependencies/promql';

import { pickServiceEnv, pickServiceName, serviceKey } from './red';

export interface PromMatrixSample {
  metric: Record<string, string>;
  values: Array<[number, string]>;
}

export interface NamedSeries {
  name: string;
  points: Array<[number, number]>;
}

export function promRangeStep(startUnix: number, endUnix: number): number {
  const span = Math.max(1, endUnix - startUnix);
  return Math.max(15, Math.ceil(span / 240));
}

export function rateWindow(stepSeconds: number): string {
  return toPromRange(Math.max(60, stepSeconds * 4));
}

/** PromQL `A / B` drops series that only exist on B. Fill zeros so services with no errors still appear. */
export function buildPromRatio(numerator: string, denominator: string): string {
  return `(${numerator} or (${denominator} * 0)) / ${denominator}`;
}

/** Series name is the row key, so two environments of one service draw as two lines. */
export function matrixToSeries(samples: PromMatrixSample[]): NamedSeries[] {
  return samples
    .map((sample) => ({
      name: serviceKey(pickServiceName(sample.metric), pickServiceEnv(sample.metric)),
      points: (sample.values || [])
        .map(([ts, value]) => [Number(ts), Number(value)] as [number, number])
        .filter(([, value]) => Number.isFinite(value)),
    }))
    .filter((series) => series.name && series.points.length > 0);
}

export function filterSeriesByNames(series: NamedSeries[], names: string[]): NamedSeries[] {
  const byName = new Map(series.map((item) => [item.name, item]));
  return names.reduce<NamedSeries[]>((acc, name) => {
    const item = byName.get(name);
    if (item) acc.push(item);
    return acc;
  }, []);
}

const ERROR_RATE_Y_FLOORS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1] as const;

/**
 * Error-rate / throttling values are ratios (0–1). uPlot's default scale is 0–100 when every
 * point is 0; `formatErrorRate` then paints the axis as 10000%. Pass the result through
 * `scalesBuilder({ yRange: [0, errorRateYMax(values)] })` — `yMinMax` does not lock auto-range.
 */
export function errorRateYMax(values: Array<number | null | undefined>): number {
  let max = 0;
  values.forEach((value) => {
    if (typeof value === 'number' && Number.isFinite(value) && value > max) max = value;
  });
  if (max <= 0) return 0.01;
  const padded = max * 1.1;
  if (max > 1) return padded;
  return ERROR_RATE_Y_FLOORS.find((step) => step >= padded) ?? 1;
}

/** First-seen service names get a stable palette index so multiple charts share colors. */
export function assignServiceColors(names: string[], palette: string[]): Record<string, string> {
  const colors: Record<string, string> = {};
  if (palette.length === 0) return colors;
  let next = 0;
  names.forEach((name) => {
    if (!name || colors[name] != null) return;
    colors[name] = palette[next % palette.length];
    next += 1;
  });
  return colors;
}

/** Map a chart's series labels through the shared name→color table. Missing names keep a palette fallback. */
export function colorsForSeries(labels: string[], colorByName: Record<string, string>, palette: string[]): string[] {
  if (palette.length === 0) return labels.map((label) => colorByName[label] ?? '');
  return labels.map((label, idx) => colorByName[label] ?? palette[idx % palette.length]);
}

export function alignServiceSeries(series: NamedSeries[]): {
  times: number[];
  frames: [number[], ...Array<Array<number | null>>];
  labels: string[];
} {
  const timeSet = new Set<number>();
  series.forEach((item) => {
    item.points.forEach(([ts]) => timeSet.add(ts));
  });
  const times = Array.from(timeSet).sort((a, b) => a - b);
  const index = new Map(times.map((ts, i) => [ts, i]));
  const values = series.map((item) => {
    const row: Array<number | null> = times.map(() => null);
    item.points.forEach(([ts, value]) => {
      const i = index.get(ts);
      if (i != null) row[i] = value;
    });
    return row;
  });
  return {
    times,
    frames: [times, ...values],
    labels: series.map((item) => item.name),
  };
}
