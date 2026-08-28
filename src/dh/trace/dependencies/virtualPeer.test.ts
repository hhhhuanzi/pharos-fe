import type { TraceResponse } from '@/pages/traceCpt/type';
import {
  aggregateVirtualPeerSpans,
  attributeHintForNode,
  formatPeerInstance,
  spanMatchesVirtualNode,
} from './virtualPeer';

function tags(pairs: Record<string, string | number | boolean>) {
  return Object.entries(pairs).map(([key, value]) => ({ key, value }));
}

/** Emitters allowed in the fixtures below: `redisTrace` emits as `quote`, the mixed trace as `rome-sec-quote`. */
const ALLOW_FIXTURE_EMITTERS = { allowedServices: new Set(['quote', 'rome-sec-quote']) };

function redisTrace(spanTags: Record<string, string | number | boolean>, processTags: Record<string, string> = {}, spanId = 's1'): TraceResponse {
  return {
    traceID: 'aaa',
    processes: {
      p0: {
        serviceName: 'quote',
        tags: tags(processTags),
      },
    },
    spans: [
      {
        spanID: spanId,
        traceID: 'aaa',
        processID: 'p0',
        operationName: 'GET',
        startTime: 1,
        duration: 2,
        logs: [],
        flags: 0,
        tags: tags({ 'span.kind': 'client', 'db.system': 'redis', ...spanTags }),
      },
    ],
  };
}

describe('spanMatchesVirtualNode', () => {
  it('matches other_sql against a concrete SQL db.system unless db.name is already a sibling node', () => {
    expect(spanMatchesVirtualNode(tags({ 'span.kind': 'client', 'db.system': 'clickhouse' }), 'other_sql')).toBe(true);
    expect(
      spanMatchesVirtualNode(tags({ 'span.kind': 'client', 'db.system': 'clickhouse', 'db.name': 'sec' }), 'other_sql', {
        siblingDbNames: new Set(['sec']),
      }),
    ).toBe(false);
    expect(spanMatchesVirtualNode(tags({ 'span.kind': 'client', 'db.system': 'redis' }), 'other_sql')).toBe(false);
  });

  it('matches a database virtual node via db.name or peer.service', () => {
    expect(spanMatchesVirtualNode(tags({ 'span.kind': 'client', 'db.name': 'sec' }), 'sec')).toBe(true);
    expect(spanMatchesVirtualNode(tags({ 'span.kind': 'client', 'peer.service': 'rome' }), 'rome')).toBe(true);
  });

  it('rejects server spans even when db.system matches', () => {
    expect(spanMatchesVirtualNode(tags({ 'span.kind': 'server', 'db.system': 'redis' }), 'redis')).toBe(false);
  });

  it('treats unknown as outbound spans with no db/peer name but a peer address', () => {
    expect(
      spanMatchesVirtualNode(tags({ 'span.kind': 'client', 'server.address': '10.0.0.8', 'server.port': 6379 }), 'unknown'),
    ).toBe(true);
    expect(
      spanMatchesVirtualNode(tags({ 'span.kind': 'client', 'network.peer.address': '172.22.65.3', 'network.peer.port': 6379 }), 'unknown'),
    ).toBe(true);
    expect(spanMatchesVirtualNode(tags({ 'span.kind': 'client', 'db.system': 'redis' }), 'unknown')).toBe(false);
  });

  it('keeps AMQP / messaging spans for rabbitmq and drops ClickHouse HTTPS POSTs', () => {
    expect(
      spanMatchesVirtualNode(
        tags({
          'span.kind': 'client',
          'messaging.system': 'rabbitmq',
          'network.peer.address': '10.72.129.23',
          'network.peer.port': 5672,
        }),
        'rabbitmq',
        { operationName: 'basic.ack' },
      ),
    ).toBe(true);
    expect(
      spanMatchesVirtualNode(
        tags({
          'span.kind': 'client',
          'network.peer.address': '10.72.129.23',
          'network.peer.port': 5672,
        }),
        'rabbitmq',
        { operationName: 'basic.ack' },
      ),
    ).toBe(true);
    expect(
      spanMatchesVirtualNode(
        tags({
          'span.kind': 'client',
          'http.method': 'POST',
          'server.address': 'yex9qpm2v9.asia-southeast1.p.gcp.clickhouse.cloud',
          'server.port': 8443,
        }),
        'rabbitmq',
        { operationName: 'POST' },
      ),
    ).toBe(false);
    expect(
      spanMatchesVirtualNode(
        tags({
          'span.kind': 'client',
          'db.system': 'clickhouse',
          'server.address': '10.0.0.8',
          'server.port': 8443,
        }),
        'rabbitmq',
        { operationName: 'POST' },
      ),
    ).toBe(false);
  });
});

