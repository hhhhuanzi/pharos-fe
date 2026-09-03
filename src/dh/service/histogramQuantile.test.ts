import type { PromVectorSample } from '@/dh/trace/dependencies/promql';

import { bucketQuantile, groupBucketSamples, parseBucketBound, quantilesFromBucketVector, type HistogramBucket } from './histogramQuantile';

const INF = Infinity;

function buckets(...pairs: Array<[number, number]>): HistogramBucket[] {
  return pairs.map(([upperBound, count]) => ({ upperBound, count }));
}

/** le 0.1→10, 0.25→80, 0.5→95, 1→99, +Inf→100: P95 and P99 land exactly on a bucket boundary. */
const REALISTIC = buckets([0.1, 10], [0.25, 80], [0.5, 95], [1, 99], [INF, 100]);

describe('bucketQuantile — quantile argument', () => {
  it('mirrors the documented q<0 / q>1 / NaN answers', () => {
    expect(bucketQuantile(NaN, REALISTIC)).toBeNaN();
    expect(bucketQuantile(-0.1, REALISTIC)).toBe(-Infinity);
    expect(bucketQuantile(1.5, REALISTIC)).toBe(Infinity);
  });

  it('takes q=1 to the highest finite bound and q=0 to the natural lower bound', () => {
    expect(bucketQuantile(1, REALISTIC)).toBe(1);
    // rank 0 sits in the lowest bucket, which interpolates from 0.
    expect(bucketQuantile(0, REALISTIC)).toBe(0);
    // ...unless that bucket counted nothing, which makes the fraction 0/0.
    expect(bucketQuantile(0, buckets([0.1, 0], [INF, 10]))).toBeNaN();
  });
});

describe('bucketQuantile — interpolation', () => {
  it('returns the bucket bound when the rank lands exactly on it', () => {
    expect(bucketQuantile(0.95, REALISTIC)).toBe(0.5);
    expect(bucketQuantile(0.99, REALISTIC)).toBe(1);
  });

  it('interpolates linearly inside a bucket', () => {
    // 0.1 + (0.25 - 0.1) * ((50 - 10) / (80 - 10))
    expect(bucketQuantile(0.5, REALISTIC)).toBeCloseTo(0.18571428571428572, 12);
  });

  it('interpolates the lowest bucket from a natural lower bound of 0', () => {
    // Two buckets only: rank 2 of 10 sits inside (0, 1] which holds 4 observations.
    expect(bucketQuantile(0.2, buckets([1, 4], [INF, 10]))).toBe(0.5);
  });

  it('returns the lowest bound instead of interpolating when that bound is not positive', () => {
    expect(bucketQuantile(0.2, buckets([0, 5], [INF, 10]))).toBe(0);
    expect(bucketQuantile(0.2, buckets([-1, 5], [INF, 10]))).toBe(-1);
  });

  it('returns the highest finite bound when the quantile falls into the +Inf bucket', () => {
    expect(bucketQuantile(0.999, REALISTIC)).toBe(1);
    expect(bucketQuantile(0.9, buckets([0.1, 0], [0.2, 2], [0.5, 5], [INF, 10]))).toBe(0.5);
  });
});

describe('bucketQuantile — degenerate input', () => {
  it('is NaN without buckets, with a single bucket, or without a +Inf bucket', () => {
    expect(bucketQuantile(0.95, [])).toBeNaN();
    expect(bucketQuantile(0.95, buckets([INF, 10]))).toBeNaN();
    expect(bucketQuantile(0.95, buckets([1, 5]))).toBeNaN();
    expect(bucketQuantile(0.95, buckets([0.5, 3], [1, 5]))).toBeNaN();
  });

  it('is NaN when the histogram counted nothing', () => {
    expect(bucketQuantile(0.95, buckets([1, 0], [INF, 0]))).toBeNaN();
  });

  it('is NaN when duplicate bounds collapse the histogram below two buckets', () => {
    expect(bucketQuantile(0.95, buckets([INF, 4], [INF, 6]))).toBeNaN();
  });

  it('falls through to the highest finite bound when the observation count is NaN', () => {
    // Every `count >= NaN` comparison is false, so the bucket search runs off the end.
    expect(bucketQuantile(0.95, buckets([1, 5], [INF, NaN]))).toBe(1);
  });
});

