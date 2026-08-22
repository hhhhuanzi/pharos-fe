import type { PromMatrixSample } from '../series';

export interface MonitoringRangeQuery {
  refId: string;
  query: string;
}

export interface MonitoringInstantQuery {
  refId: string;
  query: string;
}

export interface MonitoringSeries {
  metric: Record<string, string>;
  points: Array<[number, number]>;
}

/** One entry per requested query, in request order, so callers map results back positionally. */
export interface MonitoringQueryResult {
  refId: string;
  series: MonitoringSeries[];
}

export interface MonitoringRangeBatchPayload {
  datasource_id: number;
  queries: Array<{ refId: string; query: string; start: number; end: number; step: number }>;
}

export interface MonitoringInstantBatchPayload {
  datasource_id: number;
  queries: Array<{ refId: string; query: string; time: number }>;
}

interface PromVectorSampleLike {
  metric?: Record<string, string>;
  value?: [number | string, number | string];
}

export function buildRangeBatchPayload(datasourceId: number, queries: MonitoringRangeQuery[], startUnix: number, endUnix: number, step: number): MonitoringRangeBatchPayload {
  return {
    datasource_id: datasourceId,
    queries: queries.map((item) => ({ refId: item.refId, query: item.query, start: startUnix, end: endUnix, step })),
  };
}

export function buildInstantBatchPayload(datasourceId: number, queries: MonitoringInstantQuery[], timeUnix: number): MonitoringInstantBatchPayload {
  return {
    datasource_id: datasourceId,
    queries: queries.map((item) => ({ refId: item.refId, query: item.query, time: timeUnix })),
  };
}

export function matrixToMonitoringSeries(samples: unknown): MonitoringSeries[] {
  if (!Array.isArray(samples)) return [];
  return (samples as PromMatrixSample[])
    .map((sample) => ({
      metric: sample?.metric || {},
      points: (sample?.values || [])
        .map(([ts, value]) => [Number(ts), Number(value)] as [number, number])
        .filter(([ts, value]) => Number.isFinite(ts) && Number.isFinite(value)),
    }))
    .filter((series) => series.points.length > 0);
}

export function vectorToMonitoringSeries(samples: unknown): MonitoringSeries[] {
  if (!Array.isArray(samples)) return [];
  return (samples as PromVectorSampleLike[])
    .map((sample) => {
      const ts = Number(sample?.value?.[0]);
      const value = Number(sample?.value?.[1]);
      if (!Number.isFinite(ts) || !Number.isFinite(value)) return undefined;
      return { metric: sample?.metric || {}, points: [[ts, value] as [number, number]] };
    })
    .filter((series): series is MonitoringSeries => Boolean(series));
}

/** `query-range-batch` answers positionally, so results are zipped back onto the requested refIds. */
export function zipRangeBatchResult(queries: MonitoringRangeQuery[], dat: unknown): MonitoringQueryResult[] {
  const slots = Array.isArray(dat) ? dat : [];
  return queries.map((item, idx) => ({ refId: item.refId, series: matrixToMonitoringSeries(slots[idx]) }));
}

export function zipInstantBatchResult(queries: MonitoringInstantQuery[], dat: unknown): MonitoringQueryResult[] {
  const slots = Array.isArray(dat) ? dat : [];
  return queries.map((item, idx) => ({ refId: item.refId, series: vectorToMonitoringSeries(slots[idx]) }));
}
