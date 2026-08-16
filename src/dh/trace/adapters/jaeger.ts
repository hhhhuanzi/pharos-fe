/**
 * Jaeger adapter.
 *
 * Talks to Jaeger's Stable `/api/v3/*` JSON API (gRPC-gateway over `jaeger.api_v3.QueryService`,
 * see https://www.jaegertracing.io/docs/2.20/apis/#query-json-over-http and
 * https://github.com/jaegertracing/jaeger-idl/blob/main/proto/api_v3/query_service.proto),
 * NOT the legacy "Internal (unofficial) JSON API" (`/api/*`) that Jaeger explicitly documents as
 * "intentionally undocumented and subject to change". All calls still go through the existing
 * N9E reverse proxy `/api/n9e/proxy/:dataSourceId/*`.
 *
 * api_v3 responses are OTLP-shaped (`resourceSpans[].scopeSpans[].spans[]`), not the flat Jaeger
 * `TraceResponse` the legacy API returned verbatim. `otlpTracesDataToJaegerResponses` below converts
 * api_v3's OTLP payload back into the Jaeger-compatible `TraceResponse` shape (see
 * `src/pages/traceCpt/type.ts`) so the waterfall UI (`transformTraceData`, `VirtualizedTraceView`, ...)
 * doesn't need to change at all — same approach as the SkyWalking adapter's `swSpansToJaegerResponse`.
 *
 * Query parameter naming: api_v3's HTTP gateway has historically accepted snake_case params
 * (`query.service_name`, `query.start_time_min`, ...) — this is the naming documented since api_v3's
 * original proto comments and is what every released Jaeger v2.x understands. A very recent Jaeger
 * change additionally introduced camelCase as the "canonical" name (`query.serviceName`, ...) while
 * keeping snake_case only as a "deprecated" backward-compat alias. We deliberately keep sending
 * snake_case here for the widest compatibility across deployed Jaeger versions.
 *
 * Known gaps (see migration notes in the PR description / chat, kept here for future readers):
 * - `query.attributes` (tag/label filter) has no snake_case predecessor — it's a newly added param
 *   and was silently ignored by the HTTP gateway until a recent bugfix. On older Jaeger v2.x builds,
 *   the "Label" filter in the Search form may not narrow results when using v3.
 * - `/api/v3/dependencies` only very recently landed upstream (HTTP gateway handler PR merged after
 *   the gRPC handler); it is not documented as part of the Stable api_v3 surface and is not available
 *   on most currently-deployed Jaeger v2.x builds. `getJaegerDependencies` intentionally stays on the
 *   legacy `/api/dependencies` endpoint (still the only Jaeger-documented way to fetch the service
 *   dependency graph) — see the function comment below.
 */
import _ from 'lodash';
import request from '@/utils/request';
import { RequestMethod } from '@/store/common';
import { N9E_PATHNAME } from '@/utils/constant';
import { TraceByIdParams, TraceSearchParams, UnifiedServiceOption } from '../types';
import { PharosTraceSummary } from '../contract';
import { TraceResponse, TraceSpanData, TraceKeyValuePair } from '@/pages/traceCpt/type';

// ---------------------------------------------------------------------------
// api_v3 (OTLP JSON) response shapes. Only the fields we actually read are modeled;
// see https://opentelemetry.io/docs/specs/otlp/#json-protobuf-encoding for the general
// OTLP JSON mapping rules (camelCase keys, hex trace/span ids, decimal-string 64-bit ints).
// ---------------------------------------------------------------------------

interface OtlpAnyValue {
  stringValue?: string;
  boolValue?: boolean;
  intValue?: string | number;
  doubleValue?: number;
  bytesValue?: string;
  arrayValue?: { values?: OtlpAnyValue[] };
  kvlistValue?: { values?: OtlpKeyValue[] };
}

interface OtlpKeyValue {
  key: string;
  value?: OtlpAnyValue;
}

interface OtlpStatus {
  /** 0 = UNSET, 1 = OK, 2 = ERROR (OTLP `Status.StatusCode`). */
  code?: number;
  message?: string;
}

interface OtlpEvent {
  timeUnixNano?: string;
  name?: string;
  attributes?: OtlpKeyValue[];
}

interface OtlpLink {
  traceId?: string;
  spanId?: string;
  attributes?: OtlpKeyValue[];
}