describe('attributeHintForNode', () => {
  it('hints db.system for known systems, messaging.system for MQ, db.name otherwise; generic SQL is unhinted', () => {
    expect(attributeHintForNode('redis')).toEqual({ 'db.system': 'redis' });
    expect(attributeHintForNode('rabbitmq')).toEqual({ 'messaging.system': 'rabbitmq' });
    expect(attributeHintForNode('other_sql')).toBeUndefined();
    expect(attributeHintForNode('sec')).toEqual({ 'db.name': 'sec' });
    expect(attributeHintForNode('unknown')).toBeUndefined();
  });
});

describe('aggregateVirtualPeerSpans', () => {
  it('curates network.peer.* and resource env, and hides empty key rows from the main list', () => {
    const result = aggregateVirtualPeerSpans(
      [
        redisTrace(
          {
            'network.peer.address': '172.22.65.3',
            'network.peer.port': 6379,
            'db.statement': 'GET foo',
          },
          { 'deployment.environment.name': 'test', 'k8s.pod.ip': '10.1.2.3' },
        ),
      ],
      'redis',
      false,
      ALLOW_FIXTURE_EMITTERS,
    );

    expect(result.matchedSpans).toHaveLength(1);
    expect(result.instances).toEqual([
      {
        address: '172.22.65.3',
        port: '6379',
        addressKeys: ['network.peer.address'],
        portKeys: ['network.peer.port'],
        spanCount: 1,
        dbSystem: 'redis',
      },
    ]);
    expect(formatPeerInstance(result.instances[0])).toBe('172.22.65.3:6379');

    const byId = Object.fromEntries(result.curated.map((row) => [row.id, row]));
    expect(byId.db_system).toEqual({ id: 'db_system', values: ['redis'], sourceKeys: ['db.system'] });
    expect(byId.statement).toEqual({ id: 'statement', values: ['GET foo'], sourceKeys: ['db.statement'] });
    expect(byId.environment).toEqual({
      id: 'environment',
      values: ['test'],
      sourceKeys: ['deployment.environment.name'],
    });
    expect(byId.db_name).toBeUndefined();
    expect(byId.peer_service).toBeUndefined();
    expect(result.curated.map((row) => row.id)).not.toContain('peer_address');

    const missingIds = result.missing.map((row) => row.id);
    expect(missingIds).toEqual(['db_name', 'peer_service']);

    const extra = Object.fromEntries(result.extraRows.map((row) => [row.key, row.values]));
    expect(extra['k8s.pod.ip']).toEqual(['10.1.2.3']);
    expect(extra['network.peer.address']).toBeUndefined();
    expect(extra['db.system']).toBeUndefined();
  });

  it('prefers network.peer.address over net.peer.name / server.address on the same span', () => {
    const result = aggregateVirtualPeerSpans(
      [
        redisTrace({
          'network.peer.address': '172.22.65.3',
          'net.peer.name': 'redis.ns.svc',
          'server.address': '10.0.0.8',
          'network.peer.port': 6379,
          'net.peer.port': 6380,
        }),
      ],
      'redis',
      false,
      ALLOW_FIXTURE_EMITTERS,
    );
    expect(result.instances).toHaveLength(1);
    expect(result.instances[0].address).toBe('172.22.65.3');
    expect(result.instances[0].port).toBe('6379');
    expect(result.instances[0].addressKeys).toEqual(['network.peer.address']);
    expect(result.extraRows.some((row) => row.key === 'net.peer.name')).toBe(true);
  });

  it('falls back along the address/port lists when new semconv keys are absent', () => {
    const result = aggregateVirtualPeerSpans(
      [redisTrace({ 'net.peer.name': 'redis.ns.svc', 'net.peer.port': 6379 })],
      'redis',
      false,
      ALLOW_FIXTURE_EMITTERS,
    );
    expect(result.instances[0]).toMatchObject({
      address: 'redis.ns.svc',
      port: '6379',
      addressKeys: ['net.peer.name'],
      portKeys: ['net.peer.port'],
      dbSystem: 'redis',
    });
  });

  it('aggregates many spans hitting the same redis node into one instance', () => {
    const traces = Array.from({ length: 40 }, (_, i) =>
      redisTrace({ 'network.peer.address': '172.22.65.3', 'network.peer.port': 6379 }, {}, `s${i}`),
    );
    traces.push(redisTrace({ 'network.peer.address': '172.22.65.4', 'network.peer.port': 6379 }, {}, 'other'));
    const result = aggregateVirtualPeerSpans(traces, 'redis', false, ALLOW_FIXTURE_EMITTERS);
    expect(result.matchedSpans).toHaveLength(41);
    expect(result.instances.map((item) => ({ id: formatPeerInstance(item), n: item.spanCount }))).toEqual([
      { id: '172.22.65.3:6379', n: 40 },
      { id: '172.22.65.4:6379', n: 1 },
    ]);
  });

  it('does not invent values for keys that never appeared', () => {
    const result = aggregateVirtualPeerSpans([redisTrace({})], 'redis', false, ALLOW_FIXTURE_EMITTERS);
    expect(result.curated.find((row) => row.id === 'statement')).toBeUndefined();
    expect(result.missing.map((row) => row.id)).toEqual(expect.arrayContaining(['peer_address', 'peer_port', 'statement']));
    expect(result.instances).toEqual([]);
  });

  it('truncates long db.statement values', () => {
    const long = `GET ${'x'.repeat(250)}`;
    const result = aggregateVirtualPeerSpans([redisTrace({ 'db.statement': long })], 'redis', false, ALLOW_FIXTURE_EMITTERS);
    const statement = result.curated.find((row) => row.id === 'statement');
    expect(statement?.values[0].endsWith('…')).toBe(true);
    expect(statement?.values[0].length).toBe(201);
  });

  it('uses db.namespace when db.name is absent, and db.operation when statement is absent', () => {
    const result = aggregateVirtualPeerSpans(
      [redisTrace({ 'db.namespace': '0', 'db.operation': 'HGET' })],
      'redis',
      false,
      ALLOW_FIXTURE_EMITTERS,
    );
    const byId = Object.fromEntries(result.curated.map((row) => [row.id, row]));
    expect(byId.db_name).toEqual({ id: 'db_name', values: ['0'], sourceKeys: ['db.namespace'] });
    expect(byId.statement).toEqual({ id: 'statement', values: ['HGET'], sourceKeys: ['db.operation'] });
  });

  it('does not fold ClickHouse Cloud HTTPS POSTs into a rabbitmq instance table', () => {
    const mixed: TraceResponse = {
      traceID: 'mix',
      processes: { p0: { serviceName: 'rome-sec-quote', tags: [] } },
      spans: [
        {
          spanID: 'amqp',
          traceID: 'mix',
          processID: 'p0',
          operationName: 'basic.ack',
          startTime: 1,
          duration: 2,
          logs: [],
          flags: 0,
          tags: tags({
            'span.kind': 'client',
            'messaging.system': 'rabbitmq',
            'network.peer.address': '10.72.129.23',
            'network.peer.port': 5672,
          }),
        },
        {
          spanID: 'http',
          traceID: 'mix',
          processID: 'p0',
          operationName: 'POST',
          startTime: 3,
          duration: 4,
          logs: [],
          flags: 0,
          tags: tags({
            'span.kind': 'client',
            'http.method': 'POST',
            'server.address': 'yex9qpm2v9.asia-southeast1.p.gcp.clickhouse.cloud',
            'server.port': 8443,
          }),
        },
      ],
    };
    const result = aggregateVirtualPeerSpans([mixed], 'rabbitmq', false, ALLOW_FIXTURE_EMITTERS);
    expect(result.matchedSpans.map((span) => span.operation)).toEqual(['basic.ack']);
    expect(result.instances.map((row) => formatPeerInstance(row))).toEqual(['10.72.129.23:5672']);
    expect(result.instances[0].messagingSystem).toBe('rabbitmq');
  });
});

