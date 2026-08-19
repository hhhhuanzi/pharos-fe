import {
  inferListTypeFromOperation,
  isInternalFrame,
  resolveDisplayedSpanKind,
  resolveFromOperation,
  resolveRootType,
  resolveTraceKind,
} from './listType';

describe('resolveRootType (tag-based, same rules as waterfall resolveSpanKind)', () => {
  it('maps HTTP method / path evidence to web', () => {
    expect(resolveRootType([{ key: 'http.method', value: 'GET' }])).toBe('web');
    expect(resolveRootType([{ key: 'http.route', value: '/orders' }])).toBe('web');
  });

  it('maps a Nacos URL (with http tags) to nacos, not web', () => {
    expect(
      resolveRootType([
        { key: 'url.full', value: 'http://172.22.0.27:8848/nacos/v1/cs/configs/listener' },
        { key: 'http.request.method', value: 'POST' },
      ]),
    ).toBe('nacos');
  });

  it('maps db.system=clickhouse to sql (engine name stays out of the type column)', () => {
    expect(resolveRootType([{ key: 'db.system', value: 'clickhouse' }])).toBe('sql');
    expect(resolveRootType([{ key: 'db.system', value: 'mysql' }])).toBe('sql');
    expect(resolveRootType([{ key: 'db.type', value: 'PostgreSQL' }])).toBe('sql');
  });

  it('maps redis-like db.system to redis and other cache systems to cache', () => {
    expect(resolveRootType([{ key: 'db.system', value: 'redis' }])).toBe('redis');
    expect(resolveRootType([{ key: 'db.type', value: 'memcached' }])).toBe('cache');
    expect(resolveRootType([{ key: 'layer', value: 'Cache' }])).toBe('cache');
  });

  it('maps SkyWalking HTTP / Database layers via the shared kind rules', () => {
    expect(resolveRootType([{ key: 'layer', value: 'HTTP' }, { key: 'component', value: 'Tomcat' }])).toBe('web');
    expect(resolveRootType([{ key: 'layer', value: 'Database' }, { key: 'component', value: 'Mysql' }])).toBe('sql');
  });

  it('maps messaging / rpc tags and SkyWalking layers', () => {
    expect(resolveRootType([{ key: 'messaging.system', value: 'kafka' }])).toBe('mq');
    expect(resolveRootType([{ key: 'messaging.system', value: 'rabbitmq' }])).toBe('mq');
    expect(resolveRootType([{ key: 'rpc.system', value: 'grpc' }])).toBe('rpc');
    expect(resolveRootType([{ key: 'layer', value: 'MQ' }])).toBe('mq');
    expect(resolveRootType([{ key: 'layer', value: 'RPCFramework' }])).toBe('rpc');
  });

  it('maps rabbitmq consumer tags to mq even when the operation is process', () => {
    expect(resolveRootType([{ key: 'messaging.system', value: 'rabbitmq' }], 'process')).toBe('mq');
    expect(
      resolveTraceKind([
        {
          operationName: 'process',
          tags: [
            { key: 'messaging.system', value: 'rabbitmq' },
            { key: 'messaging.operation', value: 'process' },
            { key: 'span.kind', value: 'consumer' },
          ],
        },
      ]),
    ).toBe('mq');
  });

  it('maps span.kind consumer/producer to mq only with a messaging.* tag', () => {
    expect(
      resolveRootType([
        { key: 'span.kind', value: 'consumer' },
        { key: 'messaging.operation', value: 'process' },
      ]),
    ).toBe('mq');
    expect(resolveRootType([{ key: 'span.kind', value: 'consumer' }])).toBe('');
    expect(resolveRootType([{ key: 'span.kind', value: 'producer' }])).toBe('');
  });

  it('does not invent a type from span.kind or a lone component tag', () => {
    expect(resolveRootType([{ key: 'span.kind', value: 'server' }])).toBe('');
    expect(resolveRootType([{ key: 'component', value: 'Mysql' }])).toBe('');
  });

  it('returns empty when there are no tags (table renders —)', () => {
    expect(resolveRootType(undefined)).toBe('');
    expect(resolveRootType([])).toBe('');
  });
});

