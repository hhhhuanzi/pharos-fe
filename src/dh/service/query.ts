import { getPromData } from '@/components/PromGraphCpt/services';
import { getTraceServices } from '@/dh/trace';
import type { PromVectorSample } from '@/dh/trace/dependencies/promql';
import { N9E_PATHNAME } from '@/utils/constant';

import {
  applyLanguageMap,
  aggregateServiceRows,
  filterInstrumentedRows,
  languageMapFromSamples,
  mergeServiceCatalog,
  uniqueRefNames,
  type ServiceRef,
  type ServiceRow,
} from './list';
import { buildGlobalEventerQueries, mergeServiceEvents, type GlobalEventQuery, type ServiceEventQuery, type ServiceEventsResult } from './events';
import { quantilesFromBucketVector } from './histogramQuantile';
import { buildServiceRegexMatcher, escapePromLabel, mergeServiceRed, RED_QUANTILES, toPromRange, type RedQuerySet, type ServiceOverviewResult } from './red';
import { matrixToSeries, promRangeStep, rateWindow, type NamedSeries, type PromMatrixSample } from './series';
import { buildSpanmetricsCatalogQueries, buildSpanmetricsServiceQueries, buildSpanmetricsTopQueries, scaleMatrixValues, scaleSampleValues } from './spanmetrics';
import { detectSpanmetricsFamily } from './spanmetricsProbe';

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

/**
 * Node-level RED comes from spanmetrics alone. `traces_service_graph_*` is edge-level and stays
 * with the topology: its `_request_failed_total` has no series on any real-service edge, its edge
 * counts are dominated by synthesized `client="user"` nodes, and both diverge from the spanmetrics
 * numbers by one to two orders of magnitude — so using it to refill these columns showed wrong
 * values under a healthy-looking green `0.00%`.
 */
export type ServiceRedSource = 'spanmetrics' | 'none';

interface RedQuantileVectors {
  p95: PromVectorSample[];
  p99: PromVectorSample[];
}

interface RedVectors extends RedQuantileVectors {
  total: PromVectorSample[];
  failed: PromVectorSample[];
}

/** Turn one cumulative-bucket vector into the P95 / P99 vectors `histogram_quantile` would return. */
function splitQuantiles(buckets: PromVectorSample[], durationScale: number): RedQuantileVectors {
  const [p95, p99] = quantilesFromBucketVector(buckets, RED_QUANTILES);
  return {
    p95: scaleSampleValues(p95, durationScale),
    p99: scaleSampleValues(p99, durationScale),
  };
}

/**
 * The bucket query is far heavier than the two counter queries — fleet-wide spanmetrics buckets
 * run ~15s against Thanos while the counters answer in ~1s. Letting it settle on its own keeps a
 * slow histogram from discarding counts, service names, environment and language that already came
 * back; P95 / P99 then render as `—`, which is what "we could not measure it" should look like.
 */
async function queryRedVectors(datasourceId: number, queries: RedQuerySet, endUnix: number, durationScale = 1): Promise<RedVectors> {
  const [total, failed, buckets] = await Promise.all([
    queryProm(datasourceId, queries.total, endUnix),
    queryProm(datasourceId, queries.failed, endUnix),
    queries.quantileBuckets ? settledProm(datasourceId, queries.quantileBuckets, endUnix) : Promise.resolve<PromVectorSample[]>([]),
  ]);
  return { total, failed, ...splitQuantiles(buckets, durationScale) };
}

/**
 * Incoming RED plus the cluster / namespace association for one service, from spanmetrics. `env`
 * narrows the slice to the environment the list row was opened from. A failed query rejects so the
 * caller can show an error rather than numbers taken from somewhere else.
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
  if (!family) return { association: { clusters: [], namespaces: [] }, empty: true };
  const queries = buildSpanmetricsServiceQueries(family, service, range, escapePromLabel, env);
  const vectors = await queryRedVectors(datasourceId, queries, endUnix, family.durationScale);
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
    const samples = await queryProm(datasourceId, 'count by (service_name, service, exported_job, telemetry_sdk_language, telemetry_sdk_language_name) (target_info)', endUnix);
    return languageMapFromSamples(samples);
  } catch {
    return {};
  }
}

/** Jaeger services ∪ spanmetrics RED. */
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
  /** Names spanmetrics showed to have no SDK language; the Jaeger union must not re-add them. */
  let nonInstrumented: string[] = [];

  const tasks: Array<Promise<void>> = [];

  if (promId != null) {
    tasks.push(
      (async () => {
        try {
          const family = await detectSpanmetricsFamily(promId, endUnix);
          /** No spanmetrics in this Prometheus: the catalog still lists Jaeger's services, with every RED cell blank. */
          if (!family) return;
          const range = toPromRange(rangeSeconds);
          const [vectors, langMap] = await Promise.all([
            queryRedVectors(promId, buildSpanmetricsCatalogQueries(family, range), endUnix, family.durationScale),
            /** One fleet-wide `target_info` scan per catalog load; it only fills languages the RED vector lacks. */
            fetchLanguageMap(promId, endUnix),
          ]);
          const instrumented = filterInstrumentedRows(applyLanguageMap(aggregateServiceRows({ ...vectors, rangeSeconds }), langMap));
          promRows = instrumented.rows;
          nonInstrumented = instrumented.excluded;
          redSource = promRows.some((row) => row.hasRed) ? 'spanmetrics' : 'none';
        } catch {
          /** RED has no second source, so a failed query has to reach the page as an error. */
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
  const suppressed = new Set(nonInstrumented);
  return {
    rows: mergeServiceCatalog(
      jaegerNames.filter((name) => !suppressed.has(name)),
      promRows,
    ),
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
  if (!family) return empty;
  const queries = buildSpanmetricsTopQueries(family, services, window, buildServiceRegexMatcher);
  if (!queries) return empty;

  const [qps, errorRate, p95Raw] = await Promise.all([
    queryPromRange(datasourceId, queries.qps, startUnix, endUnix, step),
    queryPromRange(datasourceId, queries.errorRate, startUnix, endUnix, step),
    /** A calls-only family exports no histogram, so the P95 chart simply has no series to draw. */
    queries.p95 ? queryPromRange(datasourceId, queries.p95, startUnix, endUnix, step) : Promise.resolve<PromMatrixSample[]>([]),
  ]);

  return {
    qps: matrixToSeries(qps),
    errorRate: matrixToSeries(errorRate),
    p95: matrixToSeries(scaleMatrixValues(p95Raw, family.durationScale)),
  };
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