describe('bucketQuantile — normalisation', () => {
  it('sorts by bound, so response order does not matter', () => {
    const shuffled = buckets([INF, 100], [0.5, 95], [0.1, 10], [1, 99], [0.25, 80]);
    expect(bucketQuantile(0.95, shuffled)).toBe(bucketQuantile(0.95, REALISTIC));
    expect(bucketQuantile(0.99, shuffled)).toBe(bucketQuantile(0.99, REALISTIC));
  });

  it('coalesces duplicate bounds by summing their counts', () => {
    expect(bucketQuantile(0.2, buckets([1, 2], [1, 3], [INF, 10]))).toBe(bucketQuantile(0.2, buckets([1, 5], [INF, 10])));
  });

  it('removes decreases, both float-noise sized and large', () => {
    const monotonic = buckets([1, 5], [2, 5], [INF, 10]);
    expect(bucketQuantile(0.5, buckets([1, 5], [2, 4.999999999999999], [INF, 10]))).toBe(bucketQuantile(0.5, monotonic));
    expect(bucketQuantile(0.5, buckets([1, 5], [2, 3], [INF, 10]))).toBe(bucketQuantile(0.5, monotonic));
    expect(bucketQuantile(0.5, monotonic)).toBe(1);
    expect(bucketQuantile(0.7, buckets([1, 5], [2, 3], [INF, 10]))).toBe(2);
  });

  it('never mutates the caller buckets, so two quantiles read the same input', () => {
    const input = buckets([1, 5], [2, 3], [INF, 10]);
    const snapshot = JSON.stringify(input);
    bucketQuantile(0.95, input);
    bucketQuantile(0.99, input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

/**
 * Conformance vectors lifted from Prometheus' own `promql/promqltest/testdata/histograms.test`
 * (`testhistogram_bucket` / `testhistogram3_bucket` evaluated at 50m, where `0+Nx10` has reached
 * `N*10`). The expected numbers are the ones Prometheus asserts for itself, so a mismatch here
 * means the list and detail pages would start showing different latencies than the server did.
 */
describe('bucketQuantile — conformance with Prometheus test vectors', () => {
  // le 0.1→50, .2→70, 1e0→110, +Inf→120 (the +Inf bucket has observations).
  const positive = buckets([0.1, 50], [0.2, 70], [1, 110], [INF, 120]);
  // le -.2→10, -0.1→20, 0.3→20, +Inf→30.
  const negative = buckets([-0.2, 10], [-0.1, 20], [0.3, 20], [INF, 30]);
  // le 0→0, 0.1→50, .2→70, 1e0→110, +Inf→110 (nothing above the highest finite bucket).
  const positive3 = buckets([0, 0], [0.1, 50], [0.2, 70], [1, 110], [INF, 110]);
  // le -.25→0, -.2→10, -0.1→20, 0.3→20, +Inf→20.
  const negative3 = buckets([-0.25, 0], [-0.2, 10], [-0.1, 20], [0.3, 20], [INF, 20]);

  it.each([
    [0, positive, 0],
    [0.2, positive, 0.048],
    [0.5, positive, 0.15],
    [0.8, positive, 0.72],
    [1, positive, 1],
    [0, negative, -0.2],
    [0.2, negative, -0.2],
    [0.5, negative, -0.15],
    [0.8, negative, 0.3],
    [1, negative, 0.3],
  ])('testhistogram_bucket at q=%p', (q, input, expected) => {
    expect(bucketQuantile(q, input)).toBeCloseTo(expected, 12);
  });

  it.each([
    [0, positive3, 0],
    [0.25, positive3, 0.055],
    [0.5, positive3, 0.125],
    [0.75, positive3, 0.45],
    [1, positive3, 1],
    [0, negative3, -0.25],
    [0.25, negative3, -0.225],
    [0.5, negative3, -0.2],
    [0.75, negative3, -0.15],
    [1, negative3, -0.1],
  ])('testhistogram3_bucket at q=%p', (q, input, expected) => {
    expect(bucketQuantile(q, input)).toBeCloseTo(expected, 12);
  });
});

describe('parseBucketBound', () => {
  it('accepts every form Prometheus writes for the le label', () => {
    expect(parseBucketBound('0.005')).toBe(0.005);
    expect(parseBucketBound('1e-3')).toBe(0.001);
    expect(parseBucketBound('+Inf')).toBe(Infinity);
    expect(parseBucketBound('Inf')).toBe(Infinity);
    expect(parseBucketBound('-Inf')).toBe(-Infinity);
    expect(parseBucketBound('0')).toBe(0);
  });

  it('rejects bounds that cannot be a bucket boundary', () => {
    expect(parseBucketBound(undefined)).toBeUndefined();
    expect(parseBucketBound('')).toBeUndefined();
    expect(parseBucketBound('abc')).toBeUndefined();
    expect(parseBucketBound('NaN')).toBeUndefined();
  });
});

function bucketSample(labels: Record<string, string>, le: string, value: string): PromVectorSample {
  return { metric: { ...labels, le }, value: [1_700_000_000, value] };
}

function groupOf(labels: Record<string, string>, counts: Array<[string, string]>): PromVectorSample[] {
  return counts.map(([le, value]) => bucketSample(labels, le, value));
}

describe('groupBucketSamples', () => {
  it('groups by every label but le and drops le from the output metric', () => {
    const groups = groupBucketSamples([
      ...groupOf({ service_name: 'order', deployment_environment_name: 'prod' }, [
        ['0.1', '1'],
        ['+Inf', '4'],
      ]),
      ...groupOf({ service_name: 'order', deployment_environment_name: 'test' }, [
        ['0.1', '2'],
        ['+Inf', '5'],
      ]),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].metric).toEqual({ service_name: 'order', deployment_environment_name: 'prod' });
    expect(groups[0].buckets).toEqual([
      { upperBound: 0.1, count: 1 },
      { upperBound: Infinity, count: 4 },
    ]);
    expect(groups[1].metric.deployment_environment_name).toBe('test');
  });

  it('skips samples with an unusable le and drops groups left without any bucket', () => {
    const groups = groupBucketSamples([
      ...groupOf({ service_name: 'order' }, [
        ['0.1', '1'],
        ['abc', '2'],
        ['+Inf', '4'],
      ]),
      ...groupOf({ service_name: 'broken' }, [
        ['', '1'],
        ['NaN', '2'],
      ]),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].metric).toEqual({ service_name: 'order' });
    expect(groups[0].buckets.map((bucket) => bucket.upperBound)).toEqual([0.1, Infinity]);
  });

  it('keeps a group whose labels are only le, as produced by sum by (le)', () => {
    const groups = groupBucketSamples(
      groupOf({}, [
        ['0.25', '80'],
        ['+Inf', '100'],
      ]),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].metric).toEqual({});
  });
});

describe('quantilesFromBucketVector', () => {
  const samples = [
    ...groupOf({ service_name: 'order', deployment_environment_name: 'prod' }, [
      ['0.1', '10'],
      ['0.25', '80'],
      ['0.5', '95'],
      ['1', '99'],
      ['+Inf', '100'],
    ]),
    ...groupOf({ service_name: 'quote', deployment_environment_name: 'prod' }, [
      ['1', '0'],
      ['+Inf', '0'],
    ]),
  ];

  it('returns one vector per requested quantile, aligned with the input order', () => {
    const [p95, p99] = quantilesFromBucketVector(samples, [0.95, 0.99]);

    expect(p95).toEqual([
      { metric: { service_name: 'order', deployment_environment_name: 'prod' }, value: [1_700_000_000, '0.5'] },
      { metric: { service_name: 'quote', deployment_environment_name: 'prod' }, value: [1_700_000_000, 'NaN'] },
    ]);
    expect(p99[0].value[1]).toBe('1');
  });

  it('keeps a NaN-valued sample for degenerate groups, the way histogram_quantile does', () => {
    const [p95] = quantilesFromBucketVector(
      groupOf({ service_name: 'quote' }, [
        ['1', '0'],
        ['+Inf', '0'],
      ]),
      [0.95],
    );
    expect(p95).toHaveLength(1);
    expect(p95[0].value[1]).toBe('NaN');
  });

  it('is empty for an empty vector', () => {
    expect(quantilesFromBucketVector([], [0.95, 0.99])).toEqual([[], []]);
  });

  it('is idempotent: repeated evaluation of the same vector gives the same numbers', () => {
    expect(quantilesFromBucketVector(samples, [0.95, 0.99])).toEqual(quantilesFromBucketVector(samples, [0.95, 0.99]));
  });
});