interface OtlpSpan {
  traceId: string;
  spanId: string;
  /** Absent/all-zero for root spans. */
  parentSpanId?: string;
  name?: string;
  /** 0=UNSPECIFIED,1=INTERNAL,2=SERVER,3=CLIENT,4=PRODUCER,5=CONSUMER */
  kind?: number;
  startTimeUnixNano?: string;
  endTimeUnixNano?: string;
  attributes?: OtlpKeyValue[];
  events?: OtlpEvent[];
  links?: OtlpLink[];
  status?: OtlpStatus;
}

interface OtlpScope {
  name?: string;
  version?: string;
}

interface OtlpScopeSpans {
  scope?: OtlpScope;
  spans?: OtlpSpan[];
}

interface OtlpResource {
  attributes?: OtlpKeyValue[];
}

interface OtlpResourceSpans {
  resource?: OtlpResource;
  scopeSpans?: OtlpScopeSpans[];
}

interface OtlpTracesData {
  resourceSpans?: OtlpResourceSpans[];
}

/** GetTrace/FindTraces JSON responses are wrapped as `{"result": TracesData}` (grpc-gateway streaming envelope). */
interface ApiV3TracesEnvelope {
  result?: OtlpTracesData;
}

interface ApiV3GetServicesResponse {
  services?: string[];
}

interface ApiV3Operation {
  name: string;
  spanKind?: string;
}

interface ApiV3GetOperationsResponse {
  operations?: ApiV3Operation[];
}

const SPAN_KIND_NAMES: Record<number, string> = {
  2: 'server',
  3: 'client',
  4: 'producer',
  5: 'consumer',
};

function otlpValueToPlain(value?: OtlpAnyValue): any {
  if (!value) return '';
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.boolValue !== undefined) return value.boolValue;
  if (value.intValue !== undefined) {
    const n = Number(value.intValue);
    return Number.isSafeInteger(n) ? n : value.intValue;
  }
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.bytesValue !== undefined) return value.bytesValue;
  if (value.arrayValue) return (value.arrayValue.values || []).map(otlpValueToPlain);
  if (value.kvlistValue) {
    return (value.kvlistValue.values || []).reduce<Record<string, any>>((acc, kv) => {
      acc[kv.key] = otlpValueToPlain(kv.value);
      return acc;
    }, {});
  }
  return '';
}

function otlpAttributesToTags(attributes?: OtlpKeyValue[]): TraceKeyValuePair[] {
  return (attributes || []).map((attr) => ({ key: attr.key, value: otlpValueToPlain(attr.value) }));
}

/** fixed64 nanosecond timestamps are serialised as decimal strings in OTLP JSON; BigInt avoids float64 precision loss. */
function nanoToMicro(nanoStr?: string | number): number {
  if (nanoStr === undefined || nanoStr === null || nanoStr === '') return 0;
  try {
    return Number(BigInt(nanoStr) / BigInt(1000));
  } catch {
    return Math.floor(Number(nanoStr) / 1000);
  }
}

function isZeroOrEmptyId(id?: string): boolean {
  return !id || /^0*$/.test(id);
}

/**
 * Converts an OTLP `TracesData` payload (as returned by api_v3 `GetTrace`/`FindTraces`) into one
 * or more Jaeger-compatible `TraceResponse`s, grouped by `traceId`.
 *
 * `FindTraces` in particular returns a *single* `TracesData` blob whose `resourceSpans` mix spans
 * from every matched trace together (the HTTP gateway flattens all found traces' resourceSpans into
 * one combined response) — so grouping is done per-span by `traceId`, not per-`resourceSpans` entry.
 *
 * Mapping decisions:
 * - `parentSpanId` -> `references[0]` with `refType: 'CHILD_OF'` (matches `getTraceSpanIdsAsTree`,
 *   which only ever looks at `references[0]` to build the waterfall tree).
 * - `links[]` -> additional `references[]` entries (OTLP's generalization of Jaeger's multi-parent
 *   references); refType read from the OpenTracing-bridge `opentracing.ref_type` link attribute when
 *   present, defaulting to `FOLLOWS_FROM` (mirrors Jaeger's own OTLP<->model link/reference translator).
 * - Resource attributes -> `processes[processID]` (`service.name` -> `serviceName`, the rest -> `tags`).
 * - Span `kind`/`status` -> synthesized `span.kind` / `error` tags (OpenTracing convention that
 *   `VirtualizedTraceView`'s `isClientSpan` / `isServerSpan` / `isErrorSpan` helpers key off).
 * - `events[]` -> `logs[]`.
 */
