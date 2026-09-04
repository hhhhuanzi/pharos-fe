import { ENV_GROUP_LABEL } from './constants';
import type { RedQuerySet } from './red';
import { buildPromRatio } from './series';

/** OTel spanmetrics families commonly exported to Prometheus. Prefer namespaced names first. */

export const SPANMETRICS_CALLS_CANDIDATES = ['traces_span_metrics_calls_total', 'traces_spanmetrics_calls_total', 'calls_total'] as const;

export const SPANMETRICS_DURATION_MS_CANDIDATES = [
  'traces_span_metrics_duration_milliseconds_bucket',
  'traces_spanmetrics_duration_milliseconds_bucket',
  'duration_milliseconds_bucket',
] as const;

export const SPANMETRICS_DURATION_S_CANDIDATES = ['traces_span_metrics_duration_seconds_bucket', 'traces_spanmetrics_latency_bucket', 'duration_seconds_bucket'] as const;

/** Pre-aggregated catalog metrics. Names and step must match the PrometheusRule group interval. */
export const SVC_SPANMETRICS_CALLS_RATE1M = 'svc:traces_span_metrics_calls:rate1m';
export const SVC_SPANMETRICS_DURATION_MS_BUCKET_RATE1M = 'svc:traces_span_metrics_duration_ms_bucket:rate1m';
export const SVC_RECORD_INTERVAL_SECONDS = 60;

export const SPANMETRICS_NAME_REGEX = [
  ...SPANMETRICS_CALLS_CANDIDATES,
  ...SPANMETRICS_DURATION_MS_CANDIDATES,
  ...SPANMETRICS_DURATION_S_CANDIDATES,
  SVC_SPANMETRICS_CALLS_RATE1M,
  SVC_SPANMETRICS_DURATION_MS_BUCKET_RATE1M,
].join('|');

/** Probe selector: keep it `__name__`-only so the metadata endpoint answers from the index. */
export const SPANMETRICS_NAME_MATCH = `{__name__=~"${SPANMETRICS_NAME_REGEX}"}`;

export interface SpanmetricsFamily {
  calls: string;
  durationBucket?: string;
  /** Multiply histogram quantile by this to get seconds. */
  durationScale: number;
  serviceLabel: string;
  /** Catalog-only. Absent → list falls back to raw increase/rate. */
  recordedCalls?: string;
  recordedDurationBucket?: string;
}

export function pickSpanmetricsFamily(metricNames: string[]): SpanmetricsFamily | undefined {
  const set = new Set(metricNames.filter(Boolean));
  const calls = SPANMETRICS_CALLS_CANDIDATES.find((name) => set.has(name));
  if (!calls) return undefined;
  const ms = SPANMETRICS_DURATION_MS_CANDIDATES.find((name) => set.has(name));
  const seconds = SPANMETRICS_DURATION_S_CANDIDATES.find((name) => set.has(name));
  const family: SpanmetricsFamily = {
    calls,
    durationScale: ms ? 0.001 : 1,
    serviceLabel: 'service_name',
  };
  if (ms || seconds) family.durationBucket = ms || seconds;
  if (set.has(SVC_SPANMETRICS_CALLS_RATE1M)) family.recordedCalls = SVC_SPANMETRICS_CALLS_RATE1M;
  if (set.has(SVC_SPANMETRICS_DURATION_MS_BUCKET_RATE1M)) {
    family.recordedDurationBucket = SVC_SPANMETRICS_DURATION_MS_BUCKET_RATE1M;
  }
  return family;
}

export function spanmetricsErrorMatcher(): string {
  return 'status_code=~"STATUS_CODE_ERROR|ERROR"';
}

