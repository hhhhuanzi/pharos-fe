import {
  classifyNodeKind,
  layoutEdgeDirections,
  layoutServiceGraph,
  mutualPeerPairs,
  rankProfile,
  SERVICE_NODE_HEIGHT,
  SERVICE_NODE_SUBTITLE_HEIGHT,
  SERVICE_NODE_WIDTH,
} from './layout';
import { MAX_NODESEP, MAX_RANKSEP, MIN_NODESEP, MIN_RANKSEP, TIGHT_NODESEP, TIGHT_RANKSEP, WIDENING_RESERVED_RANKSEP } from './spacing';
import type { PharosServiceEdge } from '../contract';

function edge(client: string, server: string, connectionType = '', requestCount = 1): PharosServiceEdge {
  return { client, server, connectionType, requestCount, failedCount: 0, errorRate: 0 };
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

  it('keeps one node per service even with multiple connection types', () => {
    const nodes = layoutServiceGraph([edge('auth', 'redis', 'database'), edge('auth', 'redis', 'virtual_node'), edge('web', 'auth')]);
    const ids = nodes.map((n) => n.id);
    expect(ids.filter((id) => id === 'auth')).toHaveLength(1);
    expect(ids.filter((id) => id === 'redis')).toHaveLength(1);
  });

  it('spaces a fan-in so bezier corridors are not a single channel', () => {
    const nodes = layoutServiceGraph([edge('quote', 'redis', 'database'), edge('kline', 'redis', 'database'), edge('auth', 'redis', 'database')]);
    const sources = nodes.filter((n) => n.id !== 'redis').sort((a, b) => a.y - b.y);
    expect(sources[1].y - sources[0].y).toBeGreaterThanOrEqual(SERVICE_NODE_HEIGHT + MIN_NODESEP - 4);
    const redis = nodes.find((n) => n.id === 'redis');
    expect(redis).toBeDefined();
    expect(redis!.x - sources[0].x).toBeGreaterThanOrEqual(SERVICE_NODE_WIDTH + MIN_RANKSEP - 8);
  });

  it('spreads a small graph out and packs a large one, from the same pane', () => {
    const container = { width: 1408, height: 868 };
    const small = layoutServiceGraph([edge('user', 'admin', 'virtual_node'), edge('admin', 'mysql', 'database')], undefined, undefined, container);
    const chain = ['user', 'gateway', 'index', 'quote', 'kline', 'report', 'clickhouse'];
    const large = layoutServiceGraph(
      chain.slice(1).map((server, i) => edge(chain[i], server)),
      undefined,
      undefined,
      container,
    );
    const rankGap = (nodes: Array<{ x: number }>) => {
      const xs = [...new Set(nodes.map((node) => Math.round(node.x)))].sort((a, b) => a - b);
      return xs[1] - xs[0] - SERVICE_NODE_WIDTH;
    };
    expect(rankProfile(small).rankCount).toBe(3);
    expect(rankProfile(large).rankCount).toBe(7);
    expect(rankGap(small)).toBeGreaterThan(rankGap(large));
    expect(rankGap(small)).toBe(MAX_RANKSEP);
    // Vertical gaps still pack; the rank gap stops at the readable-arc floor so hops stay bowed.
    expect(rankGap(large)).toBe(TIGHT_RANKSEP);
  });

  it('keeps neighbouring ranks far enough apart for a horizontal bezier after squeeze', () => {
    const chain = ['user', 'gateway', 'index', 'quote', 'kline', 'report', 'clickhouse'];
    const nodes = layoutServiceGraph(
      chain.slice(1).map((server, i) => edge(chain[i], server)),
      undefined,
      undefined,
      { width: 1280, height: 800 },
    );
    const width = nodes[0].width;
    const xs = [...new Set(nodes.map((node) => Math.round(node.x)))].sort((a, b) => a - b);
    expect(xs.length).toBeGreaterThanOrEqual(3);
    const centerGaps = xs.slice(1).map((x, i) => x - xs[i]);
    centerGaps.forEach((centerGap) => {
      expect(centerGap).toBeGreaterThanOrEqual(width + TIGHT_RANKSEP);
    });
    // Columns stay even — the first hop must not hoard slack the middle hops then lose.
    expect(Math.max(...centerGaps) - Math.min(...centerGaps)).toBeLessThanOrEqual(2);
  });

  it('reacts to the pane: the same graph gets wider gaps in a wider pane', () => {
    const edges = [edge('a', 'b'), edge('b', 'c'), edge('c', 'd'), edge('d', 'e'), edge('e', 'f')];
    const gapAt = (width: number) => {
      const nodes = layoutServiceGraph(edges, undefined, undefined, { width, height: 800 });
      const xs = [...new Set(nodes.map((node) => Math.round(node.x)))].sort((a, b) => a - b);
      return xs[1] - xs[0] - SERVICE_NODE_WIDTH;
    };
    expect(gapAt(1920)).toBeGreaterThan(gapAt(1280));
    expect(gapAt(1280)).toBeGreaterThanOrEqual(TIGHT_RANKSEP);
    expect(gapAt(600)).toBe(TIGHT_RANKSEP);
  });

  it('keeps the detail topology on the comfortable floors, squeezing only the global graph', () => {
    const center = 'quote';
    const edges = Array.from({ length: 12 }, (_, i) => edge(`client-${i}`, center)).concat(Array.from({ length: 6 }, (_, i) => edge(center, `sink-${i}`)));
    const pane = { width: 1280, height: 420 };
    const gaps = (nodes: Array<{ x: number; y: number }>) => {
      const xs = [...new Set(nodes.map((node) => Math.round(node.x)))].sort((a, b) => a - b);
      const ys = nodes.map((node) => node.y).sort((a, b) => a - b);
      return { rank: xs[1] - xs[0] - SERVICE_NODE_WIDTH, node: ys[1] - ys[0] - SERVICE_NODE_HEIGHT };
    };
    const detail = gaps(layoutServiceGraph(edges, undefined, center, pane));
    expect(detail.rank).toBeGreaterThanOrEqual(MIN_RANKSEP);
    expect(detail.node).toBeGreaterThanOrEqual(MIN_NODESEP - 1);
    const global = gaps(layoutServiceGraph(edges, undefined, undefined, pane));
    expect(global.node).toBeLessThan(detail.node);
  });

  it('never stacks cards closer than the squeeze floor', () => {
    const edges = Array.from({ length: 12 }, (_, i) => edge(`client-${i}`, 'redis', 'database'));
    const nodes = layoutServiceGraph(edges, undefined, undefined, { width: 1280, height: 420 });
    const ys = nodes
      .filter((node) => node.id !== 'redis')
      .map((node) => node.y)
      .sort((a, b) => a - b);
    expect(ys[1] - ys[0]).toBeGreaterThanOrEqual(SERVICE_NODE_HEIGHT + TIGHT_NODESEP - 1);
    expect(ys[1] - ys[0]).toBeLessThanOrEqual(SERVICE_NODE_HEIGHT + MAX_NODESEP + 1);
  });

  it('puts every bidirectional peer of the focused service in the same (downstream) column', () => {
    const center = 'rome-sec-kline-history';
    const nodes = layoutServiceGraph(
      [
        // both peers call the center and are called by it
        edge('rome-sec-kline-realtime', center, 'messaging_system', 15),
        edge(center, 'rome-sec-kline-realtime', '', 97),
        edge('rome-sec-monitoring-alert', center, '', 80),
        edge(center, 'rome-sec-monitoring-alert', '', 76),
        // upstream only
        edge('rome-sec-index', center, '', 199),
        // downstream only
        edge(center, 'redis', 'database', 4000),
      ],
      undefined,
      center,
    );
    const x = Object.fromEntries(nodes.map((node) => [node.id, node.x]));
    expect(x['rome-sec-index']).toBeLessThan(x[center]);
    expect(x['rome-sec-kline-realtime']).toBeGreaterThan(x[center]);
    expect(x['rome-sec-monitoring-alert']).toBeGreaterThan(x[center]);
    expect(x['rome-sec-kline-realtime']).toBe(x['rome-sec-monitoring-alert']);
    expect(x.redis).toBeGreaterThan(x[center]);
  });

  // The widening is a comfort win; the rank gap is what makes an edge readable as a horizontal
  // hop. A wide, flat pane used to trade the second for the first and left the columns touching.
  it('never pays for a wider card out of the rank gaps', () => {
    const chain = ['rome-sec-adapter-link-data', 'rome-sec-monitoring-alert', 'turms-business-service', 'rome-sec-kline-realtime', 'clickhouse'];
    const pane = { width: 1408, height: 448 };
    const nodes = layoutServiceGraph(
      chain.slice(1).map((server, i) => edge(chain[i], server)),
      undefined,
      undefined,
      pane,
    );
    const width = nodes[0].width;
    expect(width).toBeGreaterThan(SERVICE_NODE_WIDTH);
    const xs = [...new Set(nodes.map((node) => Math.round(node.x)))].sort((a, b) => a - b);
    expect(xs[1] - xs[0] - width).toBeGreaterThanOrEqual(WIDENING_RESERVED_RANKSEP);
  });

  it('keeps a card at the floor rather than squeezing the global topology flat', () => {
    // The shape of the real global graph: too many ranks for any name to be spelled out.
    const chain = ['user', 'rome-sec-adapter-link-data', 'rome-sec-monitoring-alert', 'rome-sec-admin', 'turms-business-service', 'clickhouse'];
    const nodes = layoutServiceGraph(
      chain.slice(1).map((server, i) => edge(chain[i], server)),
      undefined,
      undefined,
      { width: 1408, height: 448 },
    );
    expect(nodes[0].width).toBe(SERVICE_NODE_WIDTH);
    const xs = [...new Set(nodes.map((node) => Math.round(node.x)))].sort((a, b) => a - b);
    expect(xs[1] - xs[0] - SERVICE_NODE_WIDTH).toBeGreaterThanOrEqual(MIN_RANKSEP);
  });

  it('uses a taller card only when a subtitle is present', () => {
    const edges = [edge('quote', 'clickhouse', 'database'), edge('quote', 'redis', 'virtual_node')];
    const nodes = layoutServiceGraph(edges, { clickhouse: 'sec' });
    expect(nodes.find((n) => n.id === 'clickhouse')?.height).toBe(SERVICE_NODE_SUBTITLE_HEIGHT);
    expect(nodes.find((n) => n.id === 'redis')?.height).toBe(SERVICE_NODE_HEIGHT);
    expect(nodes.find((n) => n.id === 'quote')?.height).toBe(SERVICE_NODE_HEIGHT);
  });
});