describe('resolveFromOperation (heuristic; Jaeger summaries have no root tags)', () => {
  it('maps GET / and POST / and HTTP GET to web', () => {
    expect(resolveFromOperation('GET /')).toBe('web');
    expect(resolveFromOperation('GET /orders')).toBe('web');
    expect(resolveFromOperation('POST /api')).toBe('web');
    expect(resolveFromOperation('HTTP GET')).toBe('web');
    expect(resolveFromOperation('GET:/users')).toBe('web');
    expect(resolveFromOperation('{GET}/users')).toBe('web');
  });

  it('maps bare GET / POST / PUT / PATCH / DELETE / HEAD / OPTIONS to web', () => {
    expect(resolveFromOperation('GET')).toBe('web');
    expect(resolveFromOperation('POST')).toBe('web');
    expect(resolveFromOperation('PUT')).toBe('web');
    expect(resolveFromOperation('PATCH')).toBe('web');
    expect(resolveFromOperation('DELETE')).toBe('web');
    expect(resolveFromOperation('HEAD')).toBe('web');
    expect(resolveFromOperation('OPTIONS')).toBe('web');
  });

  it('maps SQL keywords to sql, including DELETE FROM / DELETE table vs bare HTTP DELETE', () => {
    expect(resolveFromOperation('SELECT 1')).toBe('sql');
    expect(resolveFromOperation('INSERT INTO t VALUES (1)')).toBe('sql');
    expect(resolveFromOperation('UPDATE t SET x = 1')).toBe('sql');
    expect(resolveFromOperation('DELETE FROM orders')).toBe('sql');
    expect(resolveFromOperation('DELETE users')).toBe('sql');
    expect(resolveFromOperation('DELETE /orders')).toBe('web');
    expect(resolveFromOperation('DELETE')).toBe('web');
  });

  it('maps Redis commands (not GET) to redis', () => {
    expect(resolveFromOperation('PING')).toBe('redis');
    expect(resolveFromOperation('INFO')).toBe('redis');
    expect(resolveFromOperation('SET')).toBe('redis');
    expect(resolveFromOperation('HGET')).toBe('redis');
  });

  it('does not guess unknown names or Spring class names as a protocol', () => {
    expect(resolveFromOperation('Mysql/query')).toBe('');
    expect(resolveFromOperation('unknown')).toBe('');
    expect(resolveFromOperation('')).toBe('');
    expect(resolveFromOperation(undefined)).toBe('');
    expect(resolveFromOperation('AcmeApplicationListener.onApplicationEvent')).toBe('');
    expect(resolveFromOperation('ClientWatch.run')).toBe('');
  });

  it('does not guess MQ from a bare process / consume operation', () => {
    expect(resolveFromOperation('process')).toBe('');
    expect(resolveFromOperation('consume')).toBe('');
    expect(resolveRootType(undefined, 'process')).toBe('');
    expect(resolveRootType([], 'process')).toBe('');
    expect(resolveRootType(undefined, 'consume')).toBe('');
  });

  it('keeps inferListTypeFromOperation as an alias', () => {
    expect(inferListTypeFromOperation('GET')).toBe('web');
  });
});

describe('isInternalFrame (generated names, not product class names)', () => {
  it('matches $$Lambda / CGLIB / proxy / kotlin lambda patterns', () => {
    expect(isInternalFrame('Worker$$Lambda.run')).toBe(true);
    expect(isInternalFrame('Worker$$Lambda$123/0x0000000800c0a000')).toBe(true);
    expect(isInternalFrame('Foo$$EnhancerBySpringCGLIB$$abc.intercept')).toBe(true);
    expect(isInternalFrame('$Proxy12')).toBe(true);
    expect(isInternalFrame('Foo$lambda$0$invoke')).toBe(true);
  });

  it('does not match ordinary method names', () => {
    expect(isInternalFrame('GET')).toBe(false);
    expect(isInternalFrame('AcmeApplicationListener.onApplicationEvent')).toBe(false);
    expect(isInternalFrame('ClientWatch.run')).toBe(false);
  });
});

