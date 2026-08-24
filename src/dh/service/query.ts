import { getPromData } from '@/components/PromGraphCpt/services';
import { getTraceServices } from '@/dh/trace';
import type { PromVectorSample } from '@/dh/trace/dependencies/promql';
import { N9E_PATHNAME } from '@/utils/constant';

import {
  applyLanguageMap,
  aggregateServiceRows,
  languageMapFromSamples,
  mergeServiceCatalog,
  uniqueRefNames,
  type ServiceRef,
  type ServiceRow,
} from './list';
import { buildGlobalEventerQueries, mergeServiceEvents, type GlobalEventQuery, type ServiceEventQuery, type ServiceEventsResult } from './events';
import { buildCatalogRedQueries, buildServiceRedQueries, buildServerRegexMatcher, escapePromLabel, mergeServiceRed, toPromRange, type ServiceOverviewResult } from './red';
import { buildTopSeriesQueries, matrixToSeries, promRangeStep, rateWindow, type NamedSeries, type PromMatrixSample } from './series';
import {
  buildSpanmetricsCatalogQueries,
  buildSpanmetricsServiceQueries,
  buildSpanmetricsTopQueries,
  pickSpanmetricsFamily,
  scaleSampleValues,
  SPANMETRICS_NAME_REGEX,
  type SpanmetricsFamily,
} from './spanmetrics';

async function queryProm(datasourceId: number, query: string, time: number): Promise<PromVectorSample[]> {
  const data = await getPromData(`/api/${N9E_PATHNAME}/proxy/${datasourceId}/api/v1/query`, { query, time });
  const result = data?.result;
  return Array.isArray(result) ? result : [];
}

async function queryPromRange(datasourceId: number, query: string, start: number, end: number, step: number): Promise<PromMatrixSample[]> {
  const data = await getPromData(`/api/${N9E_PATHNAME}/proxy/${datasourceId}/api/v1/query_range`, { query, start, end, step });
  const result = data?.result;
  return Array.isArray(result) ? result : [];
}

export type ServiceRedSource = 'spanmetrics' | 'service_graph' | 'none';

async function detectSpanmetricsFamily(datasourceId: number, time: number): Promise<SpanmetricsFamily | undefined> {
  try {
    const samples = await queryProm(datasourceId, `count by (__name__) ({__name__=~"${SPANMETRICS_NAME_REGEX}"})`, time);
    const names = samples.map((sample) => sample.metric?.__name__).filter((name): name is string => Boolean(name));
    return pickSpanmetricsFamily(names);
  } catch {
    return undefined;
  }
}

async function queryRedVectors(
  datasourceId: number,
  queries: { total: string; failed: string; p95?: string; p99?: string },
  endUnix: number,
  durationScale = 1,
): Promise<{ total: PromVectorSample[]; failed: PromVectorSample[]; p95: PromVectorSample[]; p99: PromVectorSample[] }> {
  const [total, failed, p95Raw, p99Raw] = await Promise.all([
    queryProm(datasourceId, queries.total, endUnix),
    queryProm(datasourceId, queries.failed, endUnix),
    queries.p95 ? queryProm(datasourceId, queries.p95, endUnix) : Promise.resolve([]),
    queries.p99 ? queryProm(datasourceId, queries.p99, endUnix) : Promise.resolve([]),
  ]);
  return {
    total,
    failed,
    p95: scaleSampleValues(p95Raw, durationScale),
    p99: scaleSampleValues(p99Raw, durationScale),
  };
}

/**
 * Incoming RED: spanmetrics first (service itself), then service_graph inbound. `env` narrows the
 * spanmetrics slice to the environment the list row came from; service_graph has no environment
 * dimension, so the fallback stays fleet-wide for that service.
 */
