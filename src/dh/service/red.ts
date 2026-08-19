import { SERVICE_GRAPH_METRICS, toPromRange, type PromVectorSample } from '@/dh/trace/dependencies/promql';

import { CLUSTER_LABEL_KEYS, LANGUAGE_LABEL_KEYS, NAMESPACE_LABEL_KEYS } from './constants';

export { toPromRange };

export interface ServiceRed {
  requestCount: number;
  failedCount: number;
  /** 0–1; 0 when requestCount is 0. */
  errorRate: number;
  /** Incoming (server-side) P95 in seconds. */
  p95Seconds?: number;
  /** Incoming (server-side) P99 in seconds. */
  p99Seconds?: number;
  rangeSeconds: number;
}

export interface ServiceAssociation {
  clusters: string[];
  namespaces: string[];
}

export interface ServiceOverviewResult {
  red?: ServiceRed;
  association: ServiceAssociation;
  /** True when Prometheus returned no service_graph series for this service. */
  empty: boolean;
}

export const SERVICE_NAME_LABEL_KEYS = ['service_name', 'service', 'server'] as const;

export function pickServiceName(metric: Record<string, string> | undefined): string {
  if (!metric) return '';
  for (const key of SERVICE_NAME_LABEL_KEYS) {
    const value = metric[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export function escapePromLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function buildServiceRedQueries(service: string, range: string) {
  const matcher = `{server="${escapePromLabel(service)}"}`;
  return {
    total: `increase(${SERVICE_GRAPH_METRICS.total}${matcher}[${range}])`,
    failed: `increase(${SERVICE_GRAPH_METRICS.failed}${matcher}[${range}])`,
    p95: `histogram_quantile(0.95, sum by (le) (rate(${SERVICE_GRAPH_METRICS.serverBucket}${matcher}[${range}])))`,
    p99: `histogram_quantile(0.99, sum by (le) (rate(${SERVICE_GRAPH_METRICS.serverBucket}${matcher}[${range}])))`,
  };
}

/** Fleet-wide instant vectors. Keep raw labels so language / cluster can be read in JS. */
export function buildCatalogRedQueries(range: string) {
  return {
    total: `increase(${SERVICE_GRAPH_METRICS.total}[${range}])`,
    failed: `increase(${SERVICE_GRAPH_METRICS.failed}[${range}])`,
    p95: `histogram_quantile(0.95, sum by (server, le) (rate(${SERVICE_GRAPH_METRICS.serverBucket}[${range}])))`,
    p99: `histogram_quantile(0.99, sum by (server, le) (rate(${SERVICE_GRAPH_METRICS.serverBucket}[${range}])))`,
  };
}

export function escapePromRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildServerRegexMatcher(services: string[], label = 'server'): string {
  const regex = services.map(escapePromRegex).join('|');
  return `{${label}=~"${escapePromLabel(regex)}"}`;
}

function sampleValue(sample: PromVectorSample): number {
  const n = Number(sample.value?.[1]);
  return Number.isFinite(n) ? n : NaN;
}

export function sampleValueSafe(sample: PromVectorSample): number {
  return sampleValue(sample);
}

export function sumSampleValues(samples: PromVectorSample[]): number {
  return samples.reduce((acc, sample) => {
    const n = sampleValue(sample);
    return Number.isFinite(n) ? acc + n : acc;
  }, 0);
}

export function firstFiniteSample(samples: PromVectorSample[]): number | undefined {
  for (const sample of samples) {
    const n = sampleValue(sample);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function pickLabel(metric: Record<string, string>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = metric[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

/** Pull cluster / namespace from whatever labels actually exist on the series. No CMDB. */
export function extractAssociation(samples: PromVectorSample[]): ServiceAssociation {
  const clusters: string[] = [];
  const namespaces: string[] = [];
  samples.forEach((sample) => {
    const cluster = pickLabel(sample.metric || {}, CLUSTER_LABEL_KEYS);
    const namespace = pickLabel(sample.metric || {}, NAMESPACE_LABEL_KEYS);
    if (cluster) clusters.push(cluster);
    if (namespace) namespaces.push(namespace);
  });
  return {
    clusters: uniqueSorted(clusters),
    namespaces: uniqueSorted(namespaces),
  };
}

/** telemetry.sdk.language / process tags when Prom already has them. Never invent a value. */
export function extractLanguages(samples: PromVectorSample[]): string[] {
  const langs: string[] = [];
  samples.forEach((sample) => {
    const lang = pickLabel(sample.metric || {}, LANGUAGE_LABEL_KEYS);
    if (lang) langs.push(lang);
  });
  return uniqueSorted(langs);
}

export function formatLanguage(langs: string[]): string | undefined {
  return langs.length ? langs.join(', ') : undefined;
}

export function mergeServiceRed(input: {
  total: PromVectorSample[];
  failed: PromVectorSample[];
  p95: PromVectorSample[];
  p99?: PromVectorSample[];
  rangeSeconds: number;
}): ServiceOverviewResult {
  const hasSeries = input.total.length > 0 || input.failed.length > 0 || input.p95.length > 0 || (input.p99?.length ?? 0) > 0;
  const association = extractAssociation([...input.total, ...input.failed]);
  if (!hasSeries) {
    return { association, empty: true };
  }

  const requestCount = sumSampleValues(input.total);
  const failedCount = sumSampleValues(input.failed);
  const p95Seconds = firstFiniteSample(input.p95);
  const p99Seconds = input.p99 ? firstFiniteSample(input.p99) : undefined;
  const red: ServiceRed = {
    requestCount,
    failedCount,
    errorRate: requestCount > 0 ? Math.min(1, failedCount / requestCount) : 0,
    rangeSeconds: Math.max(1, input.rangeSeconds),
  };
  if (p95Seconds != null) red.p95Seconds = p95Seconds;
  if (p99Seconds != null) red.p99Seconds = p99Seconds;

  return { red, association, empty: false };
}
