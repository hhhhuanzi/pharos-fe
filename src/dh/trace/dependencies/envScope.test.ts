import { filterEdgesByPeerTokens, peerTokensFromSpanNames, spanNamePeerTokens } from './envScope';
import type { PharosServiceEdge } from '../contract';

function edge(partial: Partial<PharosServiceEdge> & Pick<PharosServiceEdge, 'client' | 'server'>): PharosServiceEdge {
  return {
    connectionType: '',
    requestCount: 1,
    failedCount: 0,
    errorRate: 0,
    ...partial,
  };
}

describe('spanNamePeerTokens', () => {
  it('takes the mongo database name and does not split on hyphens', () => {
    expect(spanNamePeerTokens('find turms-config-pre.groupType')).toEqual([
      'find',
      'turms-config-pre.groupType',
      'turms-config-pre',
      'groupType',
    ]);
    expect(spanNamePeerTokens('getMore turms-config-pre.sharedClusterProperties')).toContain('turms-config-pre');
    expect(spanNamePeerTokens('find turms-config-pre.groupType')).not.toContain('turms');
  });

  it('takes the SQL database name from VERB db.table', () => {
    expect(spanNamePeerTokens('SELECT turms.t_chatroom_admin')).toEqual(['SELECT', 'turms.t_chatroom_admin', 'turms', 't_chatroom_admin']);
    expect(spanNamePeerTokens('SELECT turms')).toEqual(['SELECT', 'turms']);
  });
});

describe('filterEdgesByPeerTokens', () => {
  const mixed: PharosServiceEdge[] = [
    edge({ client: 'turms-business-service', server: 'turms-config-test', connectionType: 'database', requestCount: 10 }),
    edge({ client: 'turms-business-service', server: 'turms-test', connectionType: 'database', requestCount: 20 }),
    edge({ client: 'turms-business-service', server: 'turms', connectionType: 'database', requestCount: 5 }),
    edge({ client: 'turms-business-service', server: 'unknown', connectionType: 'virtual_node', requestCount: 3 }),
    edge({ client: 'user', server: 'turms-business-service', requestCount: 2 }),
  ];

  it('drops test mongodb peers that do not appear in pre CLIENT spans, keeps mysql turms and generic nodes', () => {
    const tokens = peerTokensFromSpanNames([
      'getMore turms-config-pre.sharedClusterProperties',
      'SELECT turms',
      'SELECT turms.t_chatroom_admin',
    ]);
    const kept = filterEdgesByPeerTokens(mixed, 'turms-business-service', tokens).map((item) => item.server);
    expect(kept).toEqual(['turms', 'unknown', 'turms-business-service']);
  });

  it('keeps RPC edges even when the peer name is absent from span tokens', () => {
    const edges = [edge({ client: 'turms-business-service', server: 'turms-gateway', requestCount: 8 })];
    expect(filterEdgesByPeerTokens(edges, 'turms-business-service', new Set())).toEqual(edges);
  });
});