export async function fetchServiceOverview(
  datasourceId: number,
  service: string,
  startUnix: number,
  endUnix: number,
  env?: string,
): Promise<ServiceOverviewResult> {
  const rangeSeconds = Math.max(1, endUnix - startUnix);
  const range = toPromRange(rangeSeconds);
  const family = await detectSpanmetricsFamily(datasourceId, endUnix);
  if (family) {
    const vectors = await queryRedVectors(
      datasourceId,
      buildSpanmetricsServiceQueries(family, service, range, escapePromLabel, env),
      endUnix,
      family.durationScale,
    );
    const merged = mergeServiceRed({ ...vectors, rangeSeconds });
    if (!merged.empty) return merged;
  }
  const queries = buildServiceRedQueries(service, range);
  const vectors = await queryRedVectors(datasourceId, queries, endUnix);
  return mergeServiceRed({ ...vectors, rangeSeconds });
}

export interface ServiceCatalogResult {
  rows: ServiceRow[];
  promFailed: boolean;
  jaegerFailed: boolean;
  redSource: ServiceRedSource;
}

async function fetchLanguageMap(datasourceId: number, endUnix: number): Promise<Record<string, string>> {
  try {
    const samples = await queryProm(datasourceId, 'count by (server, service_name, service, telemetry_sdk_language, telemetry_sdk_language_name) (target_info)', endUnix);
    return languageMapFromSamples(samples);
  } catch {
    return {};
  }
}

/** Jaeger services ∪ Prom RED. Prefer spanmetrics; fall back to traces_service_graph_*. */
export async function fetchServiceCatalog(
  promId: number | undefined,
  jaegerId: number | undefined,
  startUnix: number,
  endUnix: number,
): Promise<ServiceCatalogResult> {
  const rangeSeconds = Math.max(1, endUnix - startUnix);
  let promRows: ServiceRow[] = [];
  let promFailed = false;
  let jaegerNames: string[] = [];
  let jaegerFailed = false;
  let redSource: ServiceRedSource = 'none';

  const tasks: Array<Promise<void>> = [];

  if (promId != null) {
    tasks.push(
      (async () => {
        try {
          const family = await detectSpanmetricsFamily(promId, endUnix);
          const range = toPromRange(rangeSeconds);
          const load = async (queries: { total: string; failed: string; p95?: string; p99?: string }, durationScale = 1) => {
            const vectors = await queryRedVectors(promId, queries, endUnix, durationScale);
            const langMap = await fetchLanguageMap(promId, endUnix);
            return applyLanguageMap(aggregateServiceRows({ ...vectors, rangeSeconds }), langMap);
          };
          if (family) {
            const spanRows = await load(buildSpanmetricsCatalogQueries(family, range), family.durationScale);
            if (spanRows.some((row) => row.hasRed)) {
              promRows = spanRows;
              redSource = 'spanmetrics';
              return;
            }
          }
          promRows = await load(buildCatalogRedQueries(range));
          redSource = promRows.some((row) => row.hasRed) ? 'service_graph' : 'none';
        } catch {
          promFailed = true;
        }
      })(),
    );
  }

  if (jaegerId != null) {
    tasks.push(
      (async () => {
        try {
          const list = await getTraceServices('jaeger', jaegerId);
          jaegerNames = list.map((item) => item.value).filter(Boolean);
        } catch {
          jaegerFailed = true;
        }
      })(),
    );
  }

  await Promise.all(tasks);
  return {
    rows: mergeServiceCatalog(jaegerNames, promRows),
    promFailed,
    jaegerFailed,
    redSource,
  };
}

export interface ServiceTopSeriesResult {
  qps: NamedSeries[];
  errorRate: NamedSeries[];
  p95: NamedSeries[];
}

