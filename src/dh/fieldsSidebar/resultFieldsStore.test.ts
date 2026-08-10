import { Field } from '@/pages/logExplorer/types';

import { getCachedResultFields, setCachedResultFields } from './cachedResultFields';
import { RESULT_FIELDS_CACHE_KEY } from './constants';
import flattenLogFields from './flattenLogFields';
import groupFields, { hasResultInfo } from './groupFields';
import { resolveResultFields, resetResultFieldsStoreForTest, setResultFieldsMemoryForTest, shouldSkipStalePublish } from './resultFieldsStore';
import './test/localStorageMock';

const toFields = (names: readonly string[]): Field[] => names.map((field) => ({ field, indexable: true, type: 'string' }));

function scopeKeyOf(datasourceValue: string, index: string) {
  return `${datasourceValue}@${index}`;
}

describe('shouldSkipStalePublish', () => {
  it('第一次发布（没有上一次记录）不跳过', () => {
    expect(shouldSkipStalePublish({}, { scopeKey: 'ds1@index-a', hash: 'logs_1' })).toBe(false);
  });

  it('同一个 scope 重复触发（hash 也没变）不跳过——允许幂等重发', () => {
    const prev = { scopeKey: 'ds1@index-a', hash: 'logs_1' } as const;
    expect(shouldSkipStalePublish(prev, { scopeKey: 'ds1@index-a', hash: 'logs_1' })).toBe(false);
  });

  it('真的查到了新结果（hash 变了）即使 scope 也变了，照常发布', () => {
    const prev = { scopeKey: 'ds1@index-a', hash: 'logs_1' } as const;
    expect(shouldSkipStalePublish(prev, { scopeKey: 'ds1@index-b', hash: 'logs_2' })).toBe(false);
  });

  it('只是切换了 index pattern、hash 未变（没有重新查询）——必须跳过，否则会把旧 pattern 的结果写进新 scope', () => {
    const prev = { scopeKey: 'ds1@index-a', hash: 'logs_1' } as const;
    expect(shouldSkipStalePublish(prev, { scopeKey: 'ds1@index-b', hash: 'logs_1' })).toBe(true);
  });
});

describe('切换 index pattern 后「常用字段」应基于新 pattern 重算，而不是残留旧 pattern 的查询结果', () => {
  const MAPPING_A = ['@timestamp', 'message', 'service.name'] as const;
  const MAPPING_B = ['@timestamp', 'log', 'app.module'] as const;

  /** 模拟 `useResultFieldsPublisher` 里 effect 的发布逻辑，但不依赖 React：按 scope 记一份 resultFields */
  function publish(store: Record<string, string[] | undefined>, publishedRef: { current: { scopeKey?: string; hash?: string } }, next: { scopeKey: string; hash?: string; logs?: unknown[] }) {
    if (shouldSkipStalePublish(publishedRef.current, next)) return;
    publishedRef.current = { scopeKey: next.scopeKey, hash: next.hash };
    store[next.scopeKey] = Array.isArray(next.logs) && next.logs.length > 0 ? flattenLogFields(next.logs) : [];
  }

  it('复现：曾经的实现会把 pattern A 的查询结果错误发布到 pattern B，导致 B 的常用字段判断混入 A 的数据', () => {
    const store: Record<string, string[] | undefined> = {};
    const resultFieldsA: Record<string, unknown>[] = [{ message: 'hello', 'service.name': 'checkout' }];

    store['ds1@index-a'] = flattenLogFields(resultFieldsA);

    // 曾经的 bug：effect 只看 scopeKey/hash 变化就直接发布，没有校验 hash 是否真的代表新结果，
    // 等价于「不做任何跳过判断」，把 A 的 resultFields 原样写进了 B 的 scope
    const staleFields = store['ds1@index-a'];
    store['ds1@index-b'] = staleFields;

    const groupsB = groupFields({ fields: toFields(MAPPING_B), resultFields: store['ds1@index-b'] });
    // MAPPING_B 里根本没有 message/service.name，用 A 的结果判断 B 会把 B 全部字段误判成「空字段」
    expect(groupsB.empty.length).toBe(MAPPING_B.length);
  });

  it('修复后：切换 pattern 时 hash 未变（没有重新查询），发布应被跳过，B 的常用字段退回「无结果信息」的正确兜底', () => {
    const store: Record<string, string[] | undefined> = {};
    const publishedRef: { current: { scopeKey?: string; hash?: string } } = { current: {} };
    const resultFieldsA: Record<string, unknown>[] = [{ message: 'hello', 'service.name': 'checkout' }];

    // 1. 在 pattern A 下查询过一次
    publish(store, publishedRef, { scopeKey: 'ds1@index-a', hash: 'logs_1', logs: resultFieldsA });
    expect(store['ds1@index-a']).toEqual(['message', 'service.name']);

    // 2. 切换到 pattern B：mapping 已经刷新成 MAPPING_B，但没有发起新查询，
    //    所以 Raw 组件传给 publisher 的还是同一个 hash（'logs_1'），只有 scopeKey 变了
    publish(store, publishedRef, { scopeKey: 'ds1@index-b', hash: 'logs_1', logs: resultFieldsA });

    expect(store['ds1@index-b']).toBeUndefined();

    const groupsB = groupFields({ fields: toFields(MAPPING_B), resultFields: store['ds1@index-b'] });
    expect(hasResultInfo(store['ds1@index-b'])).toBe(false);
    // 退回「没有结果信息」的官方两组兜底：不产生空字段分组，可用字段等于 mapping 全量
    expect(groupsB.empty).toHaveLength(0);
    expect(groupsB.popular.concat(groupsB.available)).toHaveLength(MAPPING_B.length);

    // 3. 之后在 pattern B 下真的查询了一次，新的 hash 到来，应该正常发布 B 自己的结果
    const resultFieldsB: Record<string, unknown>[] = [{ log: 'boot', app: { module: 'gateway' } }];
    publish(store, publishedRef, { scopeKey: 'ds1@index-b', hash: 'logs_2', logs: resultFieldsB });
    expect(store['ds1@index-b']).toEqual(['app.module', 'log']);

    const groupsBAfterQuery = groupFields({ fields: toFields(MAPPING_B), resultFields: store['ds1@index-b'] });
    expect(groupsBAfterQuery.empty.map((item) => item.field)).toEqual(['@timestamp']);
  });
});

