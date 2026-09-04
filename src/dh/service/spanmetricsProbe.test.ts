const getPromDataMock = jest.fn();

jest.mock('@/components/PromGraphCpt/services', () => ({
  getPromData: (...args: unknown[]) => getPromDataMock(...args),
}));

jest.mock('@/utils/constant', () => ({ N9E_PATHNAME: 'n9e' }));

import { SPANMETRICS_NAME_MATCH, SVC_SPANMETRICS_CALLS_RATE1M, SVC_SPANMETRICS_DURATION_MS_BUCKET_RATE1M } from './spanmetrics';
import { detectSpanmetricsFamily, resetSpanmetricsFamilyCache, SPANMETRICS_PROBE_TTL_MS, SPANMETRICS_PROBE_WINDOW_SECONDS } from './spanmetricsProbe';

const END_UNIX = 1_700_000_000;

describe('detectSpanmetricsFamily', () => {
  beforeEach(() => {
    resetSpanmetricsFamilyCache();
    getPromDataMock.mockReset();
  });

  it('reads metric names from the label values endpoint instead of running an instant query', async () => {
    getPromDataMock.mockResolvedValue(['traces_span_metrics_calls_total', 'traces_span_metrics_duration_milliseconds_bucket']);

    const family = await detectSpanmetricsFamily(7, END_UNIX);

    expect(getPromDataMock).toHaveBeenCalledWith('/api/n9e/proxy/7/api/v1/label/__name__/values', {
      'match[]': SPANMETRICS_NAME_MATCH,
      start: END_UNIX - SPANMETRICS_PROBE_WINDOW_SECONDS,
      end: END_UNIX,
    });
    expect(family).toEqual({
      calls: 'traces_span_metrics_calls_total',
      durationBucket: 'traces_span_metrics_duration_milliseconds_bucket',
      durationScale: 0.001,
      serviceLabel: 'service_name',
    });
  });

  it('attaches svc:* when the index has recording rules, and omits them when it does not', async () => {
    getPromDataMock.mockResolvedValue([
      'traces_span_metrics_calls_total',
      'traces_span_metrics_duration_milliseconds_bucket',
      SVC_SPANMETRICS_CALLS_RATE1M,
      SVC_SPANMETRICS_DURATION_MS_BUCKET_RATE1M,
    ]);

    expect(await detectSpanmetricsFamily(7, END_UNIX)).toEqual({
      calls: 'traces_span_metrics_calls_total',
      durationBucket: 'traces_span_metrics_duration_milliseconds_bucket',
      durationScale: 0.001,
      serviceLabel: 'service_name',
      recordedCalls: SVC_SPANMETRICS_CALLS_RATE1M,
      recordedDurationBucket: SVC_SPANMETRICS_DURATION_MS_BUCKET_RATE1M,
    });
    expect(SPANMETRICS_NAME_MATCH).toContain(SVC_SPANMETRICS_CALLS_RATE1M);
  });

  it('ignores non-string entries and unexpected payload shapes', async () => {
    getPromDataMock.mockResolvedValue({ status: 'success' });
    expect(await detectSpanmetricsFamily(1, END_UNIX)).toBeUndefined();

    resetSpanmetricsFamilyCache();
    getPromDataMock.mockResolvedValue([null, '', 'calls_total']);
    expect(await detectSpanmetricsFamily(1, END_UNIX)).toEqual({
      calls: 'calls_total',
      durationScale: 1,
      serviceLabel: 'service_name',
    });
  });

  it('sends one request for concurrent callers', async () => {
    getPromDataMock.mockResolvedValue(['calls_total']);

    const results = await Promise.all([detectSpanmetricsFamily(3, END_UNIX), detectSpanmetricsFamily(3, END_UNIX), detectSpanmetricsFamily(3, END_UNIX)]);

    expect(getPromDataMock).toHaveBeenCalledTimes(1);
    expect(results[0]).toBe(results[1]);
    expect(results[1]).toBe(results[2]);
  });

  it('caches per datasource and refetches once the ttl elapsed', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(0);
    getPromDataMock.mockResolvedValue(['calls_total']);

    await detectSpanmetricsFamily(3, END_UNIX);
    await detectSpanmetricsFamily(3, END_UNIX);
    expect(getPromDataMock).toHaveBeenCalledTimes(1);

    await detectSpanmetricsFamily(4, END_UNIX);
    expect(getPromDataMock).toHaveBeenCalledTimes(2);

    nowSpy.mockReturnValue(SPANMETRICS_PROBE_TTL_MS + 1);
    await detectSpanmetricsFamily(3, END_UNIX);
    expect(getPromDataMock).toHaveBeenCalledTimes(3);

    nowSpy.mockRestore();
  });

  it('rejects on failure and retries on the next call', async () => {
    /**
     * Rejecting keeps "Prometheus is unreachable" apart from "this Prometheus has no spanmetrics":
     * RED has no second source, so the first has to reach the page as an error while the second
     * legitimately leaves the RED columns blank. The failure is not cached, or one blip would blank
     * RED for the whole TTL.
     */
    getPromDataMock.mockRejectedValueOnce(new Error('502'));

    await expect(detectSpanmetricsFamily(9, END_UNIX)).rejects.toThrow('502');

    getPromDataMock.mockResolvedValue(['traces_spanmetrics_calls_total']);
    expect(await detectSpanmetricsFamily(9, END_UNIX)).toEqual({
      calls: 'traces_spanmetrics_calls_total',
      durationScale: 1,
      serviceLabel: 'service_name',
    });
    expect(getPromDataMock).toHaveBeenCalledTimes(2);
  });
});
