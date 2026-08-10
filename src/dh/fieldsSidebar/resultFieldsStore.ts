import { useEffect, useRef, useState } from 'react';

import { getCachedResultFields, setCachedResultFields } from './cachedResultFields';
import { RESULT_FIELDS_MAX_SCOPES } from './constants';
import flattenLogFields from './flattenLogFields';
import { FieldsScope } from './popularFields';

/**
 * 「当前查询结果里出现过的字段」的极简模块级 store。
 *
 * 为什么不走 props：产出方是 `ExplorerNG/Main/Raw`，消费方是 `ExplorerNG/SideBarNav/FieldsSidebar`，
 * 两者最近的公共祖先是 `ExplorerNG/index.tsx`，逐层透传要改 4 个官方文件、十几行。
 * 用 scope（datasourceValue + index）作为 key 的模块 store，官方文件只需各加一行挂载点。
 *
 * 同一 datasourceValue + index 在多个 tab 里打开时会共享一份结果字段集合。
 * 这是有意的取舍：两个 tab 查的是同一个索引，字段集合高度重合，最差情况只是
 * 「空字段」分组按另一个 tab 的结果划分，不影响任何字段的可见性（搜索时会自动展开）。
 *
 * 内存 store 与 localStorage 的分工：
 * - 内存里**没有**该 scope 的 key：视为「尚未在本会话发布过」，消费侧回退读 localStorage 缓存
 *   （上次成功查询持久化的 resultFields），避免切换 index pattern 后退回 mapping 全量兜底。
 * - 内存里 key 存在且值为 `[]`：本次查询明确返回空结果，不回退缓存。
 * - 内存里 key 存在且为非空数组：本次查询的最新结果，优先于 localStorage。
 */

type Listener = () => void;

/** undefined = key 不存在（可读 localStorage）；[] = 空结果；string[] = 有结果 */
const store: Record<string, string[] | undefined> = {};
const listeners: Record<string, Set<Listener>> = {};
const scopeWriteOrder: string[] = [];

export function getScopeKey(scope: FieldsScope): string | undefined {
  if (scope.datasourceValue == null || !scope.index) return undefined;
  return `${scope.datasourceValue}@${scope.index}`;
}

function emit(scopeKey: string) {
  listeners[scopeKey]?.forEach((listener) => listener());
}

function hasMemoryEntry(scopeKey: string): boolean {
  return Object.prototype.hasOwnProperty.call(store, scopeKey);
}

/**
 * 解析某个 scope 当前应使用的 resultFields。
 * 供 store 消费侧与单测使用：内存未发布时回退 localStorage 缓存。
 */
export function resolveResultFields(scope: FieldsScope): string[] | undefined {
  const scopeKey = getScopeKey(scope);
  if (!scopeKey) return undefined;

  if (hasMemoryEntry(scopeKey)) {
    return store[scopeKey];
  }
  return getCachedResultFields(scope);
}

function setResultFields(scopeKey: string, fields: string[] | undefined, scope?: FieldsScope) {
  store[scopeKey] = fields;

  if (scope && Array.isArray(fields) && fields.length > 0) {
    setCachedResultFields(scope, fields);
  }

  const existedIndex = scopeWriteOrder.indexOf(scopeKey);
  if (existedIndex !== -1) scopeWriteOrder.splice(existedIndex, 1);
  scopeWriteOrder.push(scopeKey);
  // 超出上限时按写入顺序淘汰，但仍有组件在订阅的 scope 不能淘汰，否则侧栏会突然丢掉分组
  for (let i = 0; scopeWriteOrder.length > RESULT_FIELDS_MAX_SCOPES && i < scopeWriteOrder.length; ) {
    const staleKey = scopeWriteOrder[i];
    if (listeners[staleKey]?.size) {
      i += 1;
    } else {
      scopeWriteOrder.splice(i, 1);
      delete store[staleKey];
    }
  }

  emit(scopeKey);
}

