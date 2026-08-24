import type { PharosServiceEdge } from '../contract';
import type { PeerInstance, VirtualPeerAggregate } from './virtualPeer';
import {
  displayPeerLabel,
  enrichVirtualGraph,
  formatRedisDatabase,
  glyphForSystem,
  inferPeerGlyph,
  isGenericSqlNodeName,
  isMessagingSystemName,
  peerTypeFromName,
  remapGraphNodes,
  virtualNodeCaption,
} from './peerType';

function edge(client: string, server: string, connectionType = '', requestCount = 1, errorRate = 0): PharosServiceEdge {
  return { client, server, connectionType, requestCount, failedCount: requestCount * errorRate, errorRate };
}

function meta(
  system: string,
  dbName?: string,
  spans = 1,
  extra?: { instances?: PeerInstance[]; extraRows?: VirtualPeerAggregate['extraRows'] },
): Pick<VirtualPeerAggregate, 'curated' | 'matchedSpans' | 'extraRows' | 'instances'> {
  const curated: VirtualPeerAggregate['curated'] = [{ id: 'db_system', values: [system], sourceKeys: ['db.system'] }];
  if (dbName) curated.push({ id: 'db_name', values: [dbName], sourceKeys: ['db.name'] });
  return {
    curated,
    extraRows: extra?.extraRows || [],
    instances: extra?.instances || [],
    matchedSpans: Array.from({ length: spans }, (_, i) => ({ traceId: `t${i}`, spanId: `s${i}`, operation: 'q', service: 'quote' })),
  };
}

function instance(address: string, port: string): PeerInstance {
  return { address, port, addressKeys: ['network.peer.address'], portKeys: port ? ['network.peer.port'] : [], spanCount: 1 };
}

describe('peerTypeFromName', () => {
  it('never uses the person glyph except for synthetic user', () => {
    expect(peerTypeFromName('user', 'virtual_node').glyph).toBe('user');
    expect(peerTypeFromName('redis', 'virtual_node').glyph).toBe('redis');
    expect(peerTypeFromName('other_sql', 'virtual_node').glyph).toBe('db');
    expect(peerTypeFromName('unknown', 'virtual_node').glyph).toBe('unknown');
    expect(peerTypeFromName('sec', 'database').glyph).toBe('db');
    expect(inferPeerGlyph('rome-sec-quote', 'service', '')).toBe('service');
  });

  it('maps db.system tokens to short display names', () => {
    expect(displayPeerLabel('clickhouse')).toBe('ck');
    expect(displayPeerLabel('postgresql')).toBe('pgsql');
    expect(displayPeerLabel('postgres')).toBe('pgsql');
    expect(displayPeerLabel('elasticsearch')).toBe('es');
    expect(displayPeerLabel('opensearch')).toBe('es');
    expect(displayPeerLabel('mongodb')).toBe('mongo');
    expect(displayPeerLabel('mysql')).toBe('mysql');
    expect(displayPeerLabel('doris')).toBe('doris');
    expect(displayPeerLabel('kafka')).toBe('kafka');
    expect(glyphForSystem('clickhouse')).toBe('db');
    expect(glyphForSystem('redis')).toBe('redis');
    expect(glyphForSystem('kafka')).toBe('mq');
    expect(glyphForSystem('rabbitmq')).toBe('mq');
    expect(isGenericSqlNodeName('other_sql')).toBe(true);
    expect(isMessagingSystemName('rabbitmq')).toBe(true);
    expect(isMessagingSystemName('clickhouse')).toBe(false);
  });
});

