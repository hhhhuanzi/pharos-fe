import type { PharosSpan, PharosTraceDetail } from '../contract';

export interface FlameRect {
  span: PharosSpan;
  /** 0–1 relative to the current time window. */
  x0: number;
  x1: number;
  /** 0-based row in the focused window (root of the window is 0). */
  row: number;
}

export interface FlameLayout {
  rects: FlameRect[];
  windowStartUs: number;
  windowDurationUs: number;
  rowCount: number;
}

/**
 * Tree-ordered spans already have children immediately after their parent. A focused span's
 * subtree is that span plus every following span until depth returns to the focus depth.
 */
export function collectSubtree(spans: PharosSpan[], focusSpanId: string): PharosSpan[] {
  const start = spans.findIndex((span) => span.spanId === focusSpanId);
  if (start < 0) return spans;
  const rootDepth = spans[start].depth;
  const out = [spans[start]];
  for (let i = start + 1; i < spans.length; i++) {
    if (spans[i].depth <= rootDepth) break;
    out.push(spans[i]);
  }
  return out;
}

export function layoutSpanFlame(detail: PharosTraceDetail, focusSpanId?: string | null): FlameLayout {
  const spans = focusSpanId ? collectSubtree(detail.spans, focusSpanId) : detail.spans;
  if (spans.length === 0) {
    return { rects: [], windowStartUs: detail.startTimeUs, windowDurationUs: Math.max(detail.durationUs, 1), rowCount: 0 };
  }

  let windowStartUs = Number.MAX_SAFE_INTEGER;
  let windowEndUs = 0;
  let minDepth = Number.MAX_SAFE_INTEGER;
  let maxDepth = 0;
  spans.forEach((span) => {
    if (span.startTimeUs < windowStartUs) windowStartUs = span.startTimeUs;
    const end = span.startTimeUs + span.durationUs;
    if (end > windowEndUs) windowEndUs = end;
    if (span.depth < minDepth) minDepth = span.depth;
    if (span.depth > maxDepth) maxDepth = span.depth;
  });

  const windowDurationUs = Math.max(windowEndUs - windowStartUs, 1);
  const rects = spans.map((span) => {
    const x0 = (span.startTimeUs - windowStartUs) / windowDurationUs;
    const x1 = (span.startTimeUs + span.durationUs - windowStartUs) / windowDurationUs;
    return {
      span,
      x0: Math.max(0, Math.min(x0, 1)),
      x1: Math.max(0, Math.min(Math.max(x1, x0), 1)),
      row: span.depth - minDepth,
    };
  });

  return {
    rects,
    windowStartUs,
    windowDurationUs,
    rowCount: maxDepth - minDepth + 1,
  };
}

export function focusPath(spans: PharosSpan[], focusSpanId: string): PharosSpan[] {
  const byId = new Map(spans.map((span) => [span.spanId, span]));
  const path: PharosSpan[] = [];
  let current = byId.get(focusSpanId);
  const seen = new Set<string>();
  while (current && !seen.has(current.spanId)) {
    seen.add(current.spanId);
    path.unshift(current);
    current = current.parentSpanId ? byId.get(current.parentSpanId) : undefined;
  }
  return path;
}