describe('mutualPeerPairs', () => {
  it('reports only pairs that call each other in both directions', () => {
    const pairs = mutualPeerPairs([edge('a', 'b'), edge('b', 'a', 'messaging_system'), edge('a', 'c'), edge('d', 'd')]);
    expect([...pairs]).toEqual(['a\u0000b']);
  });
});

describe('layoutEdgeDirections', () => {
  it('collapses a bidirectional pair to one direction so dagre cannot pick a side at random', () => {
    const directions = layoutEdgeDirections([edge('a', 'b', '', 10), edge('b', 'a', '', 40), edge('a', 'c')]);
    const pair = directions.filter((item) => item.mutual);
    expect(pair).toEqual([{ from: 'b', to: 'a', mutual: true }]);
    expect(directions.filter((item) => !item.mutual)).toEqual([{ from: 'a', to: 'c', mutual: false }]);
  });

  it('anchors a bidirectional pair to the focused service so the peer lands downstream', () => {
    const withFocus = layoutEdgeDirections([edge('a', 'b', '', 10), edge('b', 'a', '', 40)], 'a');
    expect(withFocus).toEqual([{ from: 'a', to: 'b', mutual: true }]);
  });

  it('is independent of edge order', () => {
    const forward = layoutEdgeDirections([edge('a', 'b', '', 10), edge('b', 'a', '', 40)]);
    const reversed = layoutEdgeDirections([edge('b', 'a', '', 40), edge('a', 'b', '', 10)]);
    expect(forward).toEqual(reversed);
  });

  it('keeps one direction per pair even with several connection types', () => {
    const directions = layoutEdgeDirections([edge('auth', 'redis', 'database'), edge('auth', 'redis', 'virtual_node')]);
    expect(directions).toEqual([{ from: 'auth', to: 'redis', mutual: false }]);
  });
});

describe('classifyNodeKind', () => {
  it('marks typed sinks as virtual and RPC nodes as services', () => {
    const edges = [edge('web', 'redis', 'database'), edge('user', 'web', 'virtual_node'), edge('web', 'auth')];
    expect(classifyNodeKind('redis', edges)).toBe('virtual');
    expect(classifyNodeKind('user', edges)).toBe('virtual');
    expect(classifyNodeKind('web', edges)).toBe('service');
    expect(classifyNodeKind('auth', edges)).toBe('service');
  });

  it('does not treat an app that only calls a database as virtual', () => {
    expect(classifyNodeKind('kline', [edge('kline', 'other_sql', 'database')])).toBe('service');
    expect(classifyNodeKind('other_sql', [edge('kline', 'other_sql', 'database')])).toBe('virtual');
  });
});
