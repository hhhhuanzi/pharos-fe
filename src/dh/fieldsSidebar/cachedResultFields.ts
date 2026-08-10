import { FieldsScope } from './popularFields';
import { RESULT_FIELDS_CACHE_KEY, RESULT_FIELDS_MAX_CACHED } from './constants';

function getCacheKey(scope: FieldsScope): string | undefined {
  if (scope.datasourceValue == null || !scope.index) return undefined;
  return `${RESULT_FIELDS_CACHE_KEY}@${scope.datasourceValue}@${scope.index}`;
}

function normalizeFieldList(fields: string[]): string[] {
  const unique = Array.from(new Set(fields.filter((field) => typeof field === 'string' && field.length > 0)));
  unique.sort((a, b) => a.localeCompare(b));
  return unique.slice(0, RESULT_FIELDS_MAX_CACHED);
}

/** 读取某个 scope 上次成功查询后持久化的结果字段路径；无缓存时返回 undefined */
export function getCachedResultFields(scope: FieldsScope): string[] | undefined {
  const cacheKey = getCacheKey(scope);
  if (!cacheKey) return undefined;

  try {
    const str = localStorage.getItem(cacheKey);
    if (!str) return undefined;
    const parsed: unknown = JSON.parse(str);
    if (!Array.isArray(parsed)) return undefined;

    const fields = parsed.filter((item): item is string => typeof item === 'string' && item.length > 0);
    return fields.length > 0 ? fields : undefined;
  } catch (e) {
    return undefined;
  }
}

/** 查询成功后写入 localStorage；空数组会清除该 scope 的缓存 */
export function setCachedResultFields(scope: FieldsScope, fields: string[]): void {
  const cacheKey = getCacheKey(scope);
  if (!cacheKey) return;

  const normalized = normalizeFieldList(fields);
  try {
    if (normalized.length === 0) {
      localStorage.removeItem(cacheKey);
      return;
    }
    localStorage.setItem(cacheKey, JSON.stringify(normalized));
  } catch (e) {
    // localStorage 写失败（隐私模式 / 配额满）时不影响主流程
  }
}
