import { buildServiceLogIndexPatternName, hasAmbiguousNamespaces, matchIndexPattern, pickNamespace, uniqueNamespaces } from './indexPattern';

describe('buildServiceLogIndexPatternName', () => {
  it('joins trimmed namespace and env with a wildcard, keeping env case', () => {
    expect(buildServiceLogIndexPatternName('turms', 'test')).toBe('turms-test*');
    expect(buildServiceLogIndexPatternName(' turms ', ' Test ')).toBe('turms-Test*');
  });

  it('does not guess when namespace or env is missing', () => {
    expect(buildServiceLogIndexPatternName(undefined, 'test')).toBeUndefined();
    expect(buildServiceLogIndexPatternName('turms', undefined)).toBeUndefined();
    expect(buildServiceLogIndexPatternName('  ', 'test')).toBeUndefined();
    expect(buildServiceLogIndexPatternName('turms', '')).toBeUndefined();
  });
});

describe('pickNamespace', () => {
  it('prefers the URL namespace and only uses a unique association', () => {
    expect(pickNamespace('turms', ['other'])).toBe('turms');
    expect(pickNamespace(undefined, ['turms'])).toBe('turms');
    expect(pickNamespace('', [' turms ', 'turms'])).toBe('turms');
    expect(pickNamespace(undefined, ['turms', 'pre-turms'])).toBeUndefined();
    expect(pickNamespace(undefined, [])).toBeUndefined();
  });
});

describe('hasAmbiguousNamespaces', () => {
  it('is only ambiguous when URL is empty and association has more than one ns', () => {
    expect(hasAmbiguousNamespaces(undefined, ['turms', 'pre-turms'])).toBe(true);
    expect(hasAmbiguousNamespaces('turms', ['turms', 'pre-turms'])).toBe(false);
    expect(hasAmbiguousNamespaces(undefined, ['turms'])).toBe(false);
  });
});

describe('uniqueNamespaces', () => {
  it('drops blanks and duplicates while keeping first-seen order', () => {
    expect(uniqueNamespaces([' turms ', '', 'pre-turms', 'turms'])).toEqual(['turms', 'pre-turms']);
  });
});

describe('matchIndexPattern', () => {
  const list = [
    { id: 1, name: 'turms-test*', datasource_id: 9 },
    { id: 2, name: 'turms*', datasource_id: 9 },
    { id: 3, name: 'k8s-pod-*', datasource_id: 9 },
    { id: 4, name: 'rome-sec-prod', datasource_id: 8 },
  ] as const;

  it('prefers an exact name, then equal slug, and does not take a shorter prefix pattern', () => {
    expect(matchIndexPattern([...list], 'turms-test*')).toEqual(list[0]);
    expect(matchIndexPattern([{ id: 4, name: 'turms-test' }], 'turms-test*')).toEqual({ id: 4, name: 'turms-test' });
    expect(matchIndexPattern([list[1], list[2]], 'turms-test*')).toBeUndefined();
    expect(matchIndexPattern([...list], 'rome-sec-prod*')).toEqual(list[3]);
  });
});