/**
 * A trace fetched for `turms-gateway` also carries what `nome-sec-admin` did downstream. Both hit
 * the same shared mysql node, so matching on the node alone would leak the other team's statement.
 */
const SHARED_MYSQL_TRACE: TraceResponse = {
  traceID: 'shared',
  processes: {
    p0: { serviceName: 'turms-gateway', tags: [] },
    p1: { serviceName: 'nome-sec-admin', tags: [] },
  },
  spans: [
    {
      spanID: 'gateway-sql',
      traceID: 'shared',
      processID: 'p0',
      operationName: 'SELECT turms',
      startTime: 1,
      duration: 2,
      logs: [],
      flags: 0,
      tags: tags({
        'span.kind': 'client',
        'db.system': 'mysql',
        'db.statement': 'SELECT * FROM turms_user',
        'network.peer.address': '10.0.0.9',
        'network.peer.port': 3306,
      }),
    },
    {
      spanID: 'admin-sql',
      traceID: 'shared',
      processID: 'p1',
      operationName: 'SELECT sec',
      startTime: 3,
      duration: 4,
      logs: [],
      flags: 0,
      tags: tags({
        'span.kind': 'client',
        'db.system': 'mysql',
        'db.statement': 'SELECT * FROM sec_secret',
        'network.peer.address': '10.0.0.9',
        'network.peer.port': 3306,
      }),
    },
  ],
};

