import { resolveSpanKind, resolveSpanPills } from './spanSemantics';

describe('resolveSpanKind', () => {
  it('maps clickhouse db.system to the db icon', () => {
    expect(resolveSpanKind([{ key: 'db.system', value: 'clickhouse' }])).toBe('db');
  });

  it('maps redis / cache systems to the cache icon, not generic db', () => {
    expect(resolveSpanKind([{ key: 'db.system', value: 'redis' }])).toBe('cache');
    expect(resolveSpanKind([{ key: 'db.type', value: 'memcached' }])).toBe('cache');
    expect(resolveSpanKind([{ key: 'layer', value: 'Cache' }])).toBe('cache');
  });

  it('maps an http(s) url.full without an http.* key to web', () => {
    expect(resolveSpanKind([{ key: 'url.full', value: 'http://svc.internal/instances' }])).toBe('web');
  });

  it('maps a Nacos URL to nacos, not generic web', () => {
    expect(
      resolveSpanKind([
        { key: 'url.full', value: 'http://172.22.0.27:8848/nacos/v1/cs/configs/listener' },
        { key: 'http.request.method', value: 'POST' },
        { key: 'http.response.status_code', value: 200 },
        { key: 'span.kind', value: 'client' },
        { key: 'thread.name', value: 'com.alibaba.nacos.client.Worker.longPolling' },
      ]),
    ).toBe('nacos');
  });

  it('maps thread.name containing nacos, and server.port=8848 plus http', () => {
    expect(resolveSpanKind([{ key: 'thread.name', value: 'com.alibaba.nacos.client.Worker.longPolling' }])).toBe('nacos');
    expect(
      resolveSpanKind([
        { key: 'server.port', value: 8848 },
        { key: 'http.request.method', value: 'POST' },
      ]),
    ).toBe('nacos');
  });

  it('maps host:8848 with a Nacos OpenAPI path to nacos', () => {
    expect(
      resolveSpanKind([
        { key: 'url.full', value: 'http://172.22.0.27:8848/v1/cs/configs/listener' },
        { key: 'http.request.method', value: 'POST' },
      ]),
    ).toBe('nacos');
  });

  it('does not treat a generic /v1/cs path without nacos host evidence as nacos', () => {
    expect(
      resolveSpanKind([
        { key: 'http.target', value: '/v1/cs/configs' },
        { key: 'http.request.method', value: 'GET' },
      ]),
    ).toBe('web');
  });

  it('still maps clickhouse db.system to db when a Nacos-looking URL is also present', () => {
    expect(
      resolveSpanKind([
        { key: 'db.system', value: 'clickhouse' },
        { key: 'url.full', value: 'http://172.22.0.27:8848/nacos/v1/cs/configs/listener' },
      ]),
    ).toBe('db');
  });

  it('maps messaging / rpc prefixes and SkyWalking layers', () => {
    expect(resolveSpanKind([{ key: 'messaging.system', value: 'kafka' }])).toBe('messaging');
    expect(resolveSpanKind([{ key: 'messaging.system', value: 'rabbitmq' }])).toBe('messaging');
    expect(resolveSpanKind([{ key: 'rpc.system', value: 'grpc' }])).toBe('rpc');
    expect(resolveSpanKind([{ key: 'layer', value: 'MQ' }])).toBe('messaging');
    expect(resolveSpanKind([{ key: 'layer', value: 'RPCFramework' }])).toBe('rpc');
  });

  it('maps span.kind consumer/producer only when a messaging.* tag is also present', () => {
    expect(
      resolveSpanKind([
        { key: 'span.kind', value: 'consumer' },
        { key: 'messaging.operation', value: 'process' },
      ]),
    ).toBe('messaging');
    expect(
      resolveSpanKind([
        { key: 'span.kind', value: 'producer' },
        { key: 'messaging.destination.name', value: 'orders' },
      ]),
    ).toBe('messaging');
    expect(resolveSpanKind([{ key: 'span.kind', value: 'consumer' }])).toBe('internal');
    expect(resolveSpanKind([{ key: 'span.kind', value: 'producer' }])).toBe('internal');
    expect(resolveSpanKind([{ key: 'messaging.operation', value: 'process' }])).toBe('internal');
  });

  it('prefers db over http when both namespaces are present', () => {
    expect(
      resolveSpanKind([
        { key: 'db.system', value: 'mysql' },
        { key: 'http.method', value: 'GET' },
      ]),
    ).toBe('db');
  });

  it('returns internal when there are no semantic tags', () => {
    expect(resolveSpanKind(undefined)).toBe('internal');
    expect(resolveSpanKind([])).toBe('internal');
    expect(resolveSpanKind([{ key: 'span.kind', value: 'server' }])).toBe('internal');
  });
});

