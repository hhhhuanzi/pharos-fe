import { ENV_GROUP_LABEL } from './constants';
import { buildPromRatio } from './series';

/** OTel spanmetrics families commonly exported to Prometheus. Prefer namespaced names first. */

export const SPANMETRICS_CALLS_CANDIDATES = [
  'traces_span_metrics_calls_total',
  'traces_spanmetrics_calls_total',
  'calls_total',
] as const;

export const SPANMETRICS_DURATION_MS_CANDIDATES = [
  'traces_span_metrics_duration_milliseconds_bucket',
  'traces_spanmetrics_duration_milliseconds_bucket',
  'duration_milliseconds_bucket',
] as const;

export const SPANMETRICS_DURATION_S_CANDIDATES = [
  'traces_span_metrics_duration_seconds_bucket',
  'traces_spanmetrics_latency_bucket',
  'duration_seconds_bucket',
] as const;

export const SPANMETRICS_NAME_REGEX = [
  ...SPANMETRICS_CALLS_CANDIDATES,
  ...SPANMETRICS_DURATION_MS_CANDIDATES,
  ...SPANMETRICS_DURATION_S_CANDIDATES,
].join('|');

export interface SpanmetricsFamily {
  calls: string;
  durationBucket?: string;
  /** Multiply histogram quantile by this to get seconds. */
  durationScale: number;
  serviceLabel: string;
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
  return family;
}

export function spanmetricsErrorMatcher(): string {
  return 'status_code=~"STATUS_CODE_ERROR|ERROR"';
}

export function buildSpanmetricsCatalogQueries(family: SpanmetricsFamily, range: string) {
  /**
   * Environment must be in the grouping: without it same-named services from different
   * environments are summed into one row and their latency buckets merged into one bogus
   * quantile. Language stays on the vector so the list column can read it; language-split
   * series still merge per service in JS.
   */
  const by = `${family.serviceLabel}, ${ENV_GROUP_LABEL}, telemetry_sdk_language`;
  const errorSel = `{${spanmetricsErrorMatcher()}}`;
  const queries: { total: string; failed: string; p95?: string; p99?: string } = {
    total: `sum by (${by}) (increase(${family.calls}[${range}]))`,
    failed: `sum by (${by}) (increase(${family.calls}${errorSel}[${range}]))`,
  };
  if (family.durationBucket) {
    queries.p95 = `histogram_quantile(0.95, sum by (${by}, le) (rate(${family.durationBucket}[${range}])))`;
    queries.p99 = `histogram_quantile(0.99, sum by (${by}, le) (rate(${family.durationBucket}[${range}])))`;
  }
  return queries;
}

export function buildSpanmetricsServiceQueries(
  family: SpanmetricsFamily,
  service: string,
  range: string,
  escapeLabel: (value: string) => string,
  env?: string,
) {
  /** Detail page must read the same slice as the list row it was opened from. */
  const envSel = env ? `, ${ENV_GROUP_LABEL}="${escapeLabel(env)}"` : '';
  const matcher = `{${family.serviceLabel}="${escapeLabel(service)}"${envSel}}`;
  const errorSel = `{${family.serviceLabel}="${escapeLabel(service)}"${envSel}, ${spanmetricsErrorMatcher()}}`;
  const queries: { total: string; failed: string; p95?: string; p99?: string } = {
    total: `increase(${family.calls}${matcher}[${range}])`,
    failed: `increase(${family.calls}${errorSel}[${range}])`,
  };
  if (family.durationBucket) {
    queries.p95 = `histogram_quantile(0.95, sum by (le) (rate(${family.durationBucket}${matcher}[${range}])))`;
    queries.p99 = `histogram_quantile(0.99, sum by (le) (rate(${family.durationBucket}${matcher}[${range}])))`;
  }
  return queries;
}

export function buildSpanmetricsTopQueries(
  family: SpanmetricsFamily,
  services: string[],
  window: string,
  buildMatcher: (services: string[], label: string) => string,
) {
  if (services.length === 0) return null;
  const matcher = buildMatcher(services, family.serviceLabel);
  const errorMatcher = matcher.replace(/\}$/, `, ${spanmetricsErrorMatcher()}}`);
  const by = `${family.serviceLabel}, ${ENV_GROUP_LABEL}`;
  const total = `sum by (${by}) (rate(${family.calls}${matcher}[${window}]))`;
  const failed = `sum by (${by}) (rate(${family.calls}${errorMatcher}[${window}]))`;
  const queries: { qps: string; errorRate: string; p95?: string } = {
    qps: total,
    errorRate: buildPromRatio(failed, total),
  };
  if (family.durationBucket) {
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
