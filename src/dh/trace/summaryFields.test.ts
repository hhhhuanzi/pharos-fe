import { resolveRootInterface } from './summaryFields';

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
