import type { PromVectorSample } from '@/dh/trace/dependencies/promql';

import {
  aggregateServiceRows,
  dedupeRefs,
  filterInstrumentedRows,
  filterRowsByServiceName,
  languageMapFromSamples,
  mergeServiceCatalog,
  pickTopServices,
  uniqueRefNames,
  type ServiceRow,
} from './list';

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
  it('sums RED by service and keeps language / cluster labels', () => {
    const rows = aggregateServiceRows({
      total: [
        sample({ service_name: 'order', telemetry_sdk_language: 'java', k8s_cluster_name: 'prod' }, '100'),
        sample({ service_name: 'order', telemetry_sdk_language: 'java' }, '50'),
        sample({ service_name: 'gateway' }, '20'),
      ],
      failed: [sample({ service_name: 'order' }, '5')],
      p95: [sample({ service_name: 'order' }, '0.2'), sample({ service_name: 'gateway' }, '0.05')],
      p99: [sample({ service_name: 'order' }, '0.4')],
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

  it('merges language-split spanmetrics series into one service row', () => {
    const rows = aggregateServiceRows({
      total: [
        sample({ service_name: 'rome-sec-index', telemetry_sdk_language: 'java' }, '100'),
        sample({ service_name: 'rome-sec-index' }, '50'),
      ],
      failed: [
        sample({ service_name: 'rome-sec-index', telemetry_sdk_language: 'java' }, '4'),
        sample({ service_name: 'rome-sec-index' }, '1'),
      ],
      p95: [
        sample({ service_name: 'rome-sec-index', telemetry_sdk_language: 'java' }, '0.2'),
        sample({ service_name: 'rome-sec-index' }, '0.3'),
      ],
      p99: [sample({ service_name: 'rome-sec-index', telemetry_sdk_language: 'java' }, '0.4')],
      rangeSeconds: 100,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: 'rome-sec-index',
      language: 'java',
      requestCount: 150,
      failedCount: 5,
      errorRate: 5 / 150,
      qps: 1.5,
      p95Seconds: 0.3,
      p99Seconds: 0.4,
      hasRed: true,
    });
  });

  it('keeps same-named services in different environments apart', () => {
    const rows = aggregateServiceRows({
      total: [
        sample({ service_name: 'quote', deployment_environment_name: 'prod' }, '900'),
        sample({ service_name: 'quote', deployment_environment_name: 'test' }, '10'),
      ],
      failed: [sample({ service_name: 'quote', deployment_environment_name: 'test' }, '5')],
      p95: [
        sample({ service_name: 'quote', deployment_environment_name: 'prod' }, '0.006'),
        sample({ service_name: 'quote', deployment_environment_name: 'test' }, '15'),
      ],
      p99: [],
      rangeSeconds: 100,
    });
    expect(rows).toHaveLength(2);
    const byEnv = Object.fromEntries(rows.map((item) => [item.env, item]));
    expect(byEnv.prod).toMatchObject({ name: 'quote', env: 'prod', requestCount: 900, failedCount: 0, errorRate: 0, p95Seconds: 0.006 });
    expect(byEnv.test).toMatchObject({ name: 'quote', env: 'test', requestCount: 10, failedCount: 5, errorRate: 0.5, p95Seconds: 15 });
  });

  it('leaves env undefined when the series carries no environment dimension', () => {
    const rows = aggregateServiceRows({
      total: [sample({ service_name: 'order' }, '10')],
      failed: [],
      p95: [],
      p99: [],
      rangeSeconds: 10,
    });
    expect(rows[0].env).toBeUndefined();
  });

  it('skips series without a service name', () => {
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

  it('produces no row from a service_graph edge, whatever its connection_type', () => {
    /**
     * This is what used to put MySQL schema names and `jaeger-collector` in the list: edges were
     * keyed by `server`. Node-level RED no longer reads that label, so an edge sample yields nothing
     * even if one reaches this function.
     */
    const rows = aggregateServiceRows({
      total: [
        sample({ client: 'order', server: 'bdc10_0', connection_type: 'database' }, '500'),
        sample({ client: 'user', server: 'order', connection_type: 'virtual_node' }, '342280'),
        sample({ client: 'gateway', server: 'order', connection_type: '' }, '1000'),
      ],
      failed: [],
      p95: [],
      p99: [],
      rangeSeconds: 3600,
    });
    expect(rows).toEqual([]);
  });
});

describe('languageMapFromSamples', () => {
  it('reads the service out of exported_job, the only name target_info actually carries', () => {
    expect(languageMapFromSamples([sample({ exported_job: 'rome-sec/rome-sec-auth', telemetry_sdk_language: 'java' }, '1')])).toEqual({
      'rome-sec-auth': 'java',
    });
  });

  it('still prefers the explicit name labels when they exist', () => {
    expect(languageMapFromSamples([sample({ service_name: 'order', exported_job: 'shop/order', telemetry_sdk_language: 'go' }, '1')])).toEqual({
      order: 'go',
    });
  });
});

describe('filterInstrumentedRows', () => {
  it('keeps SDK-reported services and drops components with no language', () => {
    const result = filterInstrumentedRows([
      row({ name: 'order', language: 'Java', requestCount: 300 }),
      row({ name: 'pricing', language: 'Python', requestCount: 20 }),
      row({ name: 'jaeger-collector', requestCount: 1_148_052 }),
    ]);
    expect(result.rows.map((item) => item.name)).toEqual(['order', 'pricing']);
    expect(result.excluded).toEqual(['jaeger-collector']);
  });

  it('leaves every kept row byte-identical, so no displayed number moves', () => {
    const order = row({ name: 'order', language: 'Java', requestCount: 300, failedCount: 3, errorRate: 0.01, p95Seconds: 0.5, p99Seconds: 1 });
    const result = filterInstrumentedRows([order, row({ name: 'infra' })]);
    expect(result.rows[0]).toBe(order);
  });

  it('keeps every environment of a service that has a language in any one of them', () => {
    const result = filterInstrumentedRows([
      row({ name: 'order', env: 'prod', language: 'Java', requestCount: 300 }),
      row({ name: 'order', env: 'test', requestCount: 5 }),
    ]);
    expect(result.rows.map((item) => `${item.name}/${item.env}`)).toEqual(['order/prod', 'order/test']);
    expect(result.excluded).toEqual([]);
  });

  it('drops every row when nothing carries a language, instead of falling through unfiltered', () => {
    /**
     * `telemetry.sdk.language` is a declared spanmetrics dimension, so a language-less RED vector
     * means the connector lost it. The old escape hatch existed to keep the service_graph fallback
     * from emptying the list; with no fallback left, an empty list is the honest answer.
     */
    const result = filterInstrumentedRows([row({ name: 'order', requestCount: 300 }), row({ name: 'pricing', requestCount: 20 })]);
    expect(result.rows).toEqual([]);
    expect(result.excluded).toEqual(['order', 'pricing']);
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

  it('does not add an env-less duplicate for a service that already has RED in some environment', () => {
    const merged = mergeServiceCatalog(['quote'], [row({ name: 'quote', env: 'prod', requestCount: 10 })]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ name: 'quote', env: 'prod' });
  });

  it('orders same-named rows by environment', () => {
    const merged = mergeServiceCatalog(
      [],
      [row({ name: 'quote', env: 'test', requestCount: 5 }), row({ name: 'quote', env: 'prod', requestCount: 5 })],
    );
    expect(merged.map((item) => item.env)).toEqual(['prod', 'test']);
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
    expect(pickTopServices(rows, 2, 'requestCount').map((ref) => ref.key)).toEqual(['hot', 'slow']);
    expect(pickTopServices(rows, 2, 'errorRate').map((ref) => ref.key)).toEqual(['broken', 'slow']);
    expect(pickTopServices(rows, 1, 'p95Seconds').map((ref) => ref.key)).toEqual(['slow']);
  });

  it('returns an empty list when n is 0', () => {
    expect(pickTopServices(rows, 0, 'requestCount')).toEqual([]);
  });

  it('keys each environment separately so both draw as their own line', () => {
    const multiEnv: ServiceRow[] = [
      row({ name: 'quote', env: 'prod', requestCount: 900 }),
      row({ name: 'quote', env: 'test', requestCount: 10 }),
    ];
    expect(pickTopServices(multiEnv, 2, 'requestCount')).toEqual([
      { name: 'quote', env: 'prod', key: 'quote (prod)' },
      { name: 'quote', env: 'test', key: 'quote (test)' },
    ]);
    expect(uniqueRefNames(pickTopServices(multiEnv, 2, 'requestCount'))).toEqual(['quote']);
  });

  it('drops duplicate keys when merging the three top lists', () => {
    const shared = { name: 'quote', env: 'prod', key: 'quote (prod)' } as const;
    expect(dedupeRefs([shared], [shared], [{ name: 'pay', key: 'pay' }])).toEqual([shared, { name: 'pay', key: 'pay' }]);
  });

  it('still ranks services whose error rate is 0, so the error chart is not just the one noisy service', () => {
    const mixed: ServiceRow[] = [
      row({ name: 'busy', requestCount: 100, errorRate: 0, failedCount: 0 }),
      row({ name: 'quiet', requestCount: 10, errorRate: 0, failedCount: 0 }),
      row({ name: 'broken', requestCount: 8, errorRate: 0.4, failedCount: 3 }),
    ];
    expect(pickTopServices(mixed, 3, 'errorRate').map((ref) => ref.key)).toEqual(['broken', 'busy', 'quiet']);
  });
});
