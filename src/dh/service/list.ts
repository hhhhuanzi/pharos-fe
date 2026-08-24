import type { PromVectorSample } from '@/dh/trace/dependencies/promql';

import {
  extractAssociation,
  extractLanguages,
  formatLanguage,
  pickServiceEnv,
  pickServiceName,
  sampleValueSafe,
  serviceKey,
  type ServiceAssociation,
} from './red';

export interface ServiceRow {
  name: string;
  /** spanmetrics `deployment_environment_name`; undefined when the series carries no such label. */
  env?: string;
  language?: string;
  requestCount?: number;
  failedCount?: number;
  errorRate?: number;
  p95Seconds?: number;
  p99Seconds?: number;
  qps?: number;
  association: ServiceAssociation;
  hasRed: boolean;
}

export type TopMetric = 'requestCount' | 'errorRate' | 'p95Seconds';

/** A row's identity: PromQL matchers need the raw name, charts and tables need the key. */
export interface ServiceRef {
  name: string;
  env?: string;
  key: string;
}

export function serviceRefOf(row: Pick<ServiceRow, 'name' | 'env'>): ServiceRef {
  const ref: ServiceRef = { name: row.name, key: serviceKey(row.name, row.env) };
  if (row.env) ref.env = row.env;
  return ref;
}

interface MutableRow extends ServiceRow {
  requestCount: number;
  failedCount: number;
}

function emptyRow(name: string, env?: string): MutableRow {
  const row: MutableRow = {
    name,
    requestCount: 0,
    failedCount: 0,
    association: { clusters: [], namespaces: [] },
    hasRed: false,
  };
  if (env) row.env = env;
  return row;
}

function ensureRow(byKey: Map<string, MutableRow>, name: string, env?: string): MutableRow | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const key = serviceKey(trimmed, env);
  let row = byKey.get(key);
  if (!row) {
    row = emptyRow(trimmed, env);
    byKey.set(key, row);
  }
  return row;
}

/** Group Prom samples by service + environment and sum RED. Language / cluster stay on the row when labels exist. */
export function aggregateServiceRows(input: {
  total: PromVectorSample[];
  failed: PromVectorSample[];
  p95: PromVectorSample[];
  p99: PromVectorSample[];
  rangeSeconds: number;
}): ServiceRow[] {
  const byKey = new Map<string, MutableRow>();
  const rangeSeconds = Math.max(1, input.rangeSeconds);

  const addCount = (samples: PromVectorSample[], field: 'requestCount' | 'failedCount') => {
    samples.forEach((sample) => {
      const row = ensureRow(byKey, pickServiceName(sample.metric), pickServiceEnv(sample.metric));
      if (!row) return;
      const n = sampleValueSafe(sample);
      if (Number.isFinite(n)) {
        row[field] += n;
        row.hasRed = true;
      }
    });
  };

  addCount(input.total, 'requestCount');
  addCount(input.failed, 'failedCount');

  input.p95.forEach((sample) => {
    const row = ensureRow(byKey, pickServiceName(sample.metric), pickServiceEnv(sample.metric));
    if (!row) return;
    const n = sampleValueSafe(sample);
    if (Number.isFinite(n)) {
      row.p95Seconds = n;
      row.hasRed = true;
    }
  });
  input.p99.forEach((sample) => {
    const row = ensureRow(byKey, pickServiceName(sample.metric), pickServiceEnv(sample.metric));
    if (!row) return;
    const n = sampleValueSafe(sample);
    if (Number.isFinite(n)) {
      row.p99Seconds = n;
      row.hasRed = true;
    }
  });

  const labeled = [...input.total, ...input.failed];
  const samplesByKey = new Map<string, PromVectorSample[]>();
  labeled.forEach((sample) => {
    const name = pickServiceName(sample.metric);
    if (!name) return;
    const key = serviceKey(name.trim(), pickServiceEnv(sample.metric));
    const list = samplesByKey.get(key) || [];
    list.push(sample);
    samplesByKey.set(key, list);
  });

  return Array.from(byKey.values()).map((row) => {
    const samples = samplesByKey.get(serviceKey(row.name, row.env)) || [];
    const association = extractAssociation(samples);
    const language = formatLanguage(extractLanguages(samples));
    const next: ServiceRow = {
      name: row.name,
      association,
      hasRed: row.hasRed,
    };
    if (row.env) next.env = row.env;
    if (language) next.language = language;
    if (row.hasRed) {
      next.requestCount = row.requestCount;
      next.failedCount = row.failedCount;
      next.errorRate = row.requestCount > 0 ? Math.min(1, row.failedCount / row.requestCount) : 0;
      next.qps = row.requestCount / rangeSeconds;
    }
    if (row.p95Seconds != null) next.p95Seconds = row.p95Seconds;
    if (row.p99Seconds != null) next.p99Seconds = row.p99Seconds;
    return next;
  });
}

