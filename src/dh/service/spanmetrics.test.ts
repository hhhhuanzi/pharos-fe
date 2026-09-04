import {
  buildSpanmetricsCatalogQueries,
  buildSpanmetricsServiceQueries,
  buildSpanmetricsTopQueries,
  pickSpanmetricsFamily,
  scaleSampleValues,
  SPANMETRICS_NAME_MATCH,
  SPANMETRICS_NAME_REGEX,
  SVC_RECORD_INTERVAL_SECONDS,
  SVC_SPANMETRICS_CALLS_RATE1M,
  SVC_SPANMETRICS_DURATION_MS_BUCKET_RATE1M,
} from './spanmetrics';

describe('pickSpanmetricsFamily', () => {
  it('prefers namespaced OTel metrics and treats duration as milliseconds', () => {
    expect(pickSpanmetricsFamily(['calls_total', 'traces_span_metrics_calls_total', 'traces_span_metrics_duration_milliseconds_bucket'])).toEqual({
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

  it('attaches recording-rule names when the probe finds svc:*', () => {
    expect(
      pickSpanmetricsFamily([
        'traces_span_metrics_calls_total',
        'traces_span_metrics_duration_milliseconds_bucket',
        SVC_SPANMETRICS_CALLS_RATE1M,
        SVC_SPANMETRICS_DURATION_MS_BUCKET_RATE1M,
      ]),
    ).toEqual({
      calls: 'traces_span_metrics_calls_total',
      durationBucket: 'traces_span_metrics_duration_milliseconds_bucket',
      durationScale: 0.001,
      serviceLabel: 'service_name',
      recordedCalls: SVC_SPANMETRICS_CALLS_RATE1M,
      recordedDurationBucket: SVC_SPANMETRICS_DURATION_MS_BUCKET_RATE1M,
    });
  });
});

describe('spanmetrics queries', () => {
  const family = {
    calls: 'traces_span_metrics_calls_total',
    durationBucket: 'traces_span_metrics_duration_milliseconds_bucket',
    durationScale: 0.001,
    serviceLabel: 'service_name',
  } as const;

  it('keeps environment in the grouping so same-named services are not summed together', () => {
    const q = buildSpanmetricsCatalogQueries(family, '1h');
    expect(q.total).toBe('sum by (service_name, deployment_environment_name, telemetry_sdk_language) (increase(traces_span_metrics_calls_total[1h]))');
    expect(q.failed).toBe(
      'sum by (service_name, deployment_environment_name, telemetry_sdk_language) (increase(traces_span_metrics_calls_total{status_code=~"STATUS_CODE_ERROR|ERROR"}[1h]))',
    );
  });

  it('asks for raw buckets once instead of one histogram_quantile call per quantile', () => {
    const q = buildSpanmetricsCatalogQueries(family, '1h');
    expect(q.quantileBuckets).toBe('sum by (service_name, deployment_environment_name, telemetry_sdk_language, le) (rate(traces_span_metrics_duration_milliseconds_bucket[1h]))');
  });

  it('omits the bucket query when the family has no duration histogram', () => {
    const callsOnly = { calls: 'calls_total', durationScale: 1, serviceLabel: 'service_name' } as const;
    expect(buildSpanmetricsCatalogQueries(callsOnly, '1h').quantileBuckets).toBeUndefined();
    expect(buildSpanmetricsServiceQueries(callsOnly, 'order', '1h', (value) => value).quantileBuckets).toBeUndefined();
  });

  it('reads the catalog from svc:* with sum_over_time and never increase(svc:)', () => {
    const recorded = {
      ...family,
      recordedCalls: SVC_SPANMETRICS_CALLS_RATE1M,
      recordedDurationBucket: SVC_SPANMETRICS_DURATION_MS_BUCKET_RATE1M,
    } as const;
    const q = buildSpanmetricsCatalogQueries(recorded, '1h');
    expect(q.total).toBe(`sum by (service_name, deployment_environment_name) (sum_over_time(${SVC_SPANMETRICS_CALLS_RATE1M}[1h]) * ${SVC_RECORD_INTERVAL_SECONDS})`);
    expect(q.failed).toBe(
      `sum by (service_name, deployment_environment_name) (sum_over_time(${SVC_SPANMETRICS_CALLS_RATE1M}{status_code=~"STATUS_CODE_ERROR|ERROR"}[1h]) * ${SVC_RECORD_INTERVAL_SECONDS})`,
    );
    expect(q.quantileBuckets).toBe(`sum by (service_name, deployment_environment_name, le) (sum_over_time(${SVC_SPANMETRICS_DURATION_MS_BUCKET_RATE1M}[1h]))`);
    expect(q.total.includes('increase(')).toBe(false);
    expect(q.failed.includes('increase(')).toBe(false);
  });

  it('falls buckets back to the raw histogram when only calls are pre-aggregated', () => {
    const recordedCallsOnly = { ...family, recordedCalls: SVC_SPANMETRICS_CALLS_RATE1M } as const;
    const q = buildSpanmetricsCatalogQueries(recordedCallsOnly, '1h');
    expect(q.total).toContain(`sum_over_time(${SVC_SPANMETRICS_CALLS_RATE1M}`);
    expect(q.quantileBuckets).toBe('sum by (service_name, deployment_environment_name, telemetry_sdk_language, le) (rate(traces_span_metrics_duration_milliseconds_bucket[1h]))');
  });

  it('filters one service and quotes the label', () => {
    const q = buildSpanmetricsServiceQueries(family, 'a"b', '5m', (value) => value.replace(/"/g, '\\"'));
    expect(q.total).toBe('increase(traces_span_metrics_calls_total{service_name="a\\"b"}[5m])');
  });

  it('narrows to one environment when the detail page was opened from an env-scoped row', () => {
    const q = buildSpanmetricsServiceQueries(family, 'order', '5m', (value) => value, 'prod');
    expect(q.total).toBe('increase(traces_span_metrics_calls_total{service_name="order", deployment_environment_name="prod"}[5m])');
    expect(q.failed).toBe('increase(traces_span_metrics_calls_total{service_name="order", deployment_environment_name="prod", status_code=~"STATUS_CODE_ERROR|ERROR"}[5m])');
    expect(q.quantileBuckets).toBe('sum by (le) (rate(traces_span_metrics_duration_milliseconds_bucket{service_name="order", deployment_environment_name="prod"}[5m]))');
  });

  it('builds top series matchers on the service label and splits lines per environment', () => {
    const q = buildSpanmetricsTopQueries(family, ['order', 'pay'], '5m', () => '{service_name=~"order|pay"}');
    expect(q?.qps).toBe('sum by (service_name, deployment_environment_name) (rate(traces_span_metrics_calls_total{service_name=~"order|pay"}[5m]))');
    expect(q?.errorRate).toContain('sum by (service_name, deployment_environment_name)');
    expect(q?.p95).toBe(
      'histogram_quantile(0.95, sum by (service_name, deployment_environment_name, le) (rate(traces_span_metrics_duration_milliseconds_bucket{service_name=~"order|pay"}[5m])))',
    );
  });

  it('reads top series from svc:* rates without wrapping rate or increase', () => {
    const recorded = {
      ...family,
      recordedCalls: SVC_SPANMETRICS_CALLS_RATE1M,
      recordedDurationBucket: SVC_SPANMETRICS_DURATION_MS_BUCKET_RATE1M,
    } as const;
    const q = buildSpanmetricsTopQueries(recorded, ['order', 'pay'], '5m', () => '{service_name=~"order|pay"}');
    expect(q?.qps).toBe(`sum by (service_name, deployment_environment_name) (${SVC_SPANMETRICS_CALLS_RATE1M}{service_name=~"order|pay"})`);
    expect(q?.errorRate).toBe(
      `(sum by (service_name, deployment_environment_name) (${SVC_SPANMETRICS_CALLS_RATE1M}{service_name=~"order|pay", status_code=~"STATUS_CODE_ERROR|ERROR"}) or (sum by (service_name, deployment_environment_name) (${SVC_SPANMETRICS_CALLS_RATE1M}{service_name=~"order|pay"}) * 0)) / sum by (service_name, deployment_environment_name) (${SVC_SPANMETRICS_CALLS_RATE1M}{service_name=~"order|pay"})`,
    );
    expect(q?.p95).toBe(
      `histogram_quantile(0.95, sum by (service_name, deployment_environment_name, le) (${SVC_SPANMETRICS_DURATION_MS_BUCKET_RATE1M}{service_name=~"order|pay"}))`,
    );
    expect(q?.qps.includes('rate(')).toBe(false);
    expect(q?.qps.includes('increase(')).toBe(false);
    expect(q?.p95?.includes('rate(')).toBe(false);
    expect(q?.p95?.includes('sum_over_time')).toBe(false);
  });

  it('keeps raw top latency when only calls are pre-aggregated', () => {
    const recordedCallsOnly = { ...family, recordedCalls: SVC_SPANMETRICS_CALLS_RATE1M } as const;
    const q = buildSpanmetricsTopQueries(recordedCallsOnly, ['order'], '5m', () => '{service_name=~"order"}');
    expect(q?.qps).toContain(SVC_SPANMETRICS_CALLS_RATE1M);
    expect(q?.p95).toBe(
      'histogram_quantile(0.95, sum by (service_name, deployment_environment_name, le) (rate(traces_span_metrics_duration_milliseconds_bucket{service_name=~"order"}[5m])))',
    );
  });

  it('includes the probe regex for known metric names', () => {
    expect(SPANMETRICS_NAME_REGEX).toContain('traces_span_metrics_calls_total');
    expect(SPANMETRICS_NAME_REGEX).toContain('calls_total');
    expect(SPANMETRICS_NAME_REGEX).toContain(SVC_SPANMETRICS_CALLS_RATE1M);
    expect(SPANMETRICS_NAME_REGEX).toContain(SVC_SPANMETRICS_DURATION_MS_BUCKET_RATE1M);
  });

  it('keeps the probe selector limited to __name__', () => {
    expect(SPANMETRICS_NAME_MATCH).toBe(`{__name__=~"${SPANMETRICS_NAME_REGEX}"}`);
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
