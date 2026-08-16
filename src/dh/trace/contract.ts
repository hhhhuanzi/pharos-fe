/**
 * Pharos trace contract (R-29).
 *
 * The trace UI consumes *these* shapes only. Adapters (jaeger / skywalking / otel) are responsible
 * for translating whatever their backend speaks into them, so that swapping the implementation
 * (FE-direct-to-Jaeger today, a Pharos BE endpoint later) does not touch the UI.
 *
 * Packaged this round (span flame graph, 1.2.0): span-level `PharosTraceDetail` derived from the
 * same get-by-id payload the waterfall already loads (`/api/v3/traces/{id}` for Jaeger; SkyWalking
 * GraphQL `queryTrace` mapped to the same shape). Do not pre-package unused endpoints
 * (`/api/v3/dependencies`, stats, …). List-level `PharosTraceSummary` shipped earlier.
 */

import type { Trace, TraceResponse, TraceSpanData } from '@/pages/traceCpt/type';
import { resolveRootInterface, resolveRootType } from './summaryFields';

export interface PharosServiceSummary {
  name: string;
  spanCount: number;
  errorSpanCount: number;
}

/** One row of the trace search result list. */
export interface PharosTraceSummary {
  traceId: string;
  /** Service owning the root span. Empty when the trace has no identifiable root. */
  rootService: string;
  /** Operation / span name of the root span. */
  rootOperation: string;
  /** Method + path and/or SQL from the root span; falls back to `rootOperation`. */
  rootInterface: string;
  /** Short protocol/component label (web / mysql / …). Empty when no reliable field exists. */
  rootType: string;
  /** Unix microseconds — same unit the waterfall uses for span times. */
  startTimeUs: number;
  durationUs: number;
  spanCount: number;
  /** Spans carrying an error indicator (OTel `StatusCode=ERROR` / OpenTracing `error` tag). */
  errorSpanCount: number;
  /** Spans whose parent is missing from the trace; a non-zero value means the trace is partial. */
  orphanSpanCount: number;
  /** Per-service breakdown, sorted by span count desc. */
  services: PharosServiceSummary[];
}

/**
 * Where the rows came from:
 * - `summaries`: the backend's dedicated lightweight list query (Jaeger `/api/v3/trace-summaries`).
 * - `full-traces`: derived client-side from a full-span search, because the backend has no
 *   summary query. Far more expensive per row, so the list limit is deliberately lower (see P-46).
 */
export type PharosTraceListSource = 'summaries' | 'full-traces';

export interface PharosTraceListResult {
  summaries: PharosTraceSummary[];
  source: PharosTraceListSource;
  /** The backend returned as many traces as the query limit allowed, so results are likely cut off. */
  truncated: boolean;
}

/**
 * One directed call edge on the service graph (R-30).
 *
 * Sourced from OTel `service_graph` connector metrics (`traces_service_graph_*`), not from
 * Jaeger `/api/dependencies` (call-count only, and empty unless a spark job is running — skipped
 * by decision 9). Stage 2 can swap the PromQL adapter without touching the UI.
 */
export interface PharosServiceEdge {
  client: string;
  server: string;
  /** OTel `connection_type` (empty / `messaging_system` / `database` / `virtual_node`). */
  connectionType: string;
  /** `increase(traces_service_graph_request_total[range])` — requests in the selected window. */
  requestCount: number;
  failedCount: number;
  /** 0–1; 0 when `requestCount` is 0. */
  errorRate: number;
  /** Server-side P95 in seconds; omitted when the histogram series is missing. */
  p95Seconds?: number;
}

export interface PharosServiceGraph {
  edges: PharosServiceEdge[];
  source: 'service-graph';
}

/**
 * One span on the Pharos detail / span-flame surface. Flat `parentSpanId` + `service` so a later
 * storage swap does not leak Jaeger `processes` / `references` into the UI.
 */
export interface PharosSpan {
  spanId: string;
  parentSpanId: string | null;
  service: string;
  operation: string;
  startTimeUs: number;
  durationUs: number;
  error: boolean;
  depth: number;
  childCount: number;
}

/** Full trace for the waterfall-adjacent span flame graph. Same get-by-id fetch as the waterfall. */
export interface PharosTraceDetail {
  traceId: string;
  startTimeUs: number;
  durationUs: number;
  spans: PharosSpan[];
}

