import type { PharosServiceEdge } from '../contract';
import { mergeMutualEdges } from './mutualEdge';
import { edgeKey } from './promql';

function edge(
  client: string,
  server: string,
  extra: { connectionType?: string; requestCount?: number; failedCount?: number; p95Seconds?: number } = {},
): PharosServiceEdge {
  const requestCount = extra.requestCount ?? 100;
  const failedCount = extra.failedCount ?? 0;
  return {
    client,
    server,
    connectionType: extra.connectionType ?? '',
    requestCount,
    failedCount,
    errorRate: requestCount > 0 ? failedCount / requestCount : 0,
    p95Seconds: extra.p95Seconds,
  };
}

describe('mergeMutualEdges', () => {
  it('draws one edge per pair and keeps both directions of a mutual pair', () => {
    const merged = mergeMutualEdges([
      edge('quote', 'kline', { requestCount: 300, failedCount: 3, p95Seconds: 0.2 }),
      edge('kline', 'quote', { requestCount: 100, failedCount: 20, p95Seconds: 0.9 }),
      edge('quote', 'redis', { connectionType: 'database', requestCount: 500 }),
    ]);
    expect(merged).toHaveLength(2);
    const mutual = merged.find((item) => item.bidirectional)!;
    expect(mutual.forward.requestCount + (mutual.backward?.requestCount ?? 0)).toBe(400);
    expect(mutual.forward.client).toBe(mutual.client);
    expect(mutual.backward?.client).toBe(mutual.server);
    const oneWay = merged.find((item) => !item.bidirectional)!;
    expect(oneWay.backward).toBeUndefined();
    expect(oneWay.id).toBe(edgeKey('quote', 'redis', 'database'));
  });

  it('colors a merged pair by the worse direction so a failing return path is not hidden', () => {
    const [merged] = mergeMutualEdges([
      edge('quote', 'kline', { requestCount: 1000, failedCount: 0, p95Seconds: 0.05 }),
      edge('kline', 'quote', { requestCount: 10, failedCount: 6, p95Seconds: 1.4 }),
    ]);
    expect(merged.bidirectional).toBe(true);
    expect(merged.errorRate).toBeCloseTo(0.6);
    expect(merged.p95Seconds).toBeCloseTo(1.4);
    expect(merged.requestCount).toBe(1010);
    // The per-direction RED is still intact for the hover card / drawer.
    expect(merged.forward.errorRate).toBe(0);
    expect(merged.backward?.errorRate).toBeCloseTo(0.6);
  });

  it('points a mutual pair away from the focused service so peers stay downstream', () => {
    const edges = [edge('kline', 'quote'), edge('quote', 'kline'), edge('monitoring', 'quote'), edge('quote', 'monitoring')];
    const merged = mergeMutualEdges(edges, 'quote');
    expect(merged).toHaveLength(2);
    merged.forEach((item) => {
      expect(item.client).toBe('quote');
      expect(item.bidirectional).toBe(true);
    });
    // Global view has no focus: the heavier direction wins, and order of input does not matter.
    const globalMerged = mergeMutualEdges([edge('a', 'b', { requestCount: 10 }), edge('b', 'a', { requestCount: 900 })]);
    const reversedInput = mergeMutualEdges([edge('b', 'a', { requestCount: 900 }), edge('a', 'b', { requestCount: 10 })]);
    expect(globalMerged[0].client).toBe('b');
    expect(reversedInput[0].client).toBe('b');
  });

  it('aggregates several connection types of the same direction into one stroke', () => {
    const merged = mergeMutualEdges([
      edge('quote', 'redis', { connectionType: 'database', requestCount: 300, failedCount: 3, p95Seconds: 0.1 }),
      edge('quote', 'redis', { connectionType: '', requestCount: 100, failedCount: 1, p95Seconds: 0.3 }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].connectionType).toBe('database');
    expect(merged[0].forward.requestCount).toBe(400);
    expect(merged[0].forward.errorRate).toBeCloseTo(0.01);
    expect(merged[0].forward.p95Seconds).toBeCloseTo(0.15);
  });

  it('ignores self-calls, which have no pair to merge', () => {
    expect(mergeMutualEdges([edge('quote', 'quote')])).toEqual([]);
  });
});