describe('virtualNodeCaption', () => {
  it('puts middleware type on the first line and db.name on the second', () => {
    expect(virtualNodeCaption('sec', 'database', meta('clickhouse', 'sec'))).toEqual({ title: 'clickhouse', subtitle: 'sec' });
    expect(virtualNodeCaption('redis', 'virtual_node', meta('redis', '0'))).toEqual({ title: 'redis', subtitle: 'db0' });
    expect(
      virtualNodeCaption(
        'redis',
        'virtual_node',
        meta('redis', undefined, 1, { extraRows: [{ key: 'db.redis.database_index', values: ['1', '10'] }] }),
      ),
    ).toEqual({ title: 'redis', subtitle: 'db1/db10' });
    expect(virtualNodeCaption('user', 'virtual_node', undefined)).toEqual({ title: 'user', subtitle: '' });
    expect(formatRedisDatabase('10')).toBe('db10');
    expect(formatRedisDatabase('db0')).toBe('db0');
    expect(formatRedisDatabase('sec')).toBe('');
  });

  it('stays single-line when there is no real second-line value', () => {
    expect(virtualNodeCaption('user', 'virtual_node', meta('clickhouse', 'sec'))).toEqual({ title: 'user', subtitle: '' });
    expect(virtualNodeCaption('rabbitmq', 'messaging_system', meta('rabbitmq'))).toEqual({ title: 'rabbitmq', subtitle: '' });
    expect(virtualNodeCaption('redis', 'virtual_node', meta('redis'))).toEqual({ title: 'redis', subtitle: '' });
    expect(virtualNodeCaption('redis', 'virtual_node', meta('redis', 'cache'))).toEqual({ title: 'redis', subtitle: '' });
    expect(virtualNodeCaption('clickhouse', 'database', meta('clickhouse'))).toEqual({ title: 'clickhouse', subtitle: '' });
    expect(virtualNodeCaption('mysql', 'database', meta('mysql'))).toEqual({ title: 'mysql', subtitle: '' });
  });

  it('shows MQ destination / vhost / queue only when those tags exist', () => {
    expect(
      virtualNodeCaption(
        'rabbitmq',
        'messaging_system',
        meta('rabbitmq', undefined, 1, { extraRows: [{ key: 'messaging.destination.name', values: ['orders'] }] }),
      ),
    ).toEqual({ title: 'rabbitmq', subtitle: 'orders' });
    expect(
      virtualNodeCaption(
        'rabbitmq',
        'messaging_system',
        meta('rabbitmq', undefined, 1, {
          extraRows: [
            { key: 'rabbitmq.vhost', values: ['sec'] },
            { key: 'rabbitmq.queue', values: ['jobs'] },
          ],
        }),
      ),
    ).toEqual({ title: 'rabbitmq', subtitle: 'sec · jobs' });
  });
});

