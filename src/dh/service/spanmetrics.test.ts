import {
  buildSpanmetricsCatalogQueries,
  buildSpanmetricsServiceQueries,
  buildSpanmetricsTopQueries,
  pickSpanmetricsFamily,
  scaleSampleValues,
  SPANMETRICS_NAME_REGEX,
} from './spanmetrics';

describe('pickSpanmetricsFamily', () => {
  it('prefers namespaced OTel metrics and treats duration as milliseconds', () => {
    expect(
      pickSpanmetricsFamily(['calls_total', 'traces_span_metrics_calls_total', 'traces_span_metrics_duration_milliseconds_bucket']),
    ).toEqual({
      calls: 'traces_span_metrics_calls_total',
      durationBucket: 'traces_span_metrics_duration_milliseconds_bucket',
      durationScale: 0.001,
      serviceLabel: 'service_name',
    });
  });

  it('falls back to calls_total + seconds histogram', () => {
    expect(pickSpanmetricsFamily(['calls_total', 'duration_seconds_bucket'])).toEqual({
      calls: 'calls_total',
      durationBucket: 'duration_seconds_bucket',
      durationScale: 1,
      serviceLabel: 'service_name',
    });
  });

  it('allows calls without a duration histogram', () => {
    expect(pickSpanmetricsFamily(['traces_spanmetrics_calls_total'])).toEqual({
      calls: 'traces_spanmetrics_calls_total',
      durationScale: 1,
      serviceLabel: 'service_name',
    });
  });

  it('returns undefined when no known calls metric exists', () => {
    expect(pickSpanmetricsFamily(['traces_service_graph_request_total'])).toBeUndefined();
  });
});

describe('spanmetrics queries', () => {
  const family = {
    calls: 'traces_span_metrics_calls_total',
    durationBucket: 'traces_span_metrics_duration_milliseconds_bucket',
    durationScale: 0.001,
    serviceLabel: 'service_name',
  } as const;

  it('aggregates catalog RED by service_name and status_code errors', () => {
    const q = buildSpanmetricsCatalogQueries(family, '1h');
    expect(q.total).toBe('sum by (service_name) (increase(traces_span_metrics_calls_total[1h]))');
    expect(q.failed).toContain('status_code=~"STATUS_CODE_ERROR|ERROR"');
    expect(q.p95).toContain('histogram_quantile(0.95');
  });

  it('filters one service and quotes the label', () => {
    const q = buildSpanmetricsServiceQueries(family, 'a"b', '5m', (value) => value.replace(/"/g, '\\"'));
    expect(q.total).toBe('increase(traces_span_metrics_calls_total{service_name="a\\"b"}[5m])');
  });

  it('builds top series matchers on the service label', () => {
    const q = buildSpanmetricsTopQueries(family, ['order', 'pay'], '5m', () => '{service_name=~"order|pay"}');
    expect(q?.qps).toBe('sum by (service_name) (rate(traces_span_metrics_calls_total{service_name=~"order|pay"}[5m]))');
    expect(q?.errorRate).toContain('STATUS_CODE_ERROR');
  });

  it('includes the probe regex for known metric names', () => {
    expect(SPANMETRICS_NAME_REGEX).toContain('traces_span_metrics_calls_total');
    expect(SPANMETRICS_NAME_REGEX).toContain('calls_total');
  });
});

describe('scaleSampleValues', () => {
  it('converts millisecond quantiles to seconds', () => {
    expect(scaleSampleValues([{ value: [1, '250'] as [number, string] }], 0.001)).toEqual([{ value: [1, '0.25'] }]);
  });

  it('is a no-op at scale 1', () => {
    const samples = [{ value: [1, '2'] as [number, string] }];
    expect(scaleSampleValues(samples, 1)).toBe(samples);
  });
});
