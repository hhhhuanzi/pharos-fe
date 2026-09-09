import { buildScopeDiscoveryQuery, isMonitoringIdentityPending, parseScopeOptions, pickPreferredScope, resolveScopeOption } from './scope';

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

describe('pickPreferredScope', () => {
  const options = [
    { cluster: 'k8s-trade-prod', namespace: 'pre-turms' },
    { cluster: 'k8s-trade-prod', namespace: 'turms' },
  ];

  it('intersects a mixed association list with discovery so scrape labels do not drop the ns', () => {
    expect(pickPreferredScope(options, ['k8s-devops', 'k8s-trade-prod'], ['opentelemetry', 'turms'])).toEqual({
      cluster: 'k8s-trade-prod',
      namespace: 'turms',
    });
  });

  it('still works when only one cluster / namespace arrived', () => {
    expect(pickPreferredScope(options, ['k8s-trade-prod'], ['turms'])).toEqual({ cluster: 'k8s-trade-prod', namespace: 'turms' });
  });
});

describe('resolveScopeOption', () => {
  const options = [
    { cluster: 'k8s-devops', namespace: 'sre' },
    { cluster: 'k8s-trade-test', namespace: 'trade' },
  ];

  it('prefers the requested cluster when that cluster has exactly one namespace', () => {
    expect(resolveScopeOption(options, { cluster: 'k8s-trade-test' })).toEqual(options[1]);
  });

  it('uses the only namespace on that cluster when the preferred ns is not in discovery', () => {
    expect(resolveScopeOption(options, { cluster: 'k8s-trade-test', namespace: 'nope' })).toEqual(options[1]);
  });

  it('does not swap pre and prod when several namespaces share the cluster', () => {
    const sharedCluster = [
      { cluster: 'k8s-trade-prod', namespace: 'pre-turms' },
      { cluster: 'k8s-trade-prod', namespace: 'turms' },
    ];
    expect(resolveScopeOption(sharedCluster, { cluster: 'k8s-trade-prod', namespace: 'opentelemetry' })).toBeUndefined();
  });

  it('refuses to guess when the preference has no data and several scopes exist', () => {
    expect(resolveScopeOption(options, { cluster: 'k8s-arena-test' })).toBeUndefined();
    expect(resolveScopeOption(options)).toBeUndefined();
  });

  it('trusts the caller when discovery returned nothing and the pair is complete', () => {
    expect(resolveScopeOption([], { cluster: 'k8s-devops', namespace: 'sre' })).toEqual({ cluster: 'k8s-devops', namespace: 'sre' });
    expect(resolveScopeOption([], { cluster: 'k8s-devops' })).toBeUndefined();
    expect(resolveScopeOption([], {})).toBeUndefined();
  });

  it('picks the preferred namespace on the same cluster so pre and prod stay apart', () => {
    const sharedCluster = [
      { cluster: 'k8s-trade-prod', namespace: 'pre-turms' },
      { cluster: 'k8s-trade-prod', namespace: 'turms' },
    ];
    expect(resolveScopeOption(sharedCluster, { cluster: 'k8s-trade-prod', namespace: 'turms' })).toEqual(sharedCluster[1]);
    expect(resolveScopeOption(sharedCluster, { cluster: 'k8s-trade-prod', namespace: 'pre-turms' })).toEqual(sharedCluster[0]);
    expect(resolveScopeOption(sharedCluster, { cluster: 'k8s-trade-prod' })).toBeUndefined();
  });

  it('does not return a cluster-only option that would mix every namespace', () => {
    expect(resolveScopeOption([{ cluster: 'k8s-trade-prod' }, { cluster: 'k8s-trade-prod', namespace: 'turms' }], { cluster: 'k8s-trade-prod' })).toEqual({
      cluster: 'k8s-trade-prod',
      namespace: 'turms',
    });
  });
});

describe('isMonitoringIdentityPending', () => {
  it('waits when the header has an env but association has not arrived', () => {
    expect(isMonitoringIdentityPending('prod', undefined)).toBe(true);
    expect(isMonitoringIdentityPending('prod', ['k8s-trade-prod'])).toBe(false);
    expect(isMonitoringIdentityPending('prod', [])).toBe(false);
    expect(isMonitoringIdentityPending(undefined, undefined)).toBe(false);
  });
});