describe('aggregateVirtualPeerSpans emitter whitelist', () => {
  it('drops spans emitted by a service outside the whitelist, even inside an allowed caller’s trace', () => {
    const result = aggregateVirtualPeerSpans([SHARED_MYSQL_TRACE], 'mysql', false, {
      allowedServices: new Set(['turms-gateway']),
    });

    expect(result.matchedSpans.map((span) => span.service)).toEqual(['turms-gateway']);
    expect(result.matchedSpans.map((span) => span.spanId)).toEqual(['gateway-sql']);

    const statement = result.curated.find((row) => row.id === 'statement');
    expect(statement?.values).toEqual(['SELECT * FROM turms_user']);
    expect(result.extraRows.some((row) => row.values.includes('SELECT * FROM sec_secret'))).toBe(false);
    expect(result.instances.map((row) => row.spanCount)).toEqual([1]);
  });

  it('keeps both emitters for a viewAll whitelist', () => {
    const result = aggregateVirtualPeerSpans([SHARED_MYSQL_TRACE], 'mysql', false, {
      allowedServices: new Set(['turms-gateway', 'nome-sec-admin']),
    });
    expect(result.matchedSpans.map((span) => span.service)).toEqual(['turms-gateway', 'nome-sec-admin']);
    expect(result.curated.find((row) => row.id === 'statement')?.values).toEqual([
      'SELECT * FROM sec_secret',
      'SELECT * FROM turms_user',
    ]);
  });

  it('fails closed on an empty whitelist instead of aggregating everything', () => {
    const result = aggregateVirtualPeerSpans([SHARED_MYSQL_TRACE], 'mysql', false, { allowedServices: new Set<string>() });
    expect(result.matchedSpans).toEqual([]);
    expect(result.instances).toEqual([]);
    expect(result.curated).toEqual([]);
  });
});
