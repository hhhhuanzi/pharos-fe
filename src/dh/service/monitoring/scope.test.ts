import { buildScopeDiscoveryQuery, parseScopeOptions, resolveScopeOption } from './scope';

const sample = (metric: Record<string, string>) => ({ metric, value: [0, '1'] as [number, string] });

describe('buildScopeDiscoveryQuery', () => {
  it('asks the container metrics which cluster / namespace pairs exist', () => {
    expect(buildScopeDiscoveryQuery('rome-sec-admin')).toBe('count by (cluster, namespace) (container_memory_working_set_bytes{container="rome-sec-admin"})');
  });
});

describe('parseScopeOptions', () => {
  it('dedupes, sorts, and drops series without a cluster', () => {
    const options = parseScopeOptions([
      sample({ cluster: 'k8s-trade-test', namespace: 'trade' }),
      sample({ cluster: 'k8s-devops', namespace: 'sre' }),
      sample({ cluster: 'k8s-trade-test', namespace: 'trade' }),
      sample({ namespace: 'orphan' }),
    ]);
    expect(options).toEqual([
      { cluster: 'k8s-devops', namespace: 'sre' },
      { cluster: 'k8s-trade-test', namespace: 'trade' },
    ]);
  });

  it('keeps a cluster whose namespace label is missing', () => {
    expect(parseScopeOptions([sample({ cluster: 'bare' })])).toEqual([{ cluster: 'bare' }]);
  });
});

describe('resolveScopeOption', () => {
  const options = [
    { cluster: 'k8s-devops', namespace: 'sre' },
    { cluster: 'k8s-trade-test', namespace: 'trade' },
  ];

  it('prefers the requested cluster', () => {
    expect(resolveScopeOption(options, { cluster: 'k8s-trade-test' })).toEqual(options[1]);
  });

  it('ignores a namespace that has no data and keeps the cluster', () => {
    expect(resolveScopeOption(options, { cluster: 'k8s-trade-test', namespace: 'nope' })).toEqual(options[1]);
  });

  it('falls back to the first discovered scope when the preference has no data', () => {
    expect(resolveScopeOption(options, { cluster: 'k8s-arena-test' })).toEqual(options[0]);
    expect(resolveScopeOption(options)).toEqual(options[0]);
  });

  it('trusts the caller when discovery returned nothing', () => {
    expect(resolveScopeOption([], { cluster: 'k8s-devops', namespace: 'sre' })).toEqual({ cluster: 'k8s-devops', namespace: 'sre' });
    expect(resolveScopeOption([], {})).toBeUndefined();
  });
});