describe('waterfall row semantics (kind + pills together)', () => {
  it('clickhouse db.system → clickhouse pill + db icon', () => {
    const tags = [{ key: 'db.system', value: 'clickhouse' }];
    expect(resolveSpanKind(tags)).toBe('db');
    expect(resolveSpanPills(tags)).toEqual([{ key: 'db.system', value: 'clickhouse', tone: 'default' }]);
  });

  it('http POST 200 → method/status pills + web icon', () => {
    const tags = [
      { key: 'http.method', value: 'POST' },
      { key: 'http.status_code', value: 200 },
    ];
    expect(resolveSpanKind(tags)).toBe('web');
    expect(resolveSpanPills(tags)).toEqual([
      { key: 'http.method', value: 'POST', tone: 'default' },
      { key: 'http.status_code', value: '200', tone: 'default' },
    ]);
  });

  it('nacos url → Nacos pill + nacos icon (not web)', () => {
    const tags = [
      { key: 'url.full', value: 'http://172.22.0.27:8848/nacos/v1/cs/configs/listener' },
      { key: 'http.request.method', value: 'POST' },
      { key: 'http.response.status_code', value: 200 },
    ];
    expect(resolveSpanKind(tags)).toBe('nacos');
    expect(resolveSpanPills(tags)).toEqual([
      { key: 'http.method', value: 'POST', tone: 'default' },
      { key: 'http.status_code', value: '200', tone: 'default' },
      { key: 'nacos', value: 'Nacos', tone: 'default' },
    ]);
  });

  it('no tags → internal icon and no empty pills', () => {
    expect(resolveSpanKind([])).toBe('internal');
    expect(resolveSpanPills([])).toEqual([]);
    expect(resolveSpanPills(undefined)).toEqual([]);
  });

  it('rabbitmq messaging.system → rabbitmq pill + messaging icon', () => {
    const tags = [
      { key: 'messaging.system', value: 'rabbitmq' },
      { key: 'messaging.operation', value: 'process' },
      { key: 'span.kind', value: 'consumer' },
    ];
    expect(resolveSpanKind(tags)).toBe('messaging');
    expect(resolveSpanPills(tags)).toEqual([{ key: 'messaging.system', value: 'rabbitmq', tone: 'default' }]);
  });
});

describe('resolveSpanPills', () => {
  it('emits a clickhouse db.system pill (not a generic db label)', () => {
    expect(resolveSpanPills([{ key: 'db.system', value: 'clickhouse' }])).toEqual([
      { key: 'db.system', value: 'clickhouse', tone: 'default' },
    ]);
  });

  it('emits method + status pills for HTTP POST 200', () => {
    expect(
      resolveSpanPills([
        { key: 'http.method', value: 'POST' },
        { key: 'http.status_code', value: 200 },
      ]),
    ).toEqual([
      { key: 'http.method', value: 'POST', tone: 'default' },
      { key: 'http.status_code', value: '200', tone: 'default' },
    ]);
  });

  it('marks status >= 400 as error tone and accepts OTel status keys', () => {
    expect(resolveSpanPills([{ key: 'http.response.status_code', value: '404' }])).toEqual([
      { key: 'http.status_code', value: '404', tone: 'error' },
    ]);
    expect(resolveSpanPills([{ key: 'http.status_code', value: 500 }])).toEqual([
      { key: 'http.status_code', value: '500', tone: 'error' },
    ]);
  });

  it('does not emit empty pills when tags are missing or blank', () => {
    expect(resolveSpanPills(undefined)).toEqual([]);
    expect(resolveSpanPills([])).toEqual([]);
    expect(resolveSpanPills([{ key: 'http.method', value: '  ' }])).toEqual([]);
    expect(resolveSpanPills([{ key: 'span.kind', value: 'client' }])).toEqual([]);
  });

  it('emits a rabbitmq messaging.system pill', () => {
    expect(resolveSpanPills([{ key: 'messaging.system', value: 'rabbitmq' }])).toEqual([
      { key: 'messaging.system', value: 'rabbitmq', tone: 'default' },
    ]);
  });

  it('is idempotent and does not mutate the input tags', () => {
    const tags = [{ key: 'db.system', value: 'mysql' }] as const;
    const first = resolveSpanPills([...tags]);
    const second = resolveSpanPills([...tags]);
    expect(first).toEqual(second);
    expect(tags[0]).toEqual({ key: 'db.system', value: 'mysql' });
  });
});
