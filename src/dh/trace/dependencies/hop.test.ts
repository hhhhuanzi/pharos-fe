import { adjacentClients, neighborRows } from './hop';
import type { PharosServiceEdge } from '../contract';

function edge(client: string, server: string, requestCount = 1, connectionType = ''): PharosServiceEdge {
  return { client, server, connectionType, requestCount, failedCount: 0, errorRate: 0 };
}

describe('adjacentClients', () => {
  it('ranks callers by request count and ignores outbound edges from the node', () => {
    const edges = [edge('quote', 'redis', 50, 'virtual_node'), edge('kline', 'redis', 10, 'virtual_node'), edge('redis', 'other', 999)];
    expect(adjacentClients('redis', edges)).toEqual(['quote', 'kline']);
  });

  it('returns empty when the node is only a client (synthetic user)', () => {
    expect(adjacentClients('user', [edge('user', 'web', 1, 'virtual_node')])).toEqual([]);
  });
});

describe('neighborRows', () => {
  it('lists upstream callers then downstream callees, heaviest first', () => {
    const edges = [
      edge('index', 'quote', 3),
      edge('user', 'quote', 1, 'virtual_node'),
      edge('quote', 'redis', 50, 'virtual_node'),
      edge('quote', 'sec', 10, 'database'),
    ];
    expect(neighborRows('quote', edges).map((row) => `${row.direction}:${row.name}`)).toEqual([
      'upstream:index',
      'upstream:user',
      'downstream:redis',
      'downstream:sec',
    ]);
  });
});
