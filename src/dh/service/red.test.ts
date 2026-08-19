import { SERVICE_GRAPH_METRICS } from '@/dh/trace/dependencies/promql';

import { buildCatalogRedQueries, buildServiceRedQueries, buildServerRegexMatcher, escapePromLabel, extractAssociation, extractLanguages, firstFiniteSample, mergeServiceRed, pickServiceName, sumSampleValues } from './red';
import type { PromVectorSample } from '@/dh/trace/dependencies/promql';

function sample(metric: Record<string, string>, value: string): PromVectorSample {
  return { metric, value: [1_700_000_000, value] };
}

describe('pickServiceName', () => {
  it('prefers service_name over service / server', () => {
    expect(pickServiceName({ service_name: 'order', service: 'x', server: 'y' })).toBe('order');
    expect(pickServiceName({ server: 'graph-only' })).toBe('graph-only');
    expect(pickServiceName({})).toBe('');
  });
});

describe('escapePromLabel', () => {
  it('escapes backslash and quotes for Prom matchers', () => {
    expect(escapePromLabel('a"b\\c')).toBe('a\\"b\\\\c');
  });
});

describe('buildServiceRedQueries', () => {
  it('filters service_graph metrics by server and reuses the topology metric names', () => {
    const q = buildServiceRedQueries('order-api', '1h');
    expect(q.total).toBe(`increase(${SERVICE_GRAPH_METRICS.total}{server="order-api"}[1h])`);
    expect(q.failed).toBe(`increase(${SERVICE_GRAPH_METRICS.failed}{server="order-api"}[1h])`);
    expect(q.p95).toContain(`${SERVICE_GRAPH_METRICS.serverBucket}{server="order-api"}[1h]`);
    expect(q.p95).toContain('histogram_quantile(0.95');
    expect(q.p99).toContain('histogram_quantile(0.99');
  });

  it('quotes service names that contain reserved characters', () => {
    expect(buildServiceRedQueries('a"b', '5m').total).toContain('{server="a\\"b"}');
  });
});

describe('sumSampleValues / firstFiniteSample', () => {
  it('sums finite values and skips NaN', () => {
    expect(sumSampleValues([sample({}, '10'), sample({}, 'NaN'), sample({}, '2.5')])).toBe(12.5);
    expect(firstFiniteSample([sample({}, 'NaN'), sample({}, '0.25')])).toBe(0.25);
    expect(firstFiniteSample([])).toBeUndefined();
  });
});

describe('extractAssociation', () => {
  it('reads cluster / namespace from known Prom label aliases and de-dupes', () => {
    expect(
      extractAssociation([
        sample({ server: 'order', k8s_cluster_name: 'prod', k8s_namespace_name: 'pay' }, '3'),
        sample({ server: 'order', cluster: 'prod', namespace: 'pay' }, '1'),
        sample({ server: 'order', k8s_cluster_name: 'staging' }, '1'),
        sample({ server: 'order' }, '1'),
      ]),
    ).toEqual({
      clusters: ['prod', 'staging'],
      namespaces: ['pay'],
    });
  });

  it('returns empty lists when labels are absent — do not invent CMDB values', () => {
    expect(extractAssociation([sample({ server: 'order', client: 'gw' }, '4')])).toEqual({
      clusters: [],
      namespaces: [],
    });
  });
});

describe('extractLanguages / buildCatalogRedQueries / buildServerRegexMatcher', () => {
  it('reads language from telemetry / process labels and ignores missing ones', () => {
    expect(
      extractLanguages([
        sample({ server: 'order', telemetry_sdk_language: 'java' }, '1'),
        sample({ server: 'order', 'telemetry.sdk.language': 'java' }, '1'),
        sample({ server: 'gw' }, '1'),
      ]),
    ).toEqual(['java']);
  });

  it('aggregates the fleet without a server= filter', () => {
    const q = buildCatalogRedQueries('1h');
    expect(q.total).toBe(`increase(${SERVICE_GRAPH_METRICS.total}[1h])`);
    expect(q.p95).toContain('sum by (server, le)');
    expect(q.p99).toContain('histogram_quantile(0.99');
  });

  it('builds a quoted regex matcher for several servers', () => {
    expect(buildServerRegexMatcher(['order', 'a.b'])).toBe('{server=~"order|a\\\\.b"}');
    expect(buildServerRegexMatcher(['order'], 'service_name')).toBe('{service_name=~"order"}');
  });
});

describe('mergeServiceRed', () => {
  it('aggregates incoming RED and keeps association labels', () => {
    const result = mergeServiceRed({
      total: [sample({ server: 'order', k8s_cluster_name: 'prod' }, '200')],
      failed: [sample({ server: 'order', k8s_cluster_name: 'prod' }, '10')],
      p95: [sample({}, '0.25')],
      rangeSeconds: 3600,
    });
    expect(result.empty).toBe(false);
    expect(result.red).toEqual({
      requestCount: 200,
      failedCount: 10,
      errorRate: 0.05,
      p95Seconds: 0.25,
      rangeSeconds: 3600,
    });
    expect(result.association.clusters).toEqual(['prod']);
  });

  it('is empty when Prometheus returns no series', () => {
    expect(mergeServiceRed({ total: [], failed: [], p95: [], rangeSeconds: 60 })).toEqual({
      association: { clusters: [], namespaces: [] },
      empty: true,
    });
  });

  it('treats a zero-traffic series as real data, not an empty state', () => {
    const result = mergeServiceRed({
      total: [sample({ server: 'order' }, '0')],
      failed: [],
      p95: [],
      rangeSeconds: 60,
    });
    expect(result.empty).toBe(false);
    expect(result.red?.requestCount).toBe(0);
    expect(result.red?.errorRate).toBe(0);
  });
});