describe('resolveTraceKind (whole trace, not just root)', () => {
  it('uses an HTTP child when the root is only a generated frame', () => {
    expect(
      resolveTraceKind([
        { spanID: 'root', startTime: 1, operationName: 'Scheduler$$Lambda.run' },
        {
          spanID: 'child',
          startTime: 2,
          operationName: 'POST',
          tags: [
            { key: 'http.request.method', value: 'POST' },
            { key: 'url.full', value: 'http://svc.internal/instances' },
            { key: 'http.response.status_code', value: 201 },
          ],
          references: [{ spanID: 'root' }],
        },
      ]),
    ).toBe('web');
  });

  it('uses a Nacos URL on a child, not the generated root name', () => {
    expect(
      resolveTraceKind([
        { spanID: 'root', startTime: 1, operationName: 'Watch$$Lambda.run' },
        {
          spanID: 'child',
          startTime: 2,
          operationName: 'GET',
          tags: [
            { key: 'url.full', value: 'http://172.22.0.27:8848/nacos/v1/ns/instance/list' },
            { key: 'http.request.method', value: 'GET' },
            { key: 'thread.name', value: 'com.alibaba.nacos.client.naming.updater' },
          ],
          references: [{ spanID: 'root' }],
        },
      ]),
    ).toBe('nacos');
  });

  it('maps a summaries-only generated root (no children) to internal', () => {
    expect(resolveTraceKind([{ operationName: 'Worker$$Lambda.run' }])).toBe('internal');
  });

  it('maps bare GET with no tags to web', () => {
    expect(resolveTraceKind([{ operationName: 'GET' }])).toBe('web');
    expect(resolveRootType(undefined, 'GET')).toBe('web');
  });

  it('keeps clickhouse as sql', () => {
    expect(resolveTraceKind([{ tags: [{ key: 'db.system', value: 'clickhouse' }] }])).toBe('sql');
    expect(resolveRootType([{ key: 'db.system', value: 'clickhouse' }], 'GET')).toBe('sql');
  });

  it('prefers root tags over a conflicting child', () => {
    expect(
      resolveTraceKind([
        {
          spanID: 'root',
          startTime: 1,
          operationName: 'GET /orders',
          tags: [{ key: 'http.method', value: 'GET' }],
        },
        {
          spanID: 'child',
          startTime: 2,
          tags: [{ key: 'db.system', value: 'mysql' }],
          references: [{ spanID: 'root' }],
        },
      ]),
    ).toBe('web');
  });
});

describe('resolveDisplayedSpanKind (waterfall row: tags then protocol verbs)', () => {
  it('keeps tag-based kinds, including nacos over generic GET', () => {
    expect(resolveDisplayedSpanKind([{ key: 'http.method', value: 'GET' }], 'GET')).toBe('web');
    expect(
      resolveDisplayedSpanKind(
        [
          { key: 'url.full', value: 'http://172.22.0.27:8848/nacos/v1/ns/instance/list' },
          { key: 'http.request.method', value: 'GET' },
        ],
        'GET',
      ),
    ).toBe('nacos');
    expect(resolveDisplayedSpanKind([{ key: 'db.system', value: 'clickhouse' }], 'query')).toBe('db');
  });

  it('falls back to protocol verbs when the row has no semantic tags', () => {
    expect(resolveDisplayedSpanKind(undefined, 'GET')).toBe('web');
    expect(resolveDisplayedSpanKind([], 'POST')).toBe('web');
    expect(resolveDisplayedSpanKind([], 'SELECT 1')).toBe('db');
    expect(resolveDisplayedSpanKind(undefined, 'process')).toBe('internal');
  });

  it('keeps rabbitmq tags as messaging even when the operation is process', () => {
    expect(resolveDisplayedSpanKind([{ key: 'messaging.system', value: 'rabbitmq' }], 'process')).toBe('messaging');
  });

  it('leaves generated frames internal (child rows carry the real kind)', () => {
    expect(resolveDisplayedSpanKind(undefined, 'Worker$$Lambda.run')).toBe('internal');
  });
});

describe('resolveRootType falls through to the operation heuristic when tags are empty', () => {
  it('classifies GET /orders from the operation name', () => {
    expect(resolveRootType(undefined, 'GET /orders')).toBe('web');
    expect(resolveRootType([], 'SELECT 1')).toBe('sql');
  });

  it('classifies bare POST with no tags as web, not nacos', () => {
    expect(resolveRootType(undefined, 'POST')).toBe('web');
    expect(resolveRootType([], 'POST')).toBe('web');
  });

  it('keeps clickhouse as sql when tags are present', () => {
    expect(resolveRootType([{ key: 'db.system', value: 'clickhouse' }])).toBe('sql');
    expect(resolveRootType([{ key: 'db.system', value: 'clickhouse' }], 'POST')).toBe('sql');
  });

  it('prefers tags over a conflicting operation name', () => {
    expect(resolveRootType([{ key: 'db.system', value: 'clickhouse' }], 'GET /query')).toBe('sql');
  });
});
