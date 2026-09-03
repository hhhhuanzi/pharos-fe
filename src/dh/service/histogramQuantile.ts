import type { PromVectorSample } from '@/dh/trace/dependencies/promql';

/**
 * Client-side `histogram_quantile` for classic histograms, ported from Prometheus
 * `promql/quantile.go` (`BucketQuantile`, `coalesceBuckets`, `ensureMonotonicAndIgnoreSmallDeltas`)
 * and `util/almost` (`Equal`). Two quantiles over the same buckets then cost one bucket scan on
 * Thanos instead of one `histogram_quantile` call each.
 *
 * Every documented special case is reproduced: a non-`+Inf` top bucket, fewer than 2 buckets and
 * zero observations all yield NaN; a quantile inside the `+Inf` bucket yields the highest finite
 * bound; a quantile inside the lowest bucket interpolates from a natural lower bound of 0 unless
 * that bucket's own bound is already <= 0.
 */

const BUCKET_LABEL = 'le';

/** `smallDeltaTolerance` in promql/quantile.go: relative bucket delta treated as float noise. */
const SMALL_DELTA_TOLERANCE = 1e-12;

/** Smallest positive normal float64, as `minNormal` in util/almost. */
const MIN_NORMAL_FLOAT64 = 2.2250738585072014e-308;

export interface HistogramBucket {
  /** Cumulative upper bound; `Infinity` for the overflow bucket. */
  upperBound: number;
  /** Cumulative count of observations at or below `upperBound`. */
  count: number;
}

/**
 * Prometheus additionally keeps its internal stale marker distinct from other NaNs. That marker
 * never survives the HTTP API, so plain NaN equality is enough here.
 */
function almostEqual(a: number, b: number, epsilon: number): boolean {
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  if (a === b) return true;
  const absSum = Math.abs(a) + Math.abs(b);
  const diff = Math.abs(a - b);
  if (a === 0 || b === 0 || absSum < MIN_NORMAL_FLOAT64) return diff < epsilon * MIN_NORMAL_FLOAT64;
  return diff / Math.min(absSum, Number.MAX_VALUE) < epsilon;
}

function coalesceBuckets(buckets: HistogramBucket[]): HistogramBucket[] {
  const merged: HistogramBucket[] = [];
  buckets.forEach((bucket) => {
    const last = merged[merged.length - 1];
    if (last && last.upperBound === bucket.upperBound) {
      last.count += bucket.count;
      return;
    }
    merged.push({ upperBound: bucket.upperBound, count: bucket.count });
  });
  return merged;
}

/** Mutates the (already copied) buckets: ignore float-noise deltas, then remove any decrease. */
function ensureMonotonicAndIgnoreSmallDeltas(buckets: HistogramBucket[], tolerance: number): void {
  let prev = buckets[0].count;
  for (let i = 1; i < buckets.length; i += 1) {
    const curr = buckets[i].count;
    if (curr === prev) continue;
    if (almostEqual(prev, curr, tolerance)) {
      buckets[i].count = prev;
      continue;
    }
    if (curr < prev) {
      buckets[i].count = prev;
      continue;
    }
    prev = curr;
  }
}