describe('enrichVirtualGraph', () => {
  const graph = [
    edge('user', 'quote', 'virtual_node'),
    edge('quote', 'sec', 'database', 10),
    edge('quote', 'other_sql', 'virtual_node', 4),
    edge('quote', 'redis', 'virtual_node', 20),
  ];

  it('keeps other_sql until traces arrive (does not merge on name alone)', () => {
    const result = enrichVirtualGraph(graph, new Map());
    expect(result.edges.some((item) => item.server === 'other_sql')).toBe(true);
    expect(result.glyphs.other_sql).toBe('db');
    expect(result.glyphs.redis).toBe('redis');
    expect(result.glyphs.user).toBe('user');
    expect(result.labels.other_sql).toBe('other_sql');
    expect(result.labels.sec).toBe('sec');
    expect(result.subtitles.sec).toBeUndefined();
  });

  it('renames other_sql to clickhouse when traces have db.system=clickhouse and no named twin', () => {
    const edges = [edge('quote', 'other_sql', 'virtual_node'), edge('quote', 'redis', 'virtual_node')];
    const metas = new Map([['other_sql', meta('clickhouse')]]);
    const result = enrichVirtualGraph(edges, metas);
    expect(result.labels.other_sql).toBe('clickhouse');
    expect(result.edges.some((item) => item.server === 'other_sql')).toBe(true);
    expect(result.glyphs.other_sql).toBe('db');
  });

  it('shows clickhouse / sec on the named database node instead of only sec', () => {
    const metas = new Map([['sec', meta('clickhouse', 'sec')]]);
    const result = enrichVirtualGraph(graph, metas);
    expect(result.labels.sec).toBe('clickhouse');
    expect(result.subtitles.sec).toBe('sec');
    expect(result.glyphs.sec).toBe('db');
  });

  it('corrects unknown to rabbitmq when every instance is AMQP 5672', () => {
    const edges = [edge('quote', 'unknown', 'virtual_node')];
    const destination = [{ key: 'messaging.destination.name', values: ['orders'] }] as const;
    const metas = new Map([
      [
        'unknown',
        {
          curated: [],
          extraRows: [...destination],
          matchedSpans: [{ traceId: 't0', spanId: 's0', operation: 'publish', service: 'quote' }],
          instances: [instance('10.72.129.23', '5672'), instance('10.72.129.24', '5672')],
        },
      ],
    ]);
    const result = enrichVirtualGraph(edges, metas);
    expect(result.labels.unknown).toBe('rabbitmq');
    expect(result.glyphs.unknown).toBe('mq');
    expect(result.subtitles.unknown).toBe('orders');
    expect(result.edges.some((item) => item.server === 'unknown')).toBe(true);
  });

  it('does not relabel a mixed unknown bucket to rabbitmq', () => {
    const edges = [edge('turms-business-service', 'unknown', 'virtual_node')];
    const extraRows = [
      { key: 'messaging.system', values: ['rabbitmq'] },
      { key: 'messaging.destination.name', values: ['rome.sec.quote.delay.release'] },
    ] as const;
    const instances = [
      { ...instance('172.22.0.27', '8848'), spanCount: 36 },
      { ...instance('rome-sec-monitoring-alert', '80'), spanCount: 31 },
      { ...instance('yex9qpm2v9.asia-southeast1.p.gcp.clickhouse.cloud', '8443'), spanCount: 12 },
      { ...instance('10.0.0.8', '20880'), spanCount: 9 },
      { ...instance('10.72.128.19', '5672'), spanCount: 7 },
    ] as const;
    const metas = new Map([
      [
        'unknown',
        {
          curated: [],
          extraRows: [...extraRows],
          matchedSpans: [{ traceId: 't0', spanId: 's0', operation: 'call', service: 'turms-business-service' }],
          instances: [...instances],
        },
      ],
    ]);
    const result = enrichVirtualGraph(edges, metas);
    expect(result.labels.unknown).toBe('unknown');
    expect(result.glyphs.unknown).toBe('unknown');
    expect(result.subtitles.unknown).not.toBe('rome.sec.quote.delay.release');
    expect(result.subtitles.unknown).toBe('nacos · http · clickhouse · dubbo · rabbitmq');
    expect(result.edges.some((item) => item.server === 'unknown')).toBe(true);
  });

  it('does not relabel unknown when instance ports disagree', () => {
    const edges = [edge('quote', 'unknown', 'virtual_node')];
    const metas = new Map([
      [
        'unknown',
        {
          curated: [],
          extraRows: [],
          matchedSpans: [{ traceId: 't0', spanId: 's0', operation: 'call', service: 'quote' }],
          instances: [instance('10.72.129.23', '5672'), instance('10.0.0.8', '3306')],
        },
      ],
    ]);
    const result = enrichVirtualGraph(edges, metas);
    expect(result.labels.unknown).toBe('unknown');
    expect(result.glyphs.unknown).toBe('unknown');
  });

  it('lets db.system win over a colliding ClickHouse port', () => {
    const edges = [edge('quote', 'other_sql', 'virtual_node')];
    const metas = new Map([['other_sql', { ...meta('mysql', 'app'), instances: [instance('10.0.0.9', '9000')] }]]);
    const result = enrichVirtualGraph(edges, metas);
    expect(result.labels.other_sql).toBe('mysql');
    expect(result.subtitles.other_sql).toBe('app');
  });

  it('merges other_sql into sec when both are clickhouse and db.name=sec', () => {
    const metas = new Map([
      ['other_sql', meta('clickhouse', 'sec')],
      ['sec', meta('clickhouse', 'sec')],
    ]);
    const result = enrichVirtualGraph(graph, metas);
    expect(result.edges.some((item) => item.server === 'other_sql')).toBe(false);
    const toSec = result.edges.find((item) => item.client === 'quote' && item.server === 'sec');
    expect(toSec?.requestCount).toBe(14);
    expect(toSec?.connectionType).toBe('database');
    expect(result.labels.sec).toBe('clickhouse');
    expect(result.subtitles.sec).toBe('sec');
  });

  it('merges other_sql into the only database sibling when traces did not match a distinct system', () => {
    const metas = new Map([
      ['other_sql', { curated: [], extraRows: [], matchedSpans: [] }],
      ['sec', meta('clickhouse', 'sec')],
    ]);
    const result = enrichVirtualGraph(graph, metas);
    expect(result.edges.some((item) => item.server === 'other_sql')).toBe(false);
    expect(result.edges.some((item) => item.server === 'sec')).toBe(true);
  });

  it('keeps other_sql beside sec when traces show a different system', () => {
    const metas = new Map([
      ['other_sql', meta('mysql', 'app')],
      ['sec', meta('clickhouse', 'sec')],
    ]);
    const result = enrichVirtualGraph(graph, metas);
    expect(result.edges.some((item) => item.server === 'other_sql')).toBe(true);
    expect(result.labels.other_sql).toBe('mysql');
    expect(result.subtitles.other_sql).toBe('app');
    expect(result.edges.some((item) => item.server === 'sec')).toBe(true);
  });
});

describe('remapGraphNodes', () => {
  it('drops self-loops and prefers database connection_type when collapsing a pair', () => {
    const edges = [edge('quote', 'other_sql', 'virtual_node', 3), edge('quote', 'sec', 'database', 5)];
    const merged = remapGraphNodes(edges, { other_sql: 'sec' });
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ client: 'quote', server: 'sec', connectionType: 'database', requestCount: 8 });
  });
});
