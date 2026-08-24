import { toScopeSlug } from '@/dh/logPerm/indexPatternScope';

function trimText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** `{namespace}-{env}*`；ns / env 缺任一端都不猜。env 原样保留大小写。 */
export function buildServiceLogIndexPatternName(namespace?: string, env?: string): string | undefined {
  const ns = trimText(namespace);
  const environment = trimText(env);
  if (!ns || !environment) return undefined;
  return `${ns}-${environment}*`;
}

export function uniqueNamespaces(namespaces: string[] | undefined): string[] {
  if (!Array.isArray(namespaces)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of namespaces) {
    const value = trimText(item);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

/** URL 上的 namespace 优先；否则仅在 association 恰好一个时采用，多个不猜。 */
export function pickNamespace(urlNamespace?: string, associationNamespaces?: string[]): string | undefined {
  const fromUrl = trimText(urlNamespace);
  if (fromUrl) return fromUrl;
  const unique = uniqueNamespaces(associationNamespaces);
  return unique.length === 1 ? unique[0] : undefined;
}

export function hasAmbiguousNamespaces(urlNamespace?: string, associationNamespaces?: string[]): boolean {
  if (trimText(urlNamespace)) return false;
  return uniqueNamespaces(associationNamespaces).length > 1;
}

export interface IndexPatternCandidate {
  id?: number;
  name?: string;
  datasource_id?: number;
  time_field?: string;
  allow_hide_system_indices?: boolean;
  hide_system_indices?: boolean;
  cross_cluster_enabled?: boolean | number;
}

/** name 精确优先，否则 `toScopeSlug` 相等（`turms-test*` ↔ `turms-test`）。不用前缀覆盖，避免误选 `turms*`。 */
export function matchIndexPattern<T extends IndexPatternCandidate>(list: T[], indexPatternName: string): T | undefined {
  if (!Array.isArray(list) || !indexPatternName) return undefined;
  const exact = list.find((item) => item.name === indexPatternName);
  if (exact) return exact;
  const targetSlug = toScopeSlug(indexPatternName);
  if (!targetSlug) return undefined;
  return list.find((item) => toScopeSlug(item.name ?? '') === targetSlug);
}