/** Go `sort.Search`: smallest index in [0, length) where the predicate holds, else `length`. */
function searchFirst(length: number, predicate: (index: number) => boolean): number {
  let lo = 0;
  let hi = length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (!predicate(mid)) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function bucketQuantile(q: number, input: readonly HistogramBucket[]): number {
  if (Number.isNaN(q)) return NaN;
  if (q < 0) return -Infinity;
  if (q > 1) return Infinity;
  if (input.length === 0) return NaN;

  const sorted = input
    .map((bucket) => ({ ...bucket }))
    .sort((a, b) => {
      if (a.upperBound < b.upperBound) return -1;
      if (a.upperBound > b.upperBound) return 1;
      return 0;
    });
  if (sorted[sorted.length - 1].upperBound !== Infinity) return NaN;

  const buckets = coalesceBuckets(sorted);
  ensureMonotonicAndIgnoreSmallDeltas(buckets, SMALL_DELTA_TOLERANCE);

  if (buckets.length < 2) return NaN;
  const observations = buckets[buckets.length - 1].count;
  if (observations === 0) return NaN;

  let rank = q * observations;
  const b = searchFirst(buckets.length - 1, (index) => buckets[index].count >= rank);

  if (b === buckets.length - 1) return buckets[buckets.length - 2].upperBound;
  if (b === 0 && buckets[0].upperBound <= 0) return buckets[0].upperBound;

  let bucketStart = 0;
  const bucketEnd = buckets[b].upperBound;
  let count = buckets[b].count;
  if (b > 0) {
    bucketStart = buckets[b - 1].upperBound;
    count -= buckets[b - 1].count;
    rank -= buckets[b - 1].count;
  }
  return bucketStart + (bucketEnd - bucketStart) * (rank / count);
}

/**
 * `strconv.ParseFloat` semantics for the `le` label. `+Inf` is the only form JS `Number` would
 * reject. Unparseable bounds (including `NaN`, which Prometheus states it does not expect on a
 * bucket boundary) drop the sample the way the PromQL function does.
 */
export function parseBucketBound(raw: string | undefined): number | undefined {
  if (raw == null) return undefined;
  const text = raw.trim();
  if (!text) return undefined;
  if (/^[+-]?inf(inity)?$/i.test(text)) return text.startsWith('-') ? -Infinity : Infinity;
  const parsed = Number(text);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/** Prometheus renders non-finite sample values this way, so downstream parsing stays unchanged. */
function formatSampleValue(value: number): string {
  if (Number.isNaN(value)) return 'NaN';
  if (value === Infinity) return '+Inf';
  if (value === -Infinity) return '-Inf';
  return String(value);
}

interface BucketGroup {
  metric: Record<string, string>;
  timestamp: number;
  buckets: HistogramBucket[];
}

/** Signature over every label but `le`, matching `excludedLabels` in promql/quantile.go. */
function groupSignature(metric: Record<string, string>): string {
  return Object.keys(metric)
    .filter((key) => key !== BUCKET_LABEL)
    .sort()
    .map((key) => `${key}\u0000${metric[key]}\u0000`)
    .join('');
}

function metricWithoutBucketLabel(metric: Record<string, string>): Record<string, string> {
  const next: Record<string, string> = {};
  Object.keys(metric).forEach((key) => {
    if (key !== BUCKET_LABEL) next[key] = metric[key];
  });
  return next;
}

export function groupBucketSamples(samples: readonly PromVectorSample[]): BucketGroup[] {
  const bySignature = new Map<string, BucketGroup>();
  samples.forEach((sample) => {
    const metric = sample.metric || {};
    const upperBound = parseBucketBound(metric[BUCKET_LABEL]);
    if (upperBound == null) return;
    const signature = groupSignature(metric);
    let group = bySignature.get(signature);
    if (!group) {
      group = { metric: metricWithoutBucketLabel(metric), timestamp: Number(sample.value?.[0]) || 0, buckets: [] };
      bySignature.set(signature, group);
    }
    group.buckets.push({ upperBound, count: Number(sample.value?.[1]) });
  });
  return Array.from(bySignature.values());
}

/**
 * Evaluate several quantiles over one `sum by (..., le) (...)` instant vector. Each returned
 * vector is what `histogram_quantile(q, <that same vector>)` would have produced, including a
 * NaN-valued sample for groups whose buckets are degenerate.
 */
export function quantilesFromBucketVector(samples: readonly PromVectorSample[], quantiles: readonly number[]): PromVectorSample[][] {
  const groups = groupBucketSamples(samples);
  return quantiles.map((q) =>
    groups.map((group) => ({
      metric: group.metric,
      value: [group.timestamp, formatSampleValue(bucketQuantile(q, group.buckets))] as [number, string],
    })),
  );
}
