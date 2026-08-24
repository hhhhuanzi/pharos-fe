import { extractGrantedScopes, filterIndexPatternsByScopes, INDEX_PATTERN_SCOPE_PERM_PREFIX, isScopeCovered, toScopeSlug } from './indexPatternScope';

describe('toScopeSlug', () => {
  it('truncates at the first wildcard and normalizes', () => {
    expect(toScopeSlug('turms-test*')).toBe('turms-test');
    expect(toScopeSlug('k8s-pod-*')).toBe('k8s-pod');
    expect(toScopeSlug('access-nginx*')).toBe('access-nginx');
    expect(toScopeSlug('error-nginx?')).toBe('error-nginx');
    expect(toScopeSlug('redis-slowlog%')).toBe('redis-slowlog');
    expect(toScopeSlug('trade{env}')).toBe('trade');
  });

  it('lowercases and replaces non-alnum runs with hyphen', () => {
    expect(toScopeSlug('My_Index Pattern')).toBe('my-index-pattern');
    expect(toScopeSlug('--Foo.Bar--')).toBe('foo-bar');
  });

  it('returns empty for empty or wildcard-only names', () => {
    expect(toScopeSlug('')).toBe('');
    expect(toScopeSlug('*')).toBe('');
    expect(toScopeSlug('{index}')).toBe('');
  });
});

describe('extractGrantedScopes', () => {
  it('extracts slugs after the view prefix', () => {
    const perms = [
      '/log/index-patterns',
      '/log/index-patterns/raw-index',
      `${INDEX_PATTERN_SCOPE_PERM_PREFIX}turms`,
      `${INDEX_PATTERN_SCOPE_PERM_PREFIX}k8s-pod`,
      `${INDEX_PATTERN_SCOPE_PERM_PREFIX}`,
    ] as const;
    expect(extractGrantedScopes([...perms])).toEqual(['turms', 'k8s-pod']);
  });

  it('returns empty when perms are missing or unrelated', () => {
    expect(extractGrantedScopes(undefined)).toEqual([]);
    const perms = ['/log/index-patterns', '/log/index-patterns/raw-index'] as const;
    expect(extractGrantedScopes([...perms])).toEqual([]);
  });
});

describe('isScopeCovered', () => {
  it('treats granted slug as a prefix with hyphen boundary', () => {
    const granted = ['turms'] as const;
    expect(isScopeCovered('turms', [...granted])).toBe(true);
    expect(isScopeCovered('turms-test', [...granted])).toBe(true);
    expect(isScopeCovered('turms-prod', [...granted])).toBe(true);
    expect(isScopeCovered('turmsx', [...granted])).toBe(false);
    expect(isScopeCovered('k8s-pod', [...granted])).toBe(false);
    expect(isScopeCovered('', [...granted])).toBe(false);
  });
});

describe('filterIndexPatternsByScopes', () => {
  it('keeps only patterns covered by granted scopes', () => {
    const list = [
      { id: 1, name: 'turms-test*' },
      { id: 2, name: 'k8s-pod-*' },
      { id: 3, name: 'access-nginx*' },
      { id: 4, name: 'secret-*' },
    ] as const;
    const granted = ['turms', 'k8s-pod'] as const;

    expect(filterIndexPatternsByScopes([...list], [...granted])).toEqual([
      { id: 1, name: 'turms-test*' },
      { id: 2, name: 'k8s-pod-*' },
    ]);
  });

  it('drops patterns whose slug is empty', () => {
    const list = [{ id: 1, name: '*' }, { id: 2, name: 'trade*' }] as const;
    expect(filterIndexPatternsByScopes([...list], ['trade'])).toEqual([{ id: 2, name: 'trade*' }]);
  });
});
