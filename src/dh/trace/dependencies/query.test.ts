import { buildServiceGraphQueries, edgeKey, mergeServiceGraphVectors, toPromRange } from './promql';
import type { PromVectorSample } from './promql';

function sample(metric: Record<string, string>, value: string): PromVectorSample {
  return { metric, value: [1_700_000_000, value] };
}

describe('toPromRange', () => {
  it('picks the coarsest exact unit', () => {
    expect(toPromRange(86400)).toBe('1d');
    expect(toPromRange(3600)).toBe('1h');
    expect(toPromRange(7200)).toBe('2h');
    expect(toPromRange(90)).toBe('90s');
    expect(toPromRange(60)).toBe('1m');
    expect(toPromRange(0)).toBe('1s');
  });
});

describe('buildServiceGraphQueries', () => {
  it('uses service_graph metric names and the supplied range', () => {
    const q = buildServiceGraphQueries('1h');
    expect(q.total).toBe('sum by (client, server, connection_type) (increase(traces_service_graph_request_total[1h]))');
    expect(q.failed).toContain('traces_service_graph_request_failed_total[1h]');
    expect(q.p95).toContain('traces_service_graph_request_server_seconds_bucket[1h]');
    expect(q.p95).toContain('histogram_quantile(0.95');
  });

  it('scopes detail queries to the focus service and client_/server_ env labels, not scrape env', () => {
    const q = buildServiceGraphQueries('1h', { service: 'turms-business-service', env: 'pre' });
    expect(q.total).toContain('client="turms-business-service", client_deployment_environment_name="pre"');
    expect(q.total).toContain('server="turms-business-service", server_deployment_environment_name="pre"');
    expect(q.total).not.toContain('env="pre"');
    expect(q.total).toContain(' or ');
  });

  it('adds cluster and namespace on the same client_/server_ prefix', () => {
    const q = buildServiceGraphQueries('1h', {
      service: 'turms-business-service',
      env: 'pre',
      cluster: 'k8s-trade-prod',
      namespace: 'pre-turms',
    });
    expect(q.failed).toContain('client_k8s_cluster_name="k8s-trade-prod"');
    expect(q.failed).toContain('client_k8s_namespace_name="pre-turms"');
    expect(q.p95).toContain('server_k8s_cluster_name="k8s-trade-prod"');
    expect(q.p95).not.toContain('cluster="k8s-trade-prod"');
  });
});

describe('mergeServiceGraphVectors', () => {
  it('joins total / failed / p95 on client+server+connection_type', () => {
    const edges = mergeServiceGraphVectors({
      total: [sample({ client: 'gateway', server: 'order', connection_type: '' }, '200')],
      failed: [sample({ client: 'gateway', server: 'order' }, '10')],
      p95: [sample({ client: 'gateway', server: 'order' }, '0.25')],
    });

    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({
      client: 'gateway',
      server: 'order',
      connectionType: '',
      requestCount: 200,
      failedCount: 10,
      errorRate: 0.05,
      p95Seconds: 0.25,
    });
  });

  it('keeps distinct connection types as separate edges and drops zero-traffic rows', () => {
    const edges = mergeServiceGraphVectors({
      total: [
        sample({ client: 'a', server: 'b', connection_type: 'database' }, '4'),
        sample({ client: 'a', server: 'b', connection_type: '' }, '0'),
        sample({ client: '', server: 'orphan' }, '9'),
      ],
      failed: [sample({ client: 'ghost', server: 'gone' }, '0')],
      p95: [sample({ client: 'only', server: 'p95' }, '0.1')],
    });

    expect(edges.map((e) => edgeKey(e.client, e.server, e.connectionType))).toEqual([edgeKey('a', 'b', 'database')]);
    expect(edges[0].requestCount).toBe(4);
  });

  it('caps errorRate at 1 and treats a missing total as 0', () => {
    const edges = mergeServiceGraphVectors({
      total: [],
      failed: [sample({ client: 'a', server: 'b' }, '3')],
      p95: [],
    });
    expect(edges[0].requestCount).toBe(0);
    expect(edges[0].failedCount).toBe(3);
    expect(edges[0].errorRate).toBe(0);
  });

  it('ignores NaN histogram quantiles', () => {
    const edges = mergeServiceGraphVectors({
      total: [sample({ client: 'a', server: 'b' }, '10')],
      failed: [],
      p95: [sample({ client: 'a', server: 'b' }, 'NaN')],
    });
    expect(edges[0].p95Seconds).toBeUndefined();
    expect(edges[0].errorRate).toBe(0);
  });
});
