import { buildServiceLogIndexPatternName, matchIndexPattern, pickBoundTeam } from './indexPattern';

describe('buildServiceLogIndexPatternName', () => {
  it('joins the bound team and env; namespace is not part of the formula', () => {
    // ns=pre-turms, env=pre, 所属业务=turms → turms-pre*，不会拼出 pre-turms-pre*
    expect(buildServiceLogIndexPatternName('turms', 'pre')).toBe('turms-pre*');
    expect(buildServiceLogIndexPatternName('turms', 'prod')).toBe('turms-prod*');
    expect(buildServiceLogIndexPatternName('turms', 'test')).toBe('turms-test*');
    expect(buildServiceLogIndexPatternName(' turms ', ' Test ')).toBe('turms-Test*');
    expect(buildServiceLogIndexPatternName('turms', 'pre')).not.toBe('pre-turms-pre*');
  });

  it('does not guess when team or env is missing, or the team name is invalid', () => {
    expect(buildServiceLogIndexPatternName(undefined, 'pre')).toBeUndefined();
    expect(buildServiceLogIndexPatternName('turms', undefined)).toBeUndefined();
    expect(buildServiceLogIndexPatternName('  ', 'pre')).toBeUndefined();
    expect(buildServiceLogIndexPatternName('turms', '')).toBeUndefined();
    expect(buildServiceLogIndexPatternName('turms1', 'pre')).toBeUndefined();
    expect(buildServiceLogIndexPatternName('Turms', 'pre')).toBeUndefined();
  });
});

describe('pickBoundTeam', () => {
  it('returns the only team, and does not pick the first of many', () => {
    expect(pickBoundTeam([{ id: 1, name: 'turms' }])).toEqual({ status: 'one', name: 'turms' });
    expect(pickBoundTeam([{ id: 1, name: ' turms ' }, { id: 1, name: 'turms' }])).toEqual({ status: 'one', name: 'turms' });
    expect(pickBoundTeam([{ id: 1, name: 'turms' }, { id: 2, name: 'rome-sec' }])).toEqual({ status: 'many' });
    expect(pickBoundTeam([])).toEqual({ status: 'none' });
    expect(pickBoundTeam(undefined)).toEqual({ status: 'none' });
    expect(pickBoundTeam([{ id: 1, name: '  ' }])).toEqual({ status: 'none' });
  });

  it('with a single turms binding and env pre, builds turms-pre* rather than ns+env', () => {
    const picked = pickBoundTeam([{ id: 1, name: 'turms' }]);
    const team = picked.status === 'one' ? picked.name : undefined;
    expect(buildServiceLogIndexPatternName(team, 'pre')).toBe('turms-pre*');
    expect(buildServiceLogIndexPatternName(undefined, 'pre')).toBeUndefined();
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
    expect(matchIndexPattern([...list], 'turms-pre*')).toBeUndefined();
  });
});
