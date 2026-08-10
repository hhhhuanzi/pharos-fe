import { RESULT_FIELDS_CACHE_KEY, RESULT_FIELDS_MAX_CACHED } from './constants';
import { getCachedResultFields, setCachedResultFields } from './cachedResultFields';
import './test/localStorageMock';

describe('cachedResultFields', () => {
  const scope = { datasourceValue: 42, index: 'logs-*' } as const;
  const cacheKey = `${RESULT_FIELDS_CACHE_KEY}@42@logs-*`;

  beforeEach(() => {
    localStorage.clear();
  });

  it('读写按 datasourceValue@index 隔离', () => {
    setCachedResultFields(scope, ['message', 'log']);
    setCachedResultFields({ datasourceValue: 42, index: 'other-*' }, ['trace_id']);

    expect(getCachedResultFields(scope)).toEqual(['log', 'message']);
    expect(getCachedResultFields({ datasourceValue: 42, index: 'other-*' })).toEqual(['trace_id']);
    expect(localStorage.getItem(cacheKey)).toBeTruthy();
  });

  it('去重、排序并截断到上限', () => {
    const fields = Array.from({ length: RESULT_FIELDS_MAX_CACHED + 5 }, (_, i) => `field_${String(i).padStart(3, '0')}`);
    setCachedResultFields(scope, ['z_field', 'a_field', 'a_field', ...fields]);

    const cached = getCachedResultFields(scope);
    expect(cached).toHaveLength(RESULT_FIELDS_MAX_CACHED);
    expect(cached?.[0]).toBe('a_field');
    expect(cached?.includes('field_000')).toBe(true);
  });

  it('空数组会清除缓存', () => {
    setCachedResultFields(scope, ['message']);
    setCachedResultFields(scope, []);

    expect(getCachedResultFields(scope)).toBeUndefined();
    expect(localStorage.getItem(cacheKey)).toBeNull();
  });
});
