import type { PharosSpan, PharosTraceDetail } from '../contract';
import { collectSubtree, focusPath, layoutSpanFlame } from './layout';

function span(overrides: Partial<PharosSpan> & Pick<PharosSpan, 'spanId' | 'startTimeUs' | 'durationUs' | 'depth'>): PharosSpan {
  return {
    parentSpanId: null,
    service: 'svc',
    operation: 'op',
    error: false,
    childCount: 0,
    ...overrides,
  };
}

const detail: PharosTraceDetail = {
  traceId: 'abc',
  startTimeUs: 1_000,
  durationUs: 1_000,
  spans: [
    span({ spanId: 'root', startTimeUs: 1_000, durationUs: 1_000, depth: 0, operation: 'GET /', childCount: 2 }),
    span({ spanId: 'a', parentSpanId: 'root', startTimeUs: 1_100, durationUs: 400, depth: 1, service: 'order', operation: 'list', childCount: 1 }),
    span({ spanId: 'a1', parentSpanId: 'a', startTimeUs: 1_150, durationUs: 100, depth: 2, service: 'db', operation: 'select' }),
    span({ spanId: 'b', parentSpanId: 'root', startTimeUs: 1_600, durationUs: 200, depth: 1, service: 'pay', operation: 'charge' }),
  ],
};

describe('collectSubtree', () => {
  it('returns the focused span and its descendants only', () => {
    const subtree = collectSubtree(detail.spans, 'a');
    expect(subtree.map((item) => item.spanId)).toEqual(['a', 'a1']);
  });

  it('falls back to the full list when the id is missing', () => {
    expect(collectSubtree(detail.spans, 'gone')).toHaveLength(4);
  });
});

describe('layoutSpanFlame', () => {
  it('places the root across the full window and children by relative time', () => {
    const layout = layoutSpanFlame(detail);
    expect(layout.rowCount).toBe(3);
    expect(layout.windowStartUs).toBe(1_000);
    expect(layout.windowDurationUs).toBe(1_000);

    const root = layout.rects.find((rect) => rect.span.spanId === 'root');
    const child = layout.rects.find((rect) => rect.span.spanId === 'a');
    expect(root).toMatchObject({ x0: 0, x1: 1, row: 0 });
    expect(child?.row).toBe(1);
    expect(child?.x0).toBeCloseTo(0.1);
    expect(child?.x1).toBeCloseTo(0.5);
  });

  it('rebases the window when focusing a subtree', () => {
    const layout = layoutSpanFlame(detail, 'a');
    expect(layout.rects.map((rect) => rect.span.spanId)).toEqual(['a', 'a1']);
    expect(layout.windowStartUs).toBe(1_100);
    expect(layout.windowDurationUs).toBe(400);
    expect(layout.rects[0]).toMatchObject({ x0: 0, x1: 1, row: 0 });
    expect(layout.rects[1].row).toBe(1);
  });
});

describe('focusPath', () => {
  it('walks parents from the focused span back to the root', () => {
    expect(focusPath(detail.spans, 'a1').map((item) => item.spanId)).toEqual(['root', 'a', 'a1']);
  });
});
