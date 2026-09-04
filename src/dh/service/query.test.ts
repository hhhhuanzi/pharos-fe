const getPromDataMock = jest.fn();

jest.mock('@/components/PromGraphCpt/services', () => ({
  getPromData: (...args: unknown[]) => getPromDataMock(...args),
}));

jest.mock('@/utils/constant', () => ({ N9E_PATHNAME: 'n9e' }));

jest.mock('@/dh/trace', () => ({ getTraceServices: jest.fn() }));

import { getTraceServices } from '@/dh/trace';
import type { PromVectorSample } from '@/dh/trace/dependencies/promql';

import { fetchServiceCatalog, fetchServiceOverview, fetchServiceTopSeries } from './query';
import type { PromMatrixSample } from './series';
import { SVC_SPANMETRICS_CALLS_RATE1M, SVC_SPANMETRICS_DURATION_MS_BUCKET_RATE1M } from './spanmetrics';
import { resetSpanmetricsFamilyCache } from './spanmetricsProbe';

const PROM_ID = 6;
const JAEGER_ID = 9;
const END = 1_700_003_600;
const START = END - 3600;
const TS = 1_700_000_000;

const FAMILY_FULL = ['traces_span_metrics_calls_total', 'traces_span_metrics_duration_milliseconds_bucket'];
const FAMILY_CALLS_ONLY = ['traces_span_metrics_calls_total'];
const FAMILY_RECORDED = [...FAMILY_FULL, SVC_SPANMETRICS_CALLS_RATE1M, SVC_SPANMETRICS_DURATION_MS_BUCKET_RATE1M];

/** `telemetry.sdk.language` is a declared connector dimension, so every real RED row carries one. */
const ORDER = { service_name: 'order', deployment_environment_name: 'prod', telemetry_sdk_language: 'java' } as const;

/** Cumulative buckets whose P95 is exactly 0.5 and P99 exactly 1 (in the histogram's own unit). */
const BUCKETS: Array<[string, string]> = [
  ['0.25', '80'],
  ['0.5', '95'],
  ['1', '99'],
  ['+Inf', '100'],
];

function sample(metric: Record<string, string>, value: string): PromVectorSample {
  return { metric, value: [TS, value] };
}

function bucketSamples(metric: Record<string, string>, pairs: Array<[string, string]>): PromVectorSample[] {
  return pairs.map(([le, value]) => sample({ ...metric, le }, value));
}

function vector(samples: PromVectorSample[]) {
  return { resultType: 'vector', result: samples };
}

function series(metric: Record<string, string>, value: string): PromMatrixSample {
  return { metric, values: [[TS, value]] };
}

function matrix(samples: PromMatrixSample[]) {
  return { resultType: 'matrix', result: samples };
}

type Reply = unknown;

interface PromStubs {
  names?: string[] | Error;
  /** Matched in order against the PromQL text; the first hit answers. Unmatched queries are empty. */
  instant?: Array<[RegExp, Reply]>;
  range?: Array<[RegExp, Reply]>;
}

function stubProm(stubs: PromStubs): void {
  getPromDataMock.mockImplementation((url: string, params: Record<string, unknown>) => {
    if (String(url).includes('label/__name__/values')) {
      const names = stubs.names ?? [];
      return names instanceof Error ? Promise.reject(names) : Promise.resolve(names);
    }
    const query = String(params.query);
    const table = (String(url).includes('query_range') ? stubs.range : stubs.instant) ?? [];
    const hit = table.find(([pattern]) => pattern.test(query));
    if (!hit) return Promise.resolve({ result: [] });
    return hit[1] instanceof Error ? Promise.reject(hit[1]) : Promise.resolve(hit[1]);
  });
}

function sentQueries(kind: 'instant' | 'range' = 'instant'): string[] {
  return getPromDataMock.mock.calls
    .filter(([url]) => !String(url).includes('label/__name__/values') && String(url).includes('query_range') === (kind === 'range'))
    .map(([, params]) => String(params.query));
}

function serviceGraphQueries(): string[] {
  return [...sentQueries('instant'), ...sentQueries('range')].filter((query) => query.includes('traces_service_graph'));
}

beforeEach(() => {
  resetSpanmetricsFamilyCache();
  getPromDataMock.mockReset();
  (getTraceServices as jest.Mock).mockResolvedValue([]);
});

