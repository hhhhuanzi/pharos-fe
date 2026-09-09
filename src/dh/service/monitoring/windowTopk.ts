import { escapePromLabel, escapePromRegex } from '../red';

import type { MonitoringInstantQuery, MonitoringQueryResult, MonitoringRangeQuery, MonitoringSeries } from './query';
import type { MonitoringScope } from './selectors';

export interface MonitoringWindowTopk {
  k: number;
  /** Single label that identifies a series (e.g. `span_name`). */
  by: string;
  /** Instant ranking at range end — typically `topk(k, sum by (by) (increase(...[rangeWindow])))`. */
  rank: (scope: MonitoringScope, rateWindow: string, rangeWindow: string) => string;
}

export interface WindowTopkQuery {
  batchRefId: string;
  query: string;
  instant?: boolean;
  windowTopk?: MonitoringWindowTopk;
  windowTopkQuery?: string;
}

export const WINDOW_TOPK_REF_SUFFIX = '__window_topk';

export function windowTopkRefId(batchRefId: string): string {
  return `${batchRefId}${WINDOW_TOPK_REF_SUFFIX}`;
}

export function isWindowTopkRefId(refId: string): boolean {
  return refId.endsWith(WINDOW_TOPK_REF_SUFFIX);
}

/** Instant ranking queries, not plotted — they only pin the range query's label set. */
export function windowTopkInstantQueries(queries: WindowTopkQuery[]): MonitoringInstantQuery[] {
  return queries.filter((item) => item.windowTopkQuery).map((item) => ({ refId: windowTopkRefId(item.batchRefId), query: item.windowTopkQuery as string }));
}

export function collectWindowTopkNames(series: MonitoringSeries[], label: string, k: number): string[] {
  return series
    .map((item) => ({
      name: item.metric[label] ?? '',
      value: item.points[0]?.[1] ?? Number.NEGATIVE_INFINITY,
    }))
    .filter((item) => item.name !== '')
    .sort((a, b) => b.value - a.value)
    .slice(0, k)
    .map((item) => item.name);
}

/**
 * Inject `label=~"a|b|..."` into the first PromQL selector. An empty name list becomes `^$` so
 * the range query cannot fall back to every series (which would grow the legend again).
 */
export function injectLabelRegex(query: string, label: string, values: string[]): string {
  const regex = values.length === 0 ? '^$' : values.map(escapePromRegex).join('|');
  return injectFirstSelectorMatcher(query, `${label}=~"${escapePromLabel(regex)}"`);
}

export function injectFirstSelectorMatcher(query: string, matcher: string): string {
  const start = query.indexOf('{');
  if (start === -1) return query;
  const end = query.indexOf('}', start);
  if (end === -1) return query;
  const inside = query.slice(start + 1, end).trim();
  const next = inside.length === 0 ? matcher : `${inside},${matcher}`;
  return `${query.slice(0, start + 1)}${next}${query.slice(end)}`;
}

export function applyWindowTopkToRangeQueries(queries: WindowTopkQuery[], rankResults: MonitoringQueryResult[]): MonitoringRangeQuery[] {
  const ranks = new Map(rankResults.map((item) => [item.refId, item.series]));
  return queries
    .filter((item) => !item.instant)
    .map((item) => {
      const spec = item.windowTopk;
      if (!spec || !item.windowTopkQuery) return { refId: item.batchRefId, query: item.query };
      const names = collectWindowTopkNames(ranks.get(windowTopkRefId(item.batchRefId)) || [], spec.by, spec.k);
      return { refId: item.batchRefId, query: injectLabelRegex(item.query, spec.by, names) };
    });
}
