/**
 * Pharos trace contract (R-29).
 *
 * The trace UI consumes *these* shapes only. Adapters (jaeger / skywalking / otel) are responsible
 * for translating whatever their backend speaks into them, so that swapping the implementation
 * (FE-direct-to-Jaeger today, a Pharos BE endpoint in stage 2) does not touch the UI.
 *
 * Stage 1 only ships the search-result list, so only the list-level shapes are defined here.
 * The span-level contract (flat `parentSpanId` / `service`, replacing Jaeger's `processes` +
 * `references`) lands together with the rewritten detail page; until then the detail view keeps
 * consuming `@/pages/traceCpt/type`'s `Trace`.
 */

import type { TraceResponse, TraceSpanData } from '@/pages/traceCpt/type';

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
  return {
    traceId: res.traceID.toLowerCase(),
    rootService: root ? serviceOf(root) : '',
    rootOperation: root?.operationName || '',
    startTimeUs,
    durationUs: Math.max(endTimeUs - startTimeUs, 0),
    spanCount: spans.length,
    errorSpanCount,
    orphanSpanCount,
    services: Array.from(byService.values()).sort((a, b) => b.spanCount - a.spanCount),
  };
}