describe('fetchServiceCatalog', () => {
  it('evaluates both quantiles from one bucket query and never sends histogram_quantile', async () => {
    stubProm({
      names: FAMILY_FULL,
      instant: [
        [/status_code/, vector([sample(ORDER, '3')])],
        [/duration_milliseconds_bucket/, vector(bucketSamples(ORDER, BUCKETS))],
        [/calls_total/, vector([sample(ORDER, '300')])],
      ],
    });

    const res = await fetchServiceCatalog(PROM_ID, undefined, START, END);

    expect(res.redSource).toBe('spanmetrics');
    expect(res.promFailed).toBe(false);
    // Milliseconds are scaled to seconds, so 0.5ms / 1ms become 0.0005s / 0.001s.
    expect(res.rows[0]).toMatchObject({ name: 'order', env: 'prod', requestCount: 300, failedCount: 3, p95Seconds: 0.0005, p99Seconds: 0.001 });
    expect(sentQueries().some((query) => query.includes('histogram_quantile'))).toBe(false);
    // total + failed + buckets + target_info, i.e. one fewer than the two-quantile shape.
    expect(sentQueries()).toHaveLength(4);
  });

  it('drops components with no SDK language and keeps the real services untouched', async () => {
    const infra = { service_name: 'jaeger-collector', deployment_environment_name: 'prod' };
    stubProm({
      names: FAMILY_FULL,
      instant: [
        [/status_code/, vector([sample(ORDER, '3'), sample(infra, '11')])],
        [/duration_milliseconds_bucket/, vector([...bucketSamples(ORDER, BUCKETS), ...bucketSamples(infra, BUCKETS)])],
        [/calls_total/, vector([sample(ORDER, '300'), sample(infra, '1148052')])],
      ],
    });
    /** The Jaeger union must not re-add the component that was just filtered out. */
    (getTraceServices as jest.Mock).mockResolvedValue([{ value: 'order' }, { value: 'jaeger-collector' }]);

    const res = await fetchServiceCatalog(PROM_ID, JAEGER_ID, START, END);

    expect(res.rows.map((row) => row.name)).toEqual(['order']);
    expect(res.rows[0]).toMatchObject({ name: 'order', env: 'prod', language: 'java', requestCount: 300, failedCount: 3, p95Seconds: 0.0005 });
  });

  it('keeps a service whose language is only on some of its series, with its full count', async () => {
    const dims = { service_name: 'order', deployment_environment_name: 'prod' };
    stubProm({
      names: FAMILY_CALLS_ONLY,
      instant: [
        [/status_code/, vector([])],
        [/calls_total/, vector([sample({ ...dims, telemetry_sdk_language: 'java' }, '200'), sample(dims, '100')])],
      ],
    });

    const res = await fetchServiceCatalog(PROM_ID, undefined, START, END);

    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]).toMatchObject({ name: 'order', language: 'java', requestCount: 300 });
  });

  it('keeps spanmetrics counts, env and language when only the slow bucket query times out', async () => {
    /** Fleet-wide spanmetrics buckets run ~15s against Thanos; the counters answer in ~1s. */
    stubProm({
      names: FAMILY_FULL,
      instant: [
        [/status_code/, vector([sample(ORDER, '3')])],
        [/duration_milliseconds_bucket/, new Error('502 timeout')],
        [/calls_total/, vector([sample(ORDER, '300')])],
      ],
    });

    const res = await fetchServiceCatalog(PROM_ID, undefined, START, END);

    expect(res.promFailed).toBe(false);
    expect(res.redSource).toBe('spanmetrics');
    expect(res.rows[0]).toMatchObject({ name: 'order', env: 'prod', language: 'java', requestCount: 300, failedCount: 3 });
    /** Latency is the only column that loses data, and it renders as `—` rather than as an edge quantile. */
    expect(res.rows[0].p95Seconds).toBeUndefined();
    expect(res.rows[0].p99Seconds).toBeUndefined();
  });

  it('leaves P95 / P99 blank for a calls-only family instead of borrowing edge quantiles', async () => {
    stubProm({
      names: FAMILY_CALLS_ONLY,
      instant: [
        [/status_code/, vector([sample(ORDER, '3')])],
        [/calls_total/, vector([sample(ORDER, '300')])],
      ],
    });

    const res = await fetchServiceCatalog(PROM_ID, undefined, START, END);

    expect(res.redSource).toBe('spanmetrics');
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]).toMatchObject({ name: 'order', env: 'prod', requestCount: 300, failedCount: 3 });
    expect(res.rows[0].p95Seconds).toBeUndefined();
  });

  it('reports promFailed when the spanmetrics query fails, and still lists the Jaeger services', async () => {
    stubProm({ names: FAMILY_FULL, instant: [[/traces_span_metrics_/, new Error('502 timeout')]] });
    (getTraceServices as jest.Mock).mockResolvedValue([{ value: 'order' }]);

    const res = await fetchServiceCatalog(PROM_ID, JAEGER_ID, START, END);

    expect(res.promFailed).toBe(true);
    expect(res.jaegerFailed).toBe(false);
    expect(res.redSource).toBe('none');
    expect(res.rows).toEqual([{ name: 'order', association: { clusters: [], namespaces: [] }, hasRed: false }]);
  });

  it('reports promFailed when the metadata probe itself fails', async () => {
    /** An unreachable Prometheus and one without spanmetrics must not look the same. */
    stubProm({ names: new Error('502 timeout') });

    const res = await fetchServiceCatalog(PROM_ID, undefined, START, END);

    expect(res.promFailed).toBe(true);
    expect(res.rows).toEqual([]);
  });

  it('reads catalog RED from recording rules when the probe finds svc:*', async () => {
    const rec = { service_name: 'order', deployment_environment_name: 'prod' } as const;
    stubProm({
      names: FAMILY_RECORDED,
      instant: [
        [/sum_over_time\(svc:traces_span_metrics_calls:rate1m\{/, vector([sample(rec, '3')])],
        [/sum_over_time\(svc:traces_span_metrics_duration_ms_bucket/, vector(bucketSamples(rec, BUCKETS))],
        [/sum_over_time\(svc:traces_span_metrics_calls:rate1m\[/, vector([sample(rec, '300')])],
        [/target_info/, vector([sample({ service_name: 'order', telemetry_sdk_language: 'java' }, '1')])],
      ],
    });

    const res = await fetchServiceCatalog(PROM_ID, undefined, START, END);

    expect(res.rows[0]).toMatchObject({
      name: 'order',
      env: 'prod',
      language: 'java',
      requestCount: 300,
      failedCount: 3,
      p95Seconds: 0.0005,
      p99Seconds: 0.001,
    });
    const queries = sentQueries();
    expect(queries.some((query) => query.includes(`sum_over_time(${SVC_SPANMETRICS_CALLS_RATE1M}`))).toBe(true);
    expect(queries.some((query) => query.includes(`sum_over_time(${SVC_SPANMETRICS_DURATION_MS_BUCKET_RATE1M}`))).toBe(true);
    expect(queries.some((query) => query.includes('increase('))).toBe(false);
    expect(queries.some((query) => query.includes('increase(svc:'))).toBe(false);
  });

  it('leaves RED blank without failing when this Prometheus has no spanmetrics at all', async () => {
    stubProm({ names: ['up'] });
    (getTraceServices as jest.Mock).mockResolvedValue([{ value: 'order' }]);

    const res = await fetchServiceCatalog(PROM_ID, JAEGER_ID, START, END);

    expect(res.promFailed).toBe(false);
    expect(res.redSource).toBe('none');
    expect(res.rows).toEqual([{ name: 'order', association: { clusters: [], namespaces: [] }, hasRed: false }]);
    expect(sentQueries()).toEqual([]);
  });
});

describe('fetchServiceOverview', () => {
  it('reads incoming RED and the association off spanmetrics', async () => {
    stubProm({
      names: FAMILY_FULL,
      instant: [
        [/status_code/, vector([sample(ORDER, '3')])],
        [/duration_milliseconds_bucket/, vector(bucketSamples(ORDER, BUCKETS))],
        [/calls_total/, vector([sample({ ...ORDER, k8s_cluster_name: 'k8s-prod' }, '300')])],
      ],
    });

    const res = await fetchServiceOverview(PROM_ID, 'order', START, END, 'prod');

    expect(res.empty).toBe(false);
    expect(res.red).toMatchObject({ requestCount: 300, failedCount: 3, p95Seconds: 0.0005, p99Seconds: 0.001 });
    expect(res.association.clusters).toEqual(['k8s-prod']);
  });

  it('rejects when the spanmetrics pass fails, so the page can show a real error', async () => {
    stubProm({ names: FAMILY_FULL, instant: [[/traces_span_metrics_/, new Error('502 timeout')]] });

    await expect(fetchServiceOverview(PROM_ID, 'order', START, END)).rejects.toThrow('502 timeout');
  });

  it('keeps detail RED on raw spanmetrics when recording rules are present', async () => {
    stubProm({
      names: FAMILY_RECORDED,
      instant: [
        [/status_code/, vector([sample(ORDER, '3')])],
        [/duration_milliseconds_bucket/, vector(bucketSamples(ORDER, BUCKETS))],
        [/calls_total/, vector([sample({ ...ORDER, k8s_cluster_name: 'k8s-prod' }, '300')])],
      ],
    });

    const res = await fetchServiceOverview(PROM_ID, 'order', START, END, 'prod');

    expect(res.red).toMatchObject({ requestCount: 300, failedCount: 3, p95Seconds: 0.0005 });
    const queries = sentQueries();
    expect(queries.some((query) => query.includes('increase(traces_span_metrics_calls_total'))).toBe(true);
    expect(queries.some((query) => query.includes('svc:'))).toBe(false);
  });

  it('reports counts without latency for a calls-only family', async () => {
    stubProm({
      names: FAMILY_CALLS_ONLY,
      instant: [
        [/status_code/, vector([sample(ORDER, '3')])],
        [/calls_total/, vector([sample(ORDER, '300')])],
      ],
    });

    const res = await fetchServiceOverview(PROM_ID, 'order', START, END);

    expect(res.red).toMatchObject({ requestCount: 300, failedCount: 3 });
    expect(res.red?.p95Seconds).toBeUndefined();
  });
});

describe('fetchServiceTopSeries', () => {
  const refs = [{ name: 'order', env: 'prod', key: 'order (prod)' }];

  it('draws the three curves off spanmetrics, keyed per service and environment', async () => {
    stubProm({
      names: FAMILY_FULL,
      range: [
        [/duration_milliseconds_bucket/, matrix([series({ service_name: 'order', deployment_environment_name: 'prod' }, '500')])],
        [/calls_total/, matrix([series({ service_name: 'order', deployment_environment_name: 'prod' }, '2')])],
      ],
    });

    const res = await fetchServiceTopSeries(PROM_ID, refs, START, END);

    expect(res.qps.map((item) => item.name)).toEqual(['order (prod)']);
    // The histogram is in milliseconds, so the quantile is scaled to seconds.
    expect(res.p95).toEqual([{ name: 'order (prod)', points: [[TS, 0.5]] }]);
  });

  it('reads top series from recording rules when the probe finds svc:*', async () => {
    stubProm({
      names: FAMILY_RECORDED,
      range: [
        [/svc:traces_span_metrics_duration_ms_bucket/, matrix([series({ service_name: 'order', deployment_environment_name: 'prod' }, '500')])],
        [/svc:traces_span_metrics_calls:rate1m/, matrix([series({ service_name: 'order', deployment_environment_name: 'prod' }, '2')])],
      ],
    });

    const res = await fetchServiceTopSeries(PROM_ID, refs, START, END);

    expect(res.qps.map((item) => item.name)).toEqual(['order (prod)']);
    expect(res.p95).toEqual([{ name: 'order (prod)', points: [[TS, 0.5]] }]);
    const queries = sentQueries('range');
    expect(queries).toHaveLength(3);
    expect(queries.every((query) => query.includes('svc:'))).toBe(true);
    expect(queries.some((query) => query.includes('increase(svc:'))).toBe(false);
    expect(queries.some((query) => query.includes('rate(svc:'))).toBe(false);
    expect(queries.some((query) => query.includes('rate(traces_span_metrics_duration_milliseconds_bucket'))).toBe(false);
    expect(
      queries.some((query) => query.includes(`histogram_quantile(0.95, sum by (service_name, deployment_environment_name, le) (${SVC_SPANMETRICS_DURATION_MS_BUCKET_RATE1M}`)),
    ).toBe(true);
  });

  it('leaves the P95 curve empty for a calls-only family rather than drawing an edge quantile', async () => {
    stubProm({
      names: FAMILY_CALLS_ONLY,
      range: [[/calls_total/, matrix([series({ service_name: 'order', deployment_environment_name: 'prod' }, '2')])]],
    });

    const res = await fetchServiceTopSeries(PROM_ID, refs, START, END);

    expect(res.qps.map((item) => item.name)).toEqual(['order (prod)']);
    expect(res.p95).toEqual([]);
  });

  it('rejects when the spanmetrics range queries fail, so the caller clears the charts', async () => {
    stubProm({ names: FAMILY_FULL, range: [[/traces_span_metrics_/, new Error('502 timeout')]] });

    await expect(fetchServiceTopSeries(PROM_ID, refs, START, END)).rejects.toThrow('502 timeout');
  });
});

/**
 * The RED fallback was removed because `traces_service_graph_*` measures edges, not nodes: its
 * `_request_failed_total` has no series on any real-service edge (so the error rate was a permanent
 * green 0.00%), and its counts and quantiles differ from spanmetrics by up to ~30x and ~75x in both
 * directions. It is still the right source for the topology, which reads it in the backend. These
 * cases exist to fail loudly if node-level RED ever reaches for it again.
 */
describe('node-level RED never queries traces_service_graph_*', () => {
  const refs = [{ name: 'order', env: 'prod', key: 'order (prod)' }];

  it('does not query it when spanmetrics answers everything', async () => {
    stubProm({
      names: FAMILY_FULL,
      instant: [
        [/duration_milliseconds_bucket/, vector(bucketSamples(ORDER, BUCKETS))],
        [/calls_total/, vector([sample(ORDER, '300')])],
      ],
      range: [
        [/duration_milliseconds_bucket/, matrix([series(ORDER, '500')])],
        [/calls_total/, matrix([series(ORDER, '2')])],
      ],
    });

    await fetchServiceCatalog(PROM_ID, undefined, START, END);
    await fetchServiceOverview(PROM_ID, 'order', START, END, 'prod');
    await fetchServiceTopSeries(PROM_ID, refs, START, END);

    expect(serviceGraphQueries()).toEqual([]);
  });

  it('does not query it when the whole spanmetrics pass is rejected', async () => {
    stubProm({
      names: FAMILY_FULL,
      instant: [[/traces_/, new Error('502 timeout')]],
      range: [[/traces_/, new Error('502 timeout')]],
    });

    await fetchServiceCatalog(PROM_ID, undefined, START, END);
    await expect(fetchServiceOverview(PROM_ID, 'order', START, END)).rejects.toThrow();
    await expect(fetchServiceTopSeries(PROM_ID, refs, START, END)).rejects.toThrow();

    expect(serviceGraphQueries()).toEqual([]);
  });

  it('does not query it when spanmetrics answers with no series at all', async () => {
    stubProm({ names: FAMILY_FULL });

    const catalog = await fetchServiceCatalog(PROM_ID, undefined, START, END);
    const overview = await fetchServiceOverview(PROM_ID, 'order', START, END);
    const top = await fetchServiceTopSeries(PROM_ID, refs, START, END);

    expect(catalog.redSource).toBe('none');
    expect(overview.empty).toBe(true);
    expect(top).toEqual({ qps: [], errorRate: [], p95: [] });
    expect(serviceGraphQueries()).toEqual([]);
  });

  it('does not query it when only the slow bucket query times out', async () => {
    stubProm({
      names: FAMILY_FULL,
      instant: [
        [/duration_milliseconds_bucket/, new Error('502 timeout')],
        [/calls_total/, vector([sample(ORDER, '300')])],
      ],
    });

    await fetchServiceCatalog(PROM_ID, undefined, START, END);
    await fetchServiceOverview(PROM_ID, 'order', START, END, 'prod');

    expect(serviceGraphQueries()).toEqual([]);
  });

  it('does not query it when the spanmetrics family exports calls without a histogram', async () => {
    stubProm({
      names: FAMILY_CALLS_ONLY,
      instant: [[/calls_total/, vector([sample(ORDER, '300')])]],
      range: [[/calls_total/, matrix([series(ORDER, '2')])]],
    });

    await fetchServiceCatalog(PROM_ID, undefined, START, END);
    await fetchServiceOverview(PROM_ID, 'order', START, END, 'prod');
    await fetchServiceTopSeries(PROM_ID, refs, START, END);

    expect(serviceGraphQueries()).toEqual([]);
  });
});