export function buildSpanmetricsCatalogQueries(family: SpanmetricsFamily, range: string) {
  /**
   * Environment must be in the grouping: without it same-named services from different
   * environments are summed into one row and their latency buckets merged into one bogus
   * quantile. Language stays on the raw vector so the list column can read it; language-split
   * series still merge per service in JS. Recorded rules fold language away — the list fills
   * that column from `target_info` instead.
   */
  const byRaw = `${family.serviceLabel}, ${ENV_GROUP_LABEL}, telemetry_sdk_language`;
  const byRec = `${family.serviceLabel}, ${ENV_GROUP_LABEL}`;
  const errorSel = `{${spanmetricsErrorMatcher()}}`;
  const queries: RedQuerySet = family.recordedCalls
    ? {
        total: `sum by (${byRec}) (sum_over_time(${family.recordedCalls}[${range}]) * ${SVC_RECORD_INTERVAL_SECONDS})`,
        failed: `sum by (${byRec}) (sum_over_time(${family.recordedCalls}${errorSel}[${range}]) * ${SVC_RECORD_INTERVAL_SECONDS})`,
      }
    : {
        total: `sum by (${byRaw}) (increase(${family.calls}[${range}]))`,
        failed: `sum by (${byRaw}) (increase(${family.calls}${errorSel}[${range}]))`,
      };
  if (family.recordedDurationBucket) {
    queries.quantileBuckets = `sum by (${byRec}, le) (sum_over_time(${family.recordedDurationBucket}[${range}]))`;
  } else if (family.durationBucket) {
    queries.quantileBuckets = `sum by (${byRaw}, le) (rate(${family.durationBucket}[${range}]))`;
  }
  return queries;
}

export function buildSpanmetricsServiceQueries(family: SpanmetricsFamily, service: string, range: string, escapeLabel: (value: string) => string, env?: string) {
  /** Detail page must read the same slice as the list row it was opened from. */
  const envSel = env ? `, ${ENV_GROUP_LABEL}="${escapeLabel(env)}"` : '';
  const matcher = `{${family.serviceLabel}="${escapeLabel(service)}"${envSel}}`;
  const errorSel = `{${family.serviceLabel}="${escapeLabel(service)}"${envSel}, ${spanmetricsErrorMatcher()}}`;
  const queries: RedQuerySet = {
    total: `increase(${family.calls}${matcher}[${range}])`,
    failed: `increase(${family.calls}${errorSel}[${range}])`,
  };
  if (family.durationBucket) {
    queries.quantileBuckets = `sum by (le) (rate(${family.durationBucket}${matcher}[${range}]))`;
  }
  return queries;
}

/**
 * Top charts are query_range line series. Recording rules are already 1m rates — do not wrap
 * `rate()` / `increase()`, and do not copy the catalog's instant `sum_over_time * 60` (that
 * turns a rate into a window count). Missing `svc:*` keeps the raw rate + histogram_quantile.
 */
export function buildSpanmetricsTopQueries(family: SpanmetricsFamily, services: string[], window: string, buildMatcher: (services: string[], label: string) => string) {
  if (services.length === 0) return null;
  const matcher = buildMatcher(services, family.serviceLabel);
  const errorMatcher = matcher.replace(/\}$/, `, ${spanmetricsErrorMatcher()}}`);
  const by = `${family.serviceLabel}, ${ENV_GROUP_LABEL}`;
  const calls = family.recordedCalls ?? family.calls;
  const total = family.recordedCalls ? `sum by (${by}) (${calls}${matcher})` : `sum by (${by}) (rate(${calls}${matcher}[${window}]))`;
  const failed = family.recordedCalls ? `sum by (${by}) (${calls}${errorMatcher})` : `sum by (${by}) (rate(${calls}${errorMatcher}[${window}]))`;
  const queries: { qps: string; errorRate: string; p95?: string } = {
    qps: total,
    errorRate: buildPromRatio(failed, total),
  };
  if (family.recordedDurationBucket) {
    queries.p95 = `histogram_quantile(0.95, sum by (${by}, le) (${family.recordedDurationBucket}${matcher}))`;
  } else if (family.durationBucket) {
    queries.p95 = `histogram_quantile(0.95, sum by (${by}, le) (rate(${family.durationBucket}${matcher}[${window}])))`;
  }
  return queries;
}

export function scaleSampleValues<T extends { value?: [number, string] }>(samples: T[], scale: number): T[] {
  if (scale === 1) return samples;
  return samples.map((sample) => {
    const raw = sample.value?.[1];
    const n = Number(raw);
    if (!sample.value || !Number.isFinite(n)) return sample;
    return { ...sample, value: [sample.value[0], String(n * scale)] };
  });
}

export function scaleMatrixValues<T extends { values: Array<[number, string]> }>(samples: T[], scale: number): T[] {
  if (scale === 1) return samples;
  return samples.map((sample) => ({
    ...sample,
    values: (sample.values || []).map(([ts, value]) => {
      const n = Number(value);
      return [ts, Number.isFinite(n) ? String(n * scale) : value] as [number, string];
    }),
  }));
}
