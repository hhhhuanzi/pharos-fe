import { getPromData } from '@/components/PromGraphCpt/services';
import { getTraceServices } from '@/dh/trace';
import type { PromVectorSample } from '@/dh/trace/dependencies/promql';
import { N9E_PATHNAME } from '@/utils/constant';

import {
  applyLanguageMap,
  aggregateServiceRows,
  languageMapFromSamples,
  mergeServiceCatalog,
  type ServiceRow,
} from './list';
import { buildGlobalEventerQueries, mergeServiceEvents, type GlobalEventQuery, type ServiceEventQuery, type ServiceEventsResult } from './events';
import { buildCatalogRedQueries, buildServiceRedQueries, mergeServiceRed, toPromRange, type ServiceOverviewResult } from './red';
import { buildTopSeriesQueries, matrixToSeries, promRangeStep, rateWindow, type NamedSeries, type PromMatrixSample } from './series';

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

/** Incoming RED for one service from Prometheus `traces_service_graph_*` (as `server`). */
export async function fetchServiceOverview(datasourceId: number, service: string, startUnix: number, endUnix: number): Promise<ServiceOverviewResult> {
  const rangeSeconds = Math.max(1, endUnix - startUnix);
  const queries = buildServiceRedQueries(service, toPromRange(rangeSeconds));
  const [total, failed, p95, p99] = await Promise.all([
    queryProm(datasourceId, queries.total, endUnix),
    queryProm(datasourceId, queries.failed, endUnix),
    queryProm(datasourceId, queries.p95, endUnix),
    queryProm(datasourceId, queries.p99, endUnix),
  ]);
  return mergeServiceRed({ total, failed, p95, p99, rangeSeconds });
}

export interface ServiceCatalogResult {
  rows: ServiceRow[];
  promFailed: boolean;
  jaegerFailed: boolean;
}

async function fetchLanguageMap(datasourceId: number, endUnix: number): Promise<Record<string, string>> {
  try {
    const samples = await queryProm(datasourceId, 'count by (server, service_name, service, telemetry_sdk_language, telemetry_sdk_language_name) (target_info)', endUnix);
    return languageMapFromSamples(samples);
  } catch {
    return {};
  }
}

/** Jaeger services ∪ Prom servers, with fleet-wide RED when `traces_service_graph_*` exists. */
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

  const tasks: Array<Promise<void>> = [];

  if (promId != null) {
    tasks.push(
      (async () => {
        try {
          const queries = buildCatalogRedQueries(toPromRange(rangeSeconds));
          const [total, failed, p95, p99, langMap] = await Promise.all([
            queryProm(promId, queries.total, endUnix),
            queryProm(promId, queries.failed, endUnix),
            queryProm(promId, queries.p95, endUnix),
            queryProm(promId, queries.p99, endUnix),
            fetchLanguageMap(promId, endUnix),
          ]);
          promRows = applyLanguageMap(aggregateServiceRows({ total, failed, p95, p99, rangeSeconds }), langMap);
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
  };
}

export interface ServiceTopSeriesResult {
  qps: NamedSeries[];
  errorRate: NamedSeries[];
  p95: NamedSeries[];
}

export async function fetchServiceTopSeries(
  datasourceId: number,
  services: string[],
  startUnix: number,
  endUnix: number,
): Promise<ServiceTopSeriesResult> {
  const empty: ServiceTopSeriesResult = { qps: [], errorRate: [], p95: [] };
  if (services.length === 0) return empty;
  const step = promRangeStep(startUnix, endUnix);
  const queries = buildTopSeriesQueries(services, rateWindow(step));
  if (!queries) return empty;
  const [qps, errorRate, p95] = await Promise.all([
    queryPromRange(datasourceId, queries.qps, startUnix, endUnix, step),
    queryPromRange(datasourceId, queries.errorRate, startUnix, endUnix, step),
    queryPromRange(datasourceId, queries.p95, startUnix, endUnix, step),
  ]);
  return {
    qps: matrixToSeries(qps),
    errorRate: matrixToSeries(errorRate),
    p95: matrixToSeries(p95),
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