function otlpTracesDataToJaegerResponses(data: OtlpTracesData): TraceResponse[] {
  const spansByTrace = new Map<string, TraceSpanData[]>();
  const processesByTrace = new Map<string, TraceResponse['processes']>();

  (data.resourceSpans || []).forEach((resourceSpans) => {
    const resourceTags = otlpAttributesToTags(resourceSpans.resource?.attributes);
    const serviceNameTag = resourceTags.find((t) => t.key === 'service.name');
    const serviceName = serviceNameTag ? String(serviceNameTag.value) : 'unknown';
    const processTags = resourceTags.filter((t) => t.key !== 'service.name');

    (resourceSpans.scopeSpans || []).forEach((scopeSpans) => {
      const scopeTags: TraceKeyValuePair[] = [];
      if (scopeSpans.scope?.name) scopeTags.push({ key: 'otel.scope.name', value: scopeSpans.scope.name });
      if (scopeSpans.scope?.version) scopeTags.push({ key: 'otel.scope.version', value: scopeSpans.scope.version });

      (scopeSpans.spans || []).forEach((span) => {
        const spanID = (span.spanId || '').toLowerCase();
        if (!spanID) return;
        const traceID = (span.traceId || '').toLowerCase();
        if (!traceID) return;

        if (!processesByTrace.has(traceID)) processesByTrace.set(traceID, {});
        const processes = processesByTrace.get(traceID)!;
        let processID = Object.keys(processes).find((id) => processes[id].serviceName === serviceName && _.isEqual(processes[id].tags, processTags));
        if (!processID) {
          processID = `p${Object.keys(processes).length}`;
          processes[processID] = { serviceName, tags: processTags };
        }

        const references: NonNullable<TraceSpanData['references']> = [];
        if (!isZeroOrEmptyId(span.parentSpanId)) {
          references.push({ refType: 'CHILD_OF', spanID: span.parentSpanId!.toLowerCase(), traceID });
        }
        (span.links || []).forEach((link) => {
          if (!link.spanId) return;
          const linkSpanID = link.spanId.toLowerCase();
          const linkTraceID = (link.traceId || traceID).toLowerCase();
          // The parent span is sometimes double-encoded as a link too (Jaeger's own OTLP link/reference
          // translator does this when the parent link carries an explicit ref-type attribute); don't duplicate it.
          if (references[0] && references[0].spanID === linkSpanID && references[0].traceID === linkTraceID) return;
          const refTypeAttr = (link.attributes || []).find((a) => a.key === 'opentracing.ref_type');
          const refType = otlpValueToPlain(refTypeAttr?.value) === 'child-of' ? 'CHILD_OF' : 'FOLLOWS_FROM';
          references.push({ refType, spanID: linkSpanID, traceID: linkTraceID });
        });

        const tags = otlpAttributesToTags(span.attributes);
        const kindTag = span.kind !== undefined ? SPAN_KIND_NAMES[span.kind] : undefined;
        if (kindTag && !tags.some((t) => t.key === 'span.kind')) tags.push({ key: 'span.kind', value: kindTag });
        if (span.status?.code === 2 && !tags.some((t) => t.key === 'error')) {
          tags.push({ key: 'error', value: true });
          if (span.status.message) tags.push({ key: 'otel.status_description', value: span.status.message });
        }
        tags.push(...scopeTags);

        const logs = (span.events || []).map((event) => ({
          timestamp: nanoToMicro(event.timeUnixNano),
          fields: [...(event.name ? [{ key: 'event', value: event.name }] : []), ...otlpAttributesToTags(event.attributes)],
        }));

        const startTime = nanoToMicro(span.startTimeUnixNano);
        const endTime = nanoToMicro(span.endTimeUnixNano);

        if (!spansByTrace.has(traceID)) spansByTrace.set(traceID, []);
        spansByTrace.get(traceID)!.push({
          spanID,
          traceID,
          processID,
          operationName: span.name || 'unknown',
          startTime,
          duration: Math.max(endTime - startTime, 0),
          logs,
          tags,
          references,
          flags: 0,
          warnings: null,
        });
      });
    });
  });

  return Array.from(spansByTrace.entries()).map(([traceID, spans]) => ({
    traceID,
    processes: processesByTrace.get(traceID) || {},
    spans,
  }));
}

/** RFC3339Nano is required by api_v3's `query.start_time_min` / `query.start_time_max` (Go `time.Parse(time.RFC3339Nano, ...)`); millisecond precision is a valid subset. */
function msToRfc3339(ms: number): string {
  return new Date(ms).toISOString();
}

