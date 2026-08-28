import { filterLockedIndexPatterns, LOCKED_QUERY_STRIP_KEYS, stripLockedQueryKeys, type ServiceLogLock } from './lock';

const lock: ServiceLogLock = {
  datasourceValue: 7,
  indexPatternId: 3,
  indexPatternName: 'turms-test*',
};

describe('filterLockedIndexPatterns', () => {
  it('keeps only the locked index pattern', () => {
    const list = [
      { id: 1, name: 'k8s-pod*' },
      { id: 2, name: 'trade*' },
      { id: 3, name: 'turms-test*' },
      { id: 4, name: 'turms-pre*' },
    ] as const;

    expect(filterLockedIndexPatterns([...list], lock)).toEqual([{ id: 3, name: 'turms-test*' }]);
  });

  it('drops other environments of the same business, not just other businesses', () => {
    const list = [
      { id: 3, name: 'turms-test*' },
      { id: 4, name: 'turms-pre*' },
      { id: 5, name: 'turms-prod*' },
    ] as const;

    expect(filterLockedIndexPatterns([...list], lock).map((item) => item.name)).toEqual(['turms-test*']);
  });

  it('returns empty when the locked pattern is absent or the input is not a list', () => {
    expect(filterLockedIndexPatterns([{ id: 9, name: 'trade*' }], lock)).toEqual([]);
    expect(filterLockedIndexPatterns(undefined as unknown as { id: number }[], lock)).toEqual([]);
  });
});

describe('stripLockedQueryKeys', () => {
  it('drops every field that could retarget the query', () => {
    const restored = {
      mode: 'indices',
      index: 'trade-2026.08.28',
      index_pattern: 2,
      date_field: 'ts',
      allow_hide_system_indices: true,
      cross_cluster_enabled: 1,
      syntax: 'kuery',
      query: 'level: ERROR',
      filters: [{ key: 'kubernetes.container_name', value: 'svc', operator: 'AND' }],
    } as const;

    expect(stripLockedQueryKeys(restored)).toEqual({
      syntax: 'kuery',
      query: 'level: ERROR',
      filters: [{ key: 'kubernetes.container_name', value: 'svc', operator: 'AND' }],
    });
  });

  it('blocks SQL syntax because SQL can name its own index', () => {
    expect(stripLockedQueryKeys({ syntax: 'sql', sql: 'select * from trade', query: '' })).toEqual({ query: '' });
  });

  it('keeps the query text and filters that are safe to restore', () => {
    expect(stripLockedQueryKeys({ query: 'a: b', syntax: 'lucene' })).toEqual({ query: 'a: b', syntax: 'lucene' });
  });

  it('does not mutate the input and is idempotent', () => {
    const input = { mode: 'indices', query: 'a: b' } as const;
    const once = stripLockedQueryKeys(input);
    expect(stripLockedQueryKeys(once as Record<string, unknown>)).toEqual(once);
    expect(input).toEqual({ mode: 'indices', query: 'a: b' });
  });

  it('tolerates nullish input', () => {
    expect(stripLockedQueryKeys(undefined as unknown as Record<string, unknown>)).toEqual({});
  });
});

describe('LOCKED_QUERY_STRIP_KEYS', () => {
  it('covers the QUERY_CACHE_PICK_KEYS fields that select an index', () => {
    expect(LOCKED_QUERY_STRIP_KEYS).toContain('mode');
    expect(LOCKED_QUERY_STRIP_KEYS).toContain('index');
    expect(LOCKED_QUERY_STRIP_KEYS).toContain('index_pattern');
    expect(LOCKED_QUERY_STRIP_KEYS).toContain('date_field');
  });
});