describe('resolveResultFields + localStorage 缓存', () => {
  const scopeA = { datasourceValue: 'ds1', index: 'index-a' } as const;
  const scopeB = { datasourceValue: 'ds1', index: 'index-b' } as const;
  const cacheKeyB = `${RESULT_FIELDS_CACHE_KEY}@ds1@index-b`;

  beforeEach(() => {
    resetResultFieldsStoreForTest();
    localStorage.clear();
  });

  it('内存未发布时回退读 localStorage 缓存，切换 pattern 后仍能用上次查询的 resultFields 分组', () => {
    setCachedResultFields(scopeB, ['app.module', 'log']);

    const resultFields = resolveResultFields(scopeB);
    expect(resultFields).toEqual(['app.module', 'log']);

    const groupsB = groupFields({
      fields: toFields(['@timestamp', 'log', 'app.module']),
      resultFields,
    });
    expect(hasResultInfo(resultFields)).toBe(true);
    expect(groupsB.empty.map((item) => item.field)).toEqual(['@timestamp']);
  });

  it('本次查询返回空结果时写入空数组，不回退 localStorage 缓存', () => {
    setCachedResultFields(scopeB, ['app.module', 'log']);
    setResultFieldsMemoryForTest(scopeKeyOf('ds1', 'index-b'), []);

    const resultFields = resolveResultFields(scopeB);
    expect(resultFields).toEqual([]);
    expect(hasResultInfo(resultFields)).toBe(false);
    expect(getCachedResultFields(scopeB)).toEqual(['app.module', 'log']);
  });

  it('成功查询后持久化到 localStorage，刷新页面后 resolveResultFields 仍能读到', () => {
    setCachedResultFields(scopeA, ['message', 'service.name']);
    expect(localStorage.getItem(`${RESULT_FIELDS_CACHE_KEY}@ds1@index-a`)).toContain('message');

    resetResultFieldsStoreForTest();
    expect(resolveResultFields(scopeA)).toEqual(['message', 'service.name']);
  });

  it('切换 pattern 且无内存状态时，优先用目标 pattern 自己的缓存而不是上一个 pattern 的结果', () => {
    setCachedResultFields(scopeA, ['message', 'service.name']);
    setCachedResultFields(scopeB, ['log', 'app.module']);

    expect(resolveResultFields(scopeA)).toEqual(['message', 'service.name']);
    expect(resolveResultFields(scopeB)).toEqual(['app.module', 'log']);
    expect(localStorage.getItem(cacheKeyB)).toContain('app.module');
  });
});