/**
 * `FindTraces`/`GetTrace` respond `404 {"error":{"message":"No traces found",...}}` when nothing
 * matches (unlike the legacy API, which returns `200 {"data": []}` for an empty result) — this is
 * an expected, common outcome, not a real error, so callers should get `null` back silently instead
 * of a rejected promise + a toast (`silence: true` on the request only suppresses the automatic
 * notification; unexpected errors still propagate to the caller).
 */
async function requestApiV3Traces(url: string, params?: Record<string, unknown>): Promise<ApiV3TracesEnvelope | null> {
  try {
    return await request(url, { method: RequestMethod.Get, params, silence: true });
  } catch (e: any) {
    if (e?.status === 404) return null;
    throw e;
  }
}

export async function getJaegerServices(dataSourceId: number): Promise<UnifiedServiceOption[]> {
  const res: ApiV3GetServicesResponse = await request(`/api/${N9E_PATHNAME}/proxy/${dataSourceId}/api/v3/services`, {
    method: RequestMethod.Get,
  });
  const list: string[] = res?.services || [];
  return list.map((name) => ({ label: name, value: name }));
}

export async function getJaegerOperations(dataSourceId: number, service: string): Promise<string[]> {
  const res: ApiV3GetOperationsResponse = await request(`/api/${N9E_PATHNAME}/proxy/${dataSourceId}/api/v3/operations`, {
    method: RequestMethod.Get,
    params: { service },
  });
  return (res?.operations || []).map((op) => op.name);
}

/**
 * Builds `TraceQueryParameters` query params using api_v3's original (and still universally
 * supported) snake_case naming — see file header.
 *
 * `limitParam` exists because the result-limit field was renamed `num_traces` -> `search_depth` in
 * the proto. grpc-gateway rejects unknown query params outright, so we can't just send both:
 * `/api/v3/traces` keeps the historical `num_traces` (widest compatibility), while
 * `/api/v3/trace-summaries` uses `search_depth` — that endpoint only exists in builds new enough
 * to have the renamed field anyway.
 */
function buildFindTracesParams(params: TraceSearchParams, limitParam: 'num_traces' | 'search_depth' = 'num_traces'): Record<string, string> {
  const q: Record<string, string> = {
    'query.service_name': params.service,
    'query.start_time_min': msToRfc3339(params.start_time_min),
    'query.start_time_max': msToRfc3339(params.start_time_max),
  };
  if (params.operation) q['query.operation_name'] = params.operation;
  if (params.duration_min) q['query.duration_min'] = params.duration_min;
  if (params.duration_max) q['query.duration_max'] = params.duration_max;
  if (params.num_traces) q[`query.${limitParam}`] = String(params.num_traces);
  if (params.attributes && !_.isEmpty(params.attributes)) {
    // The HTTP gateway expects a URL-encoded JSON string map here, not a nested query object.
    q['query.attributes'] = JSON.stringify(params.attributes);
  }
  return q;
}

export async function searchJaegerTraces(params: TraceSearchParams): Promise<TraceResponse[]> {
  const envelope = await requestApiV3Traces(`/api/${N9E_PATHNAME}/proxy/${params.data_source_id}/api/v3/traces`, buildFindTracesParams(params));
  if (!envelope?.result) return [];
  return otlpTracesDataToJaegerResponses(envelope.result);
}

// ---------------------------------------------------------------------------
// FindTraceSummaries (`GET /api/v3/trace-summaries`)
//
// The lightweight counterpart of FindTraces, added to the api_v3 proto specifically for the search
// results page: it returns root service/operation, span & error counts and start/end nanos instead
// of every span of every matched trace. Using it removes the "one screen of results downloads all
// spans of all traces" problem (P-46) — but it is a recent addition, so `findJaegerTraceSummaries`
// reports back whether the target Jaeger actually serves it and lets the caller fall back.
// ---------------------------------------------------------------------------

interface ApiV3ServiceSummary {
  name?: string;
  spanCount?: number;
  errorSpanCount?: number;
}

interface ApiV3TraceSummary {
  traceId?: string;
  rootServiceName?: string;
  rootOperationName?: string;
  /** fixed64 — decimal string in proto3 JSON. */
  minStartTimeUnixNano?: string | number;
  maxEndTimeUnixNano?: string | number;
  spanCount?: number;
  errorSpanCount?: number;
  orphanSpanCount?: number;
  services?: ApiV3ServiceSummary[];
}

