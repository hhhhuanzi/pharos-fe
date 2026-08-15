import { layoutServiceGraph } from './layout';
import type { PharosServiceEdge } from '../contract';

function edge(client: string, server: string): PharosServiceEdge {
  return { client, server, connectionType: '', requestCount: 1, failedCount: 0, errorRate: 0 };
}

describe('layoutServiceGraph', () => {
  it('places sources left of sinks', () => {
    const nodes = layoutServiceGraph([edge('gateway', 'order'), edge('order', 'pay')]);
    const x = Object.fromEntries(nodes.map((n) => [n.id, n.x]));
    expect(x.gateway).toBeLessThan(x.order);
    expect(x.order).toBeLessThan(x.pay);
  });

  it('still places every node when the graph is a cycle', () => {
    const nodes = layoutServiceGraph([edge('a', 'b'), edge('b', 'a')]);
    expect(nodes.map((n) => n.id).sort()).toEqual(['a', 'b']);
  });

  it('returns empty for no edges', () => {
    expect(layoutServiceGraph([])).toEqual([]);
  });
});
