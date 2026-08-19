import type { PromVectorSample } from '@/dh/trace/dependencies/promql';

import { aggregateServiceRows, filterRowsByServiceName, mergeServiceCatalog, pickTopServices, type ServiceRow } from './list';

function sample(metric: Record<string, string>, value: string): PromVectorSample {
  return { metric, value: [1_700_000_000, value] };
}

const emptyAssoc = { clusters: [] as string[], namespaces: [] as string[] };

function row(partial: Partial<ServiceRow> & { name: string }): ServiceRow {
  return {
    association: emptyAssoc,
    hasRed: true,
    ...partial,
  };
}

describe('aggregateServiceRows', () => {
  it('sums RED by server and keeps language / cluster labels', () => {
    const rows = aggregateServiceRows({
      total: [
        sample({ server: 'order', telemetry_sdk_language: 'java', k8s_cluster_name: 'prod' }, '100'),
        sample({ server: 'order', telemetry_sdk_language: 'java' }, '50'),
        sample({ server: 'gateway' }, '20'),
      ],
      failed: [sample({ server: 'order' }, '5')],
      p95: [sample({ server: 'order' }, '0.2'), sample({ server: 'gateway' }, '0.05')],
      p99: [sample({ server: 'order' }, '0.4')],
      rangeSeconds: 100,
    });
    const byName = Object.fromEntries(rows.map((item) => [item.name, item]));
    expect(byName.order).toMatchObject({
      name: 'order',
      language: 'java',
      requestCount: 150,
      failedCount: 5,
      errorRate: 5 / 150,
      qps: 1.5,
      p95Seconds: 0.2,
      p99Seconds: 0.4,
      hasRed: true,
    });
    expect(byName.order.association.clusters).toEqual(['prod']);
    expect(byName.gateway.requestCount).toBe(20);
    expect(byName.gateway.language).toBeUndefined();
    expect(byName.gateway.p99Seconds).toBeUndefined();
  });

  it('reads service_name from spanmetrics labels', () => {
    const rows = aggregateServiceRows({
      total: [sample({ service_name: 'order-api' }, '40')],
      failed: [],
      p95: [],
      p99: [],
      rangeSeconds: 20,
    });
    expect(rows).toMatchObject([{ name: 'order-api', requestCount: 40, qps: 2, hasRed: true }]);
  });

  it('skips series without a server label', () => {
    expect(
      aggregateServiceRows({
        total: [sample({ client: 'gw' }, '9')],
        failed: [],
        p95: [],
        p99: [],
        rangeSeconds: 60,
      }),
    ).toEqual([]);
  });
});

describe('mergeServiceCatalog', () => {
  it('unions Jaeger names with Prom rows and leaves missing RED blank', () => {
    const merged = mergeServiceCatalog(
      ['order', 'legacy'],
      [row({ name: 'order', requestCount: 10 }), row({ name: 'prom-only', requestCount: 3 })],
    );
    expect(merged.map((item) => item.name)).toEqual(['order', 'prom-only', 'legacy']);
    expect(merged.find((item) => item.name === 'legacy')).toEqual({
      name: 'legacy',
      association: emptyAssoc,
      hasRed: false,
    });
  });
});

describe('filterRowsByServiceName', () => {
  const rows = [row({ name: 'order-api' }), row({ name: 'Gateway' }), row({ name: 'pay' })];

  it('matches service name only, case-insensitive', () => {
    expect(filterRowsByServiceName(rows, '  GATE  ').map((item) => item.name)).toEqual(['Gateway']);
  });

  it('returns all rows when the query is blank', () => {
    expect(filterRowsByServiceName(rows, '   ')).toEqual(rows);
  });
});

describe('pickTopServices', () => {
  const rows: ServiceRow[] = [
    row({ name: 'hot', requestCount: 100, errorRate: 0.01, p95Seconds: 0.1 }),
    row({ name: 'slow', requestCount: 10, errorRate: 0.02, p95Seconds: 0.9 }),
    row({ name: 'broken', requestCount: 8, errorRate: 0.4, p95Seconds: 0.2 }),
    row({ name: 'empty', hasRed: false }),
  ];

  it('ranks by the requested metric and ignores rows without RED', () => {
    expect(pickTopServices(rows, 2, 'requestCount')).toEqual(['hot', 'slow']);
    expect(pickTopServices(rows, 2, 'errorRate')).toEqual(['broken', 'slow']);
    expect(pickTopServices(rows, 1, 'p95Seconds')).toEqual(['slow']);
  });

  it('returns an empty list when n is 0', () => {
    expect(pickTopServices(rows, 0, 'requestCount')).toEqual([]);
  });
});