/** Server-streaming RPCs are wrapped in `{"result": ...}` by grpc-gateway; unwrapped shape accepted too. */
interface ApiV3TraceSummariesEnvelope {
  result?: { summaries?: ApiV3TraceSummary[] };
  summaries?: ApiV3TraceSummary[];
}

function apiV3SummaryToPharos(summary: ApiV3TraceSummary): PharosTraceSummary | null {
  const traceId = (summary.traceId || '').toLowerCase();
  if (!traceId) return null;
  const startTimeUs = nanoToMicro(summary.minStartTimeUnixNano);
  const endTimeUs = nanoToMicro(summary.maxEndTimeUnixNano);
  const services = (summary.services || [])
    .filter((service) => Boolean(service.name))
    .map((service) => ({
      name: service.name!,
      spanCount: service.spanCount || 0,
      errorSpanCount: service.errorSpanCount || 0,
    }))
    .sort((a, b) => b.spanCount - a.spanCount);
  const rootOperation = summary.rootOperationName || '';
  return {
    traceId,
    rootService: summary.rootServiceName || '',
    rootOperation,
    // Lightweight summaries have no span tags, so interface falls back to the operation name
    // and type stays empty (the table renders —).
    rootInterface: rootOperation,
    rootType: '',
    startTimeUs,
    durationUs: Math.max(endTimeUs - startTimeUs, 0),
    spanCount: summary.spanCount || 0,
    errorSpanCount: summary.errorSpanCount || 0,
    orphanSpanCount: summary.orphanSpanCount || 0,
    services,
  };
}

/**
 * An empty result is reported as `404 {"error":{"message":"No traces found"}}`, which is
 * indistinguishable by status code from "this build has no such route" — so the body decides.
 */
function isNoTracesFound(error: any): boolean {
  const message = typeof error?.message === 'string' ? error.message : '';
  return /no traces found/i.test(message);
}

/**
 * Returns `null` when the target Jaeger does not serve `/api/v3/trace-summaries`, so the caller can
 * fall back to a full-span search. An empty array means "endpoint works, nothing matched".
 */
export async function findJaegerTraceSummaries(params: TraceSearchParams): Promise<PharosTraceSummary[] | null> {
  const url = `/api/${N9E_PATHNAME}/proxy/${params.data_source_id}/api/v3/trace-summaries`;
  try {
    const res: ApiV3TraceSummariesEnvelope = await request(url, {
      method: RequestMethod.Get,
      params: buildFindTracesParams(params, 'search_depth'),
      silence: true,
    });
    const list = res?.result?.summaries || res?.summaries;
    // A 200 without a recognizable body most likely means the request never reached Jaeger's api_v3.
    if (!list) return null;
    return list.reduce<PharosTraceSummary[]>((acc, item) => {
      const summary = apiV3SummaryToPharos(item);
      if (summary) acc.push(summary);
      return acc;
    }, []);
  } catch (e: any) {
    if (isNoTracesFound(e)) return [];
    // 404 = no such route, 501 = unimplemented, 400 = the gateway rejected `search_depth` because
    // this build still calls it `num_traces`. All three mean "unsupported here", not "query failed".
    if (e?.status === 404 || e?.status === 501 || e?.status === 400) return null;
    throw e;
  }
}

export async function getJaegerTraceById(params: TraceByIdParams): Promise<TraceResponse[]> {
  const envelope = await requestApiV3Traces(`/api/${N9E_PATHNAME}/proxy/${params.data_source_id}/api/v3/traces/${params.traceID}`);
  if (!envelope?.result) return [];
  return otlpTracesDataToJaegerResponses(envelope.result);
}

/**
 * `GetDependencies` is defined in the api_v3 proto (`/api/v3/dependencies`), but the HTTP gateway
 * handler for it only landed upstream very recently (after the gRPC handler, in a separate follow-up
 * PR) — it isn't part of the documented Stable api_v3 surface and 404s on most currently-deployed
 * Jaeger v2.x builds. The dependency graph therefore intentionally keeps using the legacy
 * `/api/dependencies` endpoint, which Jaeger's own docs still list as the (Internal-status, but only)
 * way to fetch service dependencies: https://www.jaegertracing.io/docs/2.20/apis/#service-dependencies-graph
 */
export async function getJaegerDependencies(dataSourceId: number) {
  const res = await request(`/api/${N9E_PATHNAME}/proxy/${dataSourceId}/api/dependencies`, {
    method: RequestMethod.Get,
    params: {
      endTs: Date.now(),
      lookback: 86400000,
    },
  });
  return res.data || res || [];
}
