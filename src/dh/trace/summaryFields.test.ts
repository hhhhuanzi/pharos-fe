import { resolveRootInterface, resolveRootType } from './summaryFields';

describe('resolveRootType', () => {
  it('uses db.system as a short label', () => {
    expect(resolveRootType([{ key: 'db.system', value: 'MySQL' }])).toBe('mysql');
  });

  it('falls back to older db.type', () => {
    expect(resolveRootType([{ key: 'db.type', value: 'redis' }])).toBe('redis');
  });

  it('maps HTTP method/path evidence to web', () => {
    expect(resolveRootType([{ key: 'http.method', value: 'GET' }])).toBe('web');
    expect(resolveRootType([{ key: 'http.route', value: '/orders' }])).toBe('web');
  });

  it('maps SkyWalking HTTP layer to web', () => {
    expect(resolveRootType([{ key: 'layer', value: 'HTTP' }, { key: 'component', value: 'Tomcat' }])).toBe('web');
  });

  it('prefers component over a generic SkyWalking Database layer', () => {
    expect(resolveRootType([{ key: 'layer', value: 'Database' }, { key: 'component', value: 'Mysql' }])).toBe('mysql');
  });

  it('uses component when no db/http/layer field is present', () => {
    expect(resolveRootType([{ key: 'component', value: 'Mysql' }])).toBe('mysql');
  });

  it('does not invent a type from span.kind alone', () => {
    expect(resolveRootType([{ key: 'span.kind', value: 'server' }])).toBe('');
  });

  it('returns empty when there are no reliable fields', () => {
    expect(resolveRootType(undefined)).toBe('');
    expect(resolveRootType([])).toBe('');
  });
});

describe('resolveRootInterface', () => {
  it('joins method and path, stripping the host from a full URL', () => {
    expect(
      resolveRootInterface({
        operationName: 'HTTP GET',
        tags: [
          { key: 'http.method', value: 'GET' },
          { key: 'http.url', value: 'https://api.example.com/orders?id=1' },
        ],
      }),
    ).toBe('GET /orders?id=1');
  });

  it('uses SQL when that is what the span carries', () => {
    expect(
      resolveRootInterface({
        operationName: 'Mysql/query',
        tags: [{ key: 'db.statement', value: 'SELECT * FROM orders' }],
      }),
    ).toBe('SELECT * FROM orders');
  });

  it('includes SQL after method+path when both exist', () => {
    expect(
      resolveRootInterface({
        operationName: 'query',
        tags: [
          { key: 'http.method', value: 'POST' },
          { key: 'http.target', value: '/query' },
          { key: 'db.statement', value: 'SELECT 1' },
        ],
      }),
    ).toBe('POST /query SELECT 1');
  });

  it('falls back to operationName when tags cannot be assembled', () => {
    expect(resolveRootInterface({ operationName: 'GET /orders', tags: [] })).toBe('GET /orders');
    expect(resolveRootInterface(undefined)).toBe('');
  });
});
