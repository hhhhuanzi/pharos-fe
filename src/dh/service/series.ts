import { SERVICE_GRAPH_METRICS, toPromRange } from '@/dh/trace/dependencies/promql';

import { buildServerRegexMatcher, pickServiceName } from './red';

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

export function buildTopSeriesQueries(services: string[], window: string) {
  if (services.length === 0) return null;
  const matcher = buildServerRegexMatcher(services);
  return {
    qps: `sum by (server) (rate(${SERVICE_GRAPH_METRICS.total}${matcher}[${window}]))`,
    errorRate: `sum by (server) (rate(${SERVICE_GRAPH_METRICS.failed}${matcher}[${window}])) / sum by (server) (rate(${SERVICE_GRAPH_METRICS.total}${matcher}[${window}]))`,
    p95: `histogram_quantile(0.95, sum by (server, le) (rate(${SERVICE_GRAPH_METRICS.serverBucket}${matcher}[${window}])))`,
  };
}

export function matrixToSeries(samples: PromMatrixSample[]): NamedSeries[] {
  return samples
    .map((sample) => ({
      name: pickServiceName(sample.metric),
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
