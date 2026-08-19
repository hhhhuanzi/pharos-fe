import type { PromVectorSample } from '@/dh/trace/dependencies/promql';

import { extractAssociation, extractLanguages, formatLanguage, pickServiceName, sampleValueSafe, type ServiceAssociation } from './red';

export interface ServiceRow {
  name: string;
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

interface MutableRow extends ServiceRow {
  requestCount: number;
  failedCount: number;
}

function emptyRow(name: string): MutableRow {
  return {
    name,
    requestCount: 0,
    failedCount: 0,
    association: { clusters: [], namespaces: [] },
    hasRed: false,
  };
}

function ensureRow(byName: Map<string, MutableRow>, name: string): MutableRow | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  let row = byName.get(trimmed);
  if (!row) {
    row = emptyRow(trimmed);
    byName.set(trimmed, row);
  }
  return row;
}

/** Group Prom samples by `server` and sum RED. Language / cluster stay on the row when labels exist. */
export function aggregateServiceRows(input: {
  total: PromVectorSample[];
  failed: PromVectorSample[];
  p95: PromVectorSample[];
  p99: PromVectorSample[];
  rangeSeconds: number;
}): ServiceRow[] {
  const byName = new Map<string, MutableRow>();
  const rangeSeconds = Math.max(1, input.rangeSeconds);

  const addCount = (samples: PromVectorSample[], field: 'requestCount' | 'failedCount') => {
    samples.forEach((sample) => {
      const name = pickServiceName(sample.metric);
      const row = ensureRow(byName, name);
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
    const row = ensureRow(byName, pickServiceName(sample.metric));
    if (!row) return;
    const n = sampleValueSafe(sample);
    if (Number.isFinite(n)) {
      row.p95Seconds = n;
      row.hasRed = true;
    }
  });
  input.p99.forEach((sample) => {
    const row = ensureRow(byName, pickServiceName(sample.metric));
    if (!row) return;
    const n = sampleValueSafe(sample);
    if (Number.isFinite(n)) {
      row.p99Seconds = n;
      row.hasRed = true;
    }
  });

  const labeled = [...input.total, ...input.failed];
  const byServerSamples = new Map<string, PromVectorSample[]>();
  labeled.forEach((sample) => {
    const name = pickServiceName(sample.metric);
    if (!name) return;
    const list = byServerSamples.get(name) || [];
    list.push(sample);
    byServerSamples.set(name, list);
  });

  return Array.from(byName.values()).map((row) => {
    const samples = byServerSamples.get(row.name) || [];
    const association = extractAssociation(samples);
    const language = formatLanguage(extractLanguages(samples));
    const next: ServiceRow = {
      name: row.name,
      association,
      hasRed: row.hasRed,
    };
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

/** Jaeger `/api/v3/services` ∪ Prom `server` labels. No RED → metrics stay undefined. */
export function mergeServiceCatalog(jaegerNames: string[], promRows: ServiceRow[]): ServiceRow[] {
  const byName = new Map<string, ServiceRow>();
  promRows.forEach((row) => {
    if (row.name) byName.set(row.name, row);
  });
  jaegerNames.forEach((raw) => {
    const name = raw.trim();
    if (!name || byName.has(name)) return;
    byName.set(name, {
      name,
      association: { clusters: [], namespaces: [] },
      hasRed: false,
    });
  });
  return Array.from(byName.values()).sort((a, b) => {
    if (a.hasRed !== b.hasRed) return a.hasRed ? -1 : 1;
    const aCount = a.requestCount ?? -1;
    const bCount = b.requestCount ?? -1;
    if (aCount !== bCount) return bCount - aCount;
    return a.name.localeCompare(b.name);
  });
}

export function filterRowsByServiceName(rows: ServiceRow[], query: string): ServiceRow[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) => row.name.toLowerCase().includes(needle));
}

export function pickTopServices(rows: ServiceRow[], n: number, metric: TopMetric): string[] {
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
      return a.name.localeCompare(b.name);
    });
  return scored.slice(0, limit).map((row) => row.name);
}
