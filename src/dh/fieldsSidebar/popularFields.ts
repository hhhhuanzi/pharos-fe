import { POPULAR_FIELDS_CACHE_KEY, POPULAR_FIELDS_MAX_STORED } from './constants';

export interface FieldsScope {
  datasourceValue?: number | string;
  index?: string;
}

export type PopularCounts = Record<string, number>;

function getCacheKey(scope: FieldsScope): string | undefined {
  if (scope.datasourceValue == null || !scope.index) return undefined;
  return `${POPULAR_FIELDS_CACHE_KEY}@${scope.datasourceValue}@${scope.index}`;
}

/** 读取当前 scope 下用户把哪些字段加入过「显示字段」，以及各加了几次 */
export function getPopularFields(scope: FieldsScope): PopularCounts {
  const cacheKey = getCacheKey(scope);
  if (!cacheKey) return {};

  try {
    const str = localStorage.getItem(cacheKey);
    if (!str) return {};
    const parsed: unknown = JSON.parse(str);
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const counts: PopularCounts = {};
    Object.entries(parsed as Record<string, unknown>).forEach(([field, count]) => {
      if (typeof count === 'number' && count > 0 && Number.isFinite(count)) {
        counts[field] = count;
      }
    });
    return counts;
  } catch (e) {
    return {};
  }
}

/** 用户把某个字段加入「显示字段」时 +1；只保留频次最高的若干个，避免 localStorage 无限膨胀 */
export function increasePopularField(scope: FieldsScope, field: string): PopularCounts {
  const cacheKey = getCacheKey(scope);
  const counts = getPopularFields(scope);
  if (!cacheKey || !field) return counts;

  const nextCounts: PopularCounts = { ...counts, [field]: (counts[field] ?? 0) + 1 };
  const entries = Object.entries(nextCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const pruned: PopularCounts = {};
  entries.slice(0, POPULAR_FIELDS_MAX_STORED).forEach(([key, count]) => {
    pruned[key] = count;
  });

  try {
    localStorage.setItem(cacheKey, JSON.stringify(pruned));
  } catch (e) {
    // localStorage 写失败（隐私模式 / 配额满）时不影响主流程
  }
  return pruned;
}
