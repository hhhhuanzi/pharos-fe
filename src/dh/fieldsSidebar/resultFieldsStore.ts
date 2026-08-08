import { useEffect, useState } from 'react';

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
 */

type Listener = () => void;

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

function setResultFields(scopeKey: string, fields: string[] | undefined) {
  store[scopeKey] = fields;

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

/**
 * 产出侧：在拿到查询结果的组件里调用，把结果样本里出现过的字段路径发布出去。
 * `logs` 为空数组时会清空该 scope，此时侧栏退回官方的「显示字段 / 可用字段」两组行为，
 * 而不是把所有字段都判成空字段。
 */
export function useResultFieldsPublisher(params: { datasourceValue?: number | string; index?: string; logs?: unknown[]; hash?: string; rawKey?: string }) {
  const { datasourceValue, index, logs, hash, rawKey } = params;
  const scopeKey = getScopeKey({ datasourceValue, index });

  useEffect(() => {
    if (!scopeKey) return;
    if (!Array.isArray(logs) || logs.length === 0) {
      setResultFields(scopeKey, undefined);
      return;
    }
    setResultFields(scopeKey, flattenLogFields(logs, { rawKey }));
  }, [scopeKey, hash]);
}

/** 消费侧：订阅某个 scope 的结果字段集合。返回 undefined 表示「还不知道」，不等于「没有字段」 */
export function useResultFields(scope: FieldsScope): string[] | undefined {
  const scopeKey = getScopeKey(scope);
  const [fields, setFields] = useState<string[] | undefined>(() => (scopeKey ? store[scopeKey] : undefined));

  useEffect(() => {
    if (!scopeKey) {
      setFields(undefined);
      return;
    }
    setFields(store[scopeKey]);

    const listener = () => setFields(store[scopeKey]);
    if (!listeners[scopeKey]) listeners[scopeKey] = new Set();
    listeners[scopeKey].add(listener);

    return () => {
      listeners[scopeKey]?.delete(listener);
      if (listeners[scopeKey]?.size === 0) delete listeners[scopeKey];
    };
  }, [scopeKey]);

  return fields;
}