export async function fetchServiceTopSeries(
  datasourceId: number,
  refs: ServiceRef[],
  startUnix: number,
  endUnix: number,
): Promise<ServiceTopSeriesResult> {
  const empty: ServiceTopSeriesResult = { qps: [], errorRate: [], p95: [] };
  const services = uniqueRefNames(refs);
  if (services.length === 0) return empty;
  const step = promRangeStep(startUnix, endUnix);
  const window = rateWindow(step);
  const family = await detectSpanmetricsFamily(datasourceId, endUnix);
  const spanQueries = family ? buildSpanmetricsTopQueries(family, services, window, buildServerRegexMatcher) : null;
  const queries = spanQueries || buildTopSeriesQueries(services, window);
  if (!queries) return empty;
  const durationScale = spanQueries && family ? family.durationScale : 1;
  try {
    const [qps, errorRate, p95Raw] = await Promise.all([
      queryPromRange(datasourceId, queries.qps, startUnix, endUnix, step),
      queryPromRange(datasourceId, queries.errorRate, startUnix, endUnix, step),
      queries.p95 ? queryPromRange(datasourceId, queries.p95, startUnix, endUnix, step) : Promise.resolve([]),
    ]);
    const p95 =
      durationScale === 1
        ? p95Raw
        : p95Raw.map((sample) => ({
            ...sample,
            values: sample.values.map(([ts, value]) => {
              const n = Number(value);
              return [ts, Number.isFinite(n) ? String(n * durationScale) : value] as [number, string];
            }),
          }));
    const series = {
      qps: matrixToSeries(qps),
      errorRate: matrixToSeries(errorRate),
      p95: matrixToSeries(p95),
    };
    if (spanQueries && series.qps.length === 0 && series.errorRate.length === 0 && series.p95.length === 0) {
      const fallback = buildTopSeriesQueries(services, window);
      if (!fallback) return empty;
      const [fqps, ferror, fp95] = await Promise.all([
        queryPromRange(datasourceId, fallback.qps, startUnix, endUnix, step),
        queryPromRange(datasourceId, fallback.errorRate, startUnix, endUnix, step),
        queryPromRange(datasourceId, fallback.p95, startUnix, endUnix, step),
      ]);
      return { qps: matrixToSeries(fqps), errorRate: matrixToSeries(ferror), p95: matrixToSeries(fp95) };
    }
    return series;
  } catch {
    return empty;
  }
}

async function settledProm(datasourceId: number, query: string, time: number): Promise<PromVectorSample[]> {
  try {
    return await queryProm(datasourceId, query, time);
  } catch {
    return [];
  }
}

async function settledPromRange(datasourceId: number, query: string, start: number, end: number, step: number): Promise<PromMatrixSample[]> {
  try {
    return await queryPromRange(datasourceId, query, start, end, step);
  } catch {
    return [];
  }
}

/** K8s events from kube-eventer counters. Missing series → empty list, not an invented API. */
export async function fetchGlobalEvents(
  datasourceId: number,
  input: GlobalEventQuery,
  startUnix: number,
  endUnix: number,
): Promise<ServiceEventsResult> {
  const rangeSeconds = Math.max(1, endUnix - startUnix);
  const range = toPromRange(rangeSeconds);
  const step = promRangeStep(startUnix, endUnix);
  const queries = buildGlobalEventerQueries(input, range);
  const rangeQueries = buildGlobalEventerQueries(input, rateWindow(step));

  const [warning, normal, warningRange, normalRange] = await Promise.all([
    queryProm(datasourceId, queries.warning, endUnix),
    settledProm(datasourceId, queries.normal, endUnix),
    settledPromRange(datasourceId, rangeQueries.warning, startUnix, endUnix, step),
    settledPromRange(datasourceId, rangeQueries.normal, startUnix, endUnix, step),
  ]);

  return {
    events: mergeServiceEvents({ warning, normal, warningRange, normalRange }),
  };
}

export async function fetchServiceEvents(
  datasourceId: number,
  input: ServiceEventQuery,
  startUnix: number,
  endUnix: number,
): Promise<ServiceEventsResult> {
  return fetchGlobalEvents(datasourceId, input, startUnix, endUnix);
}
