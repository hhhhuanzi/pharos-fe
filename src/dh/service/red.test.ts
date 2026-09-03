import {
  buildServiceRegexMatcher,
  escapePromLabel,
  extractAssociation,
  extractLanguages,
  firstFiniteSample,
  mergeServiceRed,
  pickServiceEnv,
  pickServiceName,
  serviceKey,
  sumSampleValues,
} from './red';
import type { PromVectorSample } from '@/dh/trace/dependencies/promql';

function sample(metric: Record<string, string>, value: string): PromVectorSample {
  return { metric, value: [1_700_000_000, value] };
}

describe('pickServiceName', () => {
  it('prefers service_name over the scrape service label', () => {
    expect(pickServiceName({ service_name: 'order', service: 'otel-collector' })).toBe('order');
    expect(pickServiceName({})).toBe('');
  });

  it('does not name a row from the service_graph server label', () => {
    /** Node-level RED reads spanmetrics only; a `server` label means the sample came from the wrong metric. */
    expect(pickServiceName({ server: 'graph-only' })).toBe('');
  });
});

describe('pickServiceEnv / serviceKey', () => {
  it('reads the spanmetrics environment dimension', () => {
    expect(pickServiceEnv({ service_name: 'quote', deployment_environment_name: 'prod' })).toBe('prod');
    expect(pickServiceEnv({ service_name: 'quote' })).toBeUndefined();
    expect(pickServiceEnv(undefined)).toBeUndefined();
  });

  it('ignores the server_-prefixed service_graph environment', () => {
    expect(pickServiceEnv({ server: 'quote', server_deployment_environment_name: 'prod' })).toBeUndefined();
  });

  it('keys a row by service + environment, and stays empty without a service name', () => {
    expect(serviceKey('quote', 'prod')).toBe('quote (prod)');
    expect(serviceKey('quote')).toBe('quote');
    expect(serviceKey('', 'prod')).toBe('');
  });
});

describe('escapePromLabel', () => {
  it('escapes backslash and quotes for Prom matchers', () => {
    expect(escapePromLabel('a"b\\c')).toBe('a\\"b\\\\c');
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
        sample({ service_name: 'order', k8s_cluster_name: 'prod', k8s_namespace_name: 'pay' }, '3'),
        sample({ service_name: 'order', cluster: 'prod', namespace: 'pay' }, '1'),
        sample({ service_name: 'order', k8s_cluster_name: 'staging' }, '1'),
        sample({ service_name: 'order' }, '1'),
      ]),
    ).toEqual({
      clusters: ['prod', 'staging'],
      namespaces: ['pay'],
    });
  });

  it('prefers the OTel dimension over the scraping Prometheus own cluster / namespace labels', () => {
    const scrapeLabels = { cluster: 'k8s-devops', namespace: 'opentelemetry' };
    expect(extractAssociation([sample({ service_name: 'order', k8s_cluster_name: 'k8s-rome-sec', k8s_namespace_name: 'rome-sec', ...scrapeLabels }, '3')])).toEqual({
      clusters: ['k8s-rome-sec'],
      namespaces: ['rome-sec'],
    });
  });

  it('ignores the server_-prefixed service_graph dimensions', () => {
    expect(extractAssociation([sample({ server: 'order', server_k8s_cluster_name: 'prod', server_k8s_namespace_name: 'pay' }, '3')])).toEqual({
      clusters: [],
      namespaces: [],
    });
  });

  it('returns empty lists when labels are absent — do not invent CMDB values', () => {
    expect(extractAssociation([sample({ service_name: 'order' }, '4')])).toEqual({
      clusters: [],
      namespaces: [],
    });
  });
});

describe('extractLanguages / buildServiceRegexMatcher', () => {
  it('reads language from telemetry / process labels and ignores missing ones', () => {
    expect(
      extractLanguages([
        sample({ service_name: 'order', telemetry_sdk_language: 'java' }, '1'),
        sample({ service_name: 'order', 'telemetry.sdk.language': 'java' }, '1'),
        sample({ service_name: 'gw' }, '1'),
      ]),
    ).toEqual(['java']);
  });

  it('builds a quoted regex matcher against the label it is given', () => {
    expect(buildServiceRegexMatcher(['order', 'a.b'], 'service_name')).toBe('{service_name=~"order|a\\\\.b"}');
  });
});

describe('mergeServiceRed', () => {
  it('aggregates incoming RED and keeps association labels', () => {
    const result = mergeServiceRed({
      total: [sample({ service_name: 'order', k8s_cluster_name: 'prod' }, '200')],
      failed: [sample({ service_name: 'order', k8s_cluster_name: 'prod' }, '10')],
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
      total: [sample({ service_name: 'order' }, '0')],
      failed: [],
      p95: [],
      rangeSeconds: 60,
    });
    expect(result.empty).toBe(false);
    expect(result.red?.requestCount).toBe(0);
    expect(result.red?.errorRate).toBe(0);
  });

  it('reports 0% for a service whose error query came back with no series', () => {
    /**
     * A healthy service and a service whose error query returned nothing are indistinguishable in
     * the samples, so this stays 0% — the difference is drawn at the request level, where a failed
     * query rejects and the page shows an error instead of a number.
     */
    const result = mergeServiceRed({
      total: [sample({ service_name: 'order' }, '300')],
      failed: [],
      p95: [],
      rangeSeconds: 3600,
    });
    expect(result.red?.errorRate).toBe(0);
    expect(result.red?.failedCount).toBe(0);
  });
});