export function applyLanguageMap(rows: ServiceRow[], langByService: Record<string, string>): ServiceRow[] {
  return rows.map((row) => {
    if (row.language || !langByService[row.name]) return row;
    return { ...row, language: langByService[row.name] };
  });
}

export function languageMapFromSamples(samples: PromVectorSample[], nameKeys: readonly string[] = ['server', 'service_name', 'service']): Record<string, string> {
  const map: Record<string, string> = {};
  samples.forEach((sample) => {
    const metric = sample.metric || {};
    const langs = extractLanguages([sample]);
    if (!langs.length) return;
    nameKeys.forEach((key) => {
      const name = metric[key]?.trim();
      if (name && !map[name]) map[name] = langs[0];
    });
  });
  return map;
}

/**
 * Jaeger `/api/v3/services` ∪ Prom rows. Jaeger returns bare names with no environment, so a
 * service that already has RED in any environment must not gain a second env-less row.
 */
export function mergeServiceCatalog(jaegerNames: string[], promRows: ServiceRow[]): ServiceRow[] {
  const byKey = new Map<string, ServiceRow>();
  const promNames = new Set<string>();
  promRows.forEach((row) => {
    if (!row.name) return;
    byKey.set(serviceKey(row.name, row.env), row);
    promNames.add(row.name);
  });
  jaegerNames.forEach((raw) => {
    const name = raw.trim();
    if (!name || promNames.has(name)) return;
    byKey.set(name, {
      name,
      association: { clusters: [], namespaces: [] },
      hasRed: false,
    });
  });
  return Array.from(byKey.values()).sort((a, b) => {
    if (a.hasRed !== b.hasRed) return a.hasRed ? -1 : 1;
    const aCount = a.requestCount ?? -1;
    const bCount = b.requestCount ?? -1;
    if (aCount !== bCount) return bCount - aCount;
    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) return byName;
    return (a.env ?? '').localeCompare(b.env ?? '');
  });
}

export function filterRowsByServiceName(rows: ServiceRow[], query: string): ServiceRow[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) => row.name.toLowerCase().includes(needle));
}

export function pickTopServices(rows: ServiceRow[], n: number, metric: TopMetric): ServiceRef[] {
  const limit = Math.max(0, Math.floor(n));
  const scored = rows
    .filter((row) => {
      if (!row.hasRed) return false;
      const value = row[metric];
      if (typeof value !== 'number' || !Number.isFinite(value)) return false;
      if (metric === 'errorRate') return (row.requestCount ?? 0) > 0 || (row.failedCount ?? 0) > 0;
      return true;
    })
    .sort((a, b) => {
      const diff = (b[metric] as number) - (a[metric] as number);
      if (diff !== 0) return diff;
      const byName = a.name.localeCompare(b.name);
      if (byName !== 0) return byName;
      return (a.env ?? '').localeCompare(b.env ?? '');
    });
  return scored.slice(0, limit).map(serviceRefOf);
}

/** Charts keep one line per row, but the PromQL matcher only takes service names. */
export function uniqueRefNames(refs: ServiceRef[]): string[] {
  return Array.from(new Set(refs.map((ref) => ref.name).filter(Boolean)));
}

export function dedupeRefs(...groups: ServiceRef[][]): ServiceRef[] {
  const byKey = new Map<string, ServiceRef>();
  groups.forEach((group) => {
    group.forEach((ref) => {
      if (!byKey.has(ref.key)) byKey.set(ref.key, ref);
    });
  });
  return Array.from(byKey.values());
}
