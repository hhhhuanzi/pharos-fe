import { TraceByIdParams, TracePluginType, TraceSearchParams, UnifiedServiceOption, TracePageResult } from './types';
import { PharosTraceListResult, PharosTraceSummary, traceResponseToSummary } from './contract';
import type { TraceResponse } from '@/pages/traceCpt/type';
import * as jaeger from './adapters/jaeger';
import * as skywalking from './adapters/skywalking';
import * as otel from './adapters/otel';

export type { TracePluginType, TraceSearchParams, TraceByIdParams, UnifiedServiceOption, TracePageResult };

/** Visible cate options in Trace explorer (OTel reserved for later). */
export const TRACING_PLUGIN_TYPES: Array<{ label: string; value: TracePluginType }> = [
  { label: 'Jaeger', value: 'jaeger' },
  { label: 'SkyWalking', value: 'skywalking' },
];

export async function getTraceServices(pluginType: TracePluginType, dataSourceId: number, range?: { start: number; end: number }): Promise<UnifiedServiceOption[]> {
  if (pluginType === 'skywalking') {
    const end = range?.end ?? Date.now();
    const start = range?.start ?? end - 12 * 60 * 60 * 1000;
    // Select value already carries the SW service id, so no extra id field is needed.
    return skywalking.getSkyWalkingServices(dataSourceId, start, end);
  }
  if (pluginType === 'otel') {
    return otel.getOtelServices(dataSourceId);
  }
  return jaeger.getJaegerServices(dataSourceId);
}

export async function getTraceOperations(pluginType: TracePluginType, dataSourceId: number, service: string, range?: { start: number; end: number }): Promise<string[]> {
  if (pluginType === 'skywalking') {
    // `service` is already the SW service id (Select value).
    return skywalking.getSkyWalkingOperations(dataSourceId, service);
  }
  if (pluginType === 'otel') {
    return otel.getOtelOperations(dataSourceId, service);
  }
  return jaeger.getJaegerOperations(dataSourceId, service);
}

/** Instance-level query is only meaningful where the backend can filter traces by instance (currently SkyWalking). Others return []. */
export async function getTraceInstances(
  pluginType: TracePluginType,
  dataSourceId: number,
  service: string,
  range?: { start: number; end: number },
): Promise<UnifiedServiceOption[]> {
  if (pluginType === 'skywalking' && service) {
    const end = range?.end ?? Date.now();
    const start = range?.start ?? end - 12 * 60 * 60 * 1000;
    return skywalking.getSkyWalkingInstances(dataSourceId, service, start, end);
  }
  return [];
}

export async function searchTraces(params: TraceSearchParams) {
  if (params.plugin_type === 'skywalking') {
    return skywalking.searchSkyWalkingTraces(params);
  }
  if (params.plugin_type === 'otel') {
    return otel.searchOtelTraces(params);
  }
  return jaeger.searchJaegerTraces(params);
}

/**
 * Paginated full-trace list for datasources that expose a cheap list query (SkyWalking): one page of
 * trace ids -> per-trace full fetch. Jaeger keeps its one-shot full-trace search via `searchTraces`,
 * so this only serves SkyWalking.
 */
export async function searchTracesPaged(params: TraceSearchParams): Promise<TracePageResult> {
  if (params.plugin_type === 'skywalking') {
    return skywalking.searchSkyWalkingTracesPaged(params);
  }
  return { traces: [], hasMore: false };
}

/** Default list depth when the form does not pass `num_traces`. */
export const TRACE_LIST_SUMMARY_LIMIT = 100;
/** SkyWalking pages full traces per row; keep the default page smaller (P-46). */
export const TRACE_LIST_FULL_LIMIT = 20;

function toSummaries(responses: TraceResponse[]): PharosTraceSummary[] {
  return responses.reduce<PharosTraceSummary[]>((acc, res) => {
    const summary = traceResponseToSummary(res);
    if (summary) acc.push(summary);
    return acc;
  }, []);
}

/**
 * Pharos list API. UI reads `PharosTraceSummary` only (`rootType` is the 类型 column).
 *
 * Jaeger rows are mapped through `traceResponseToSummary` so `rootType` is filled from span
 * tags (`messaging.system` → mq, HTTP → web, SQL → sql). Do not use a tag-less summary
 * mapper here — that left `process` as —. One search, not N get-by-id.
 */
export async function searchTraceSummaries(params: TraceSearchParams): Promise<PharosTraceListResult> {
  if (params.plugin_type === 'skywalking') {
    const limit = params.num_traces || TRACE_LIST_FULL_LIMIT;
    // SkyWalking pages its list query; the table shows one page and relies on the truncation hint
    // plus the form's "result count" field rather than an incremental "load more".
    const page = await skywalking.searchSkyWalkingTracesPaged({ ...params, page_num: 1, page_size: limit });
    return { summaries: toSummaries(page.traces), source: 'full-traces', truncated: page.hasMore };
  }
  const limit = params.num_traces || TRACE_LIST_SUMMARY_LIMIT;
  const traces = await searchTraces({ ...params, num_traces: limit });
  return { summaries: toSummaries(traces), source: 'full-traces', truncated: traces.length >= limit };
}

/** Pharos API this round: get-by-id only (`/api/v3/traces/{id}` / SW `queryTrace`). No extra endpoints. */
export async function getTraceByID(params: TraceByIdParams) {
  if (params.plugin_type === 'skywalking') {
    return skywalking.getSkyWalkingTraceById(params);
  }
  if (params.plugin_type === 'otel') {
    return otel.getOtelTraceById(params);
  }
  return jaeger.getJaegerTraceById(params);
}

export async function getTraceDependencies(pluginType: TracePluginType, dataSourceId: number) {
  if (pluginType === 'jaeger') {
    return jaeger.getJaegerDependencies(dataSourceId);
  }
  return [];
}