/** Jaeger/OpenTracing convention: a truthy `error` tag marks the span as failed. */
function isErrorSpanData(span: TraceSpanData): boolean {
  return (span.tags || []).some((tag) => tag.key === 'error' && tag.value !== false && tag.value !== 'false' && tag.value !== '');
}

/**
 * Picks the root span the same way the waterfall's `getTraceName` does: the earliest span whose
 * parent reference points outside the trace (or that has no reference at all).
 */
function findRootSpan(spans: TraceSpanData[]): TraceSpanData | undefined {
  const ids = new Set(spans.map((span) => span.spanID));
  let root: TraceSpanData | undefined;
  spans.forEach((span) => {
    const hasInternalParent = (span.references || []).some((ref) => ref.traceID === span.traceID && ids.has(ref.spanID));
    if (hasInternalParent) return;
    if (!root || span.startTime < root.startTime) root = span;
  });
  return root;
}

/**
 * Derives a list row from a full Jaeger-shaped trace. Used on the fallback path, where the backend
 * has no summary query and the UI already holds every span anyway.
 */
export function traceResponseToSummary(res: TraceResponse): PharosTraceSummary | null {
  const spans = (res.spans || []).filter((span) => Boolean(span.startTime));
  if (!res.traceID || spans.length === 0) return null;

  const ids = new Set(spans.map((span) => span.spanID));
  const serviceOf = (span: TraceSpanData) => res.processes?.[span.processID]?.serviceName || 'unknown';

  let startTimeUs = Number.MAX_SAFE_INTEGER;
  let endTimeUs = 0;
  let errorSpanCount = 0;
  let orphanSpanCount = 0;
  const byService = new Map<string, PharosServiceSummary>();

  spans.forEach((span) => {
    if (span.startTime < startTimeUs) startTimeUs = span.startTime;
    if (span.startTime + span.duration > endTimeUs) endTimeUs = span.startTime + span.duration;

    const isError = isErrorSpanData(span);
    if (isError) errorSpanCount += 1;
    const parent = (span.references || [])[0];
    if (parent && !ids.has(parent.spanID)) orphanSpanCount += 1;

    const name = serviceOf(span);
    const entry = byService.get(name) || { name, spanCount: 0, errorSpanCount: 0 };
    entry.spanCount += 1;
    if (isError) entry.errorSpanCount += 1;
    byService.set(name, entry);
  });

  const root = findRootSpan(spans);
  const rootOperation = root?.operationName || '';
  return {
    traceId: res.traceID.toLowerCase(),
    rootService: root ? serviceOf(root) : '',
    rootOperation,
    rootInterface: resolveRootInterface(root) || rootOperation,
    rootType: resolveRootType(root?.tags),
    startTimeUs,
    durationUs: Math.max(endTimeUs - startTimeUs, 0),
    spanCount: spans.length,
    errorSpanCount,
    orphanSpanCount,
    services: Array.from(byService.values()).sort((a, b) => b.spanCount - a.spanCount),
  };
}

function parentSpanIdOf(span: { spanID: string; references?: TraceSpanData['references'] }, ids: Set<string>): string | null {
  const refs = span.references || [];
  const childOf = refs.find((ref) => ref.refType === 'CHILD_OF' && ids.has(ref.spanID));
  if (childOf) return childOf.spanID;
  const first = refs[0];
  if (first && ids.has(first.spanID)) return first.spanID;
  return null;
}

/**
 * Packs the already-transformed waterfall `Trace` into the Pharos span contract.
 * Jaeger and SkyWalking both reach this shape via `transformTraceData`, so the flame graph
 * does not need a second fetch or a backend-specific tree walk.
 */
export function traceToPharosDetail(trace: Trace): PharosTraceDetail {
  const ids = new Set(trace.spans.map((span) => span.spanID));
  return {
    traceId: trace.traceID,
    startTimeUs: trace.startTime,
    durationUs: trace.duration,
    spans: trace.spans.map((span) => ({
      spanId: span.spanID,
      parentSpanId: parentSpanIdOf(span, ids),
      service: span.process?.serviceName || 'unknown',
      operation: span.operationName,
      startTimeUs: span.startTime,
      durationUs: span.duration,
      error: isErrorSpanData(span),
      depth: span.depth,
      childCount: span.childSpanCount,
    })),
  };
}