/** 切换 scope 且尚未在本会话发布过：把 localStorage 缓存灌进内存，避免侧栏反复读 storage */
function hydrateResultFieldsFromCache(scopeKey: string, scope: FieldsScope) {
  if (hasMemoryEntry(scopeKey)) return;

  const cached = getCachedResultFields(scope);
  if (!cached?.length) return;

  store[scopeKey] = cached;
  emit(scopeKey);
}

interface PublishedState {
  hash?: string;
  scopeKey?: string;
}

/**
 * 判断这次触发 effect 是不是「index/datasource 切换了，但查询结果还是上一次的」。
 *
 * 产出方（`ExplorerNG/Main/Raw`）把当前表单里的 `index` 和上一次查询的 `logs`/`hash` 一起
 * 传给 publisher；切换 index pattern 不会自动重新查询（有意保留的设计），所以 `scopeKey`
 * 会先于 `hash` 变化——如果照常发布，就会把上一个 scope 的查询结果写进新 scope，新 index
 * 的「常用字段」会显示成上一个 index 查出来的样子，必须手动查询一次才会纠正过来。
 * `prev.scopeKey === undefined` 表示这是第一次发布（或没有上一次记录），不算「hash 没变」。
 */
export function shouldSkipStalePublish(prev: PublishedState, next: { scopeKey: string; hash?: string }): boolean {
  if (prev.scopeKey === undefined) return false;
  return prev.hash === next.hash && prev.scopeKey !== next.scopeKey;
}

/**
 * 产出侧：在拿到查询结果的组件里调用，把结果样本里出现过的字段路径发布出去。
 * `logs` 为空数组时会写入空数组（明确「本次无结果」），此时侧栏退回官方的「显示字段 / 可用字段」
 * 两组行为，且不会回退 localStorage 里上一次成功查询的缓存。
 */
export function useResultFieldsPublisher(params: { datasourceValue?: number | string; index?: string; logs?: unknown[]; hash?: string; rawKey?: string }) {
  const { datasourceValue, index, logs, hash, rawKey } = params;
  const scope: FieldsScope = { datasourceValue, index };
  const scopeKey = getScopeKey(scope);
  const publishedRef = useRef<PublishedState>({});

  useEffect(() => {
    if (!scopeKey) return;
    if (shouldSkipStalePublish(publishedRef.current, { scopeKey, hash })) {
      hydrateResultFieldsFromCache(scopeKey, scope);
      return;
    }
    publishedRef.current = { hash, scopeKey };

    if (!Array.isArray(logs) || logs.length === 0) {
      setResultFields(scopeKey, [], scope);
      return;
    }
    setResultFields(scopeKey, flattenLogFields(logs, { rawKey }), scope);
  }, [scopeKey, hash]);
}

/** 消费侧：订阅某个 scope 的结果字段集合。返回 undefined 表示「还不知道」，不等于「没有字段」 */
export function useResultFields(scope: FieldsScope): string[] | undefined {
  const scopeKey = getScopeKey(scope);
  const [fields, setFields] = useState<string[] | undefined>(() => resolveResultFields(scope));

  useEffect(() => {
    if (!scopeKey) {
      setFields(undefined);
      return;
    }
    setFields(resolveResultFields(scope));

    const listener = () => setFields(resolveResultFields(scope));
    if (!listeners[scopeKey]) listeners[scopeKey] = new Set();
    listeners[scopeKey].add(listener);

    return () => {
      listeners[scopeKey]?.delete(listener);
      if (listeners[scopeKey]?.size === 0) delete listeners[scopeKey];
    };
  }, [scopeKey]);

  return fields;
}

/** @internal 单测用：重置模块级 store */
export function resetResultFieldsStoreForTest() {
  Object.keys(store).forEach((key) => delete store[key]);
  Object.keys(listeners).forEach((key) => delete listeners[key]);
  scopeWriteOrder.length = 0;
}

/** @internal 单测用：直接写入内存 store（不触发 localStorage） */
export function setResultFieldsMemoryForTest(scopeKey: string, fields: string[] | undefined) {
  store[scopeKey] = fields;
}
