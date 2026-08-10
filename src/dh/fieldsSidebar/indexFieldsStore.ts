import { useEffect, useState } from 'react';

import { RESULT_FIELDS_MAX_SCOPES } from './constants';
import { FieldsScope } from './popularFields';
import { getScopeKey } from './resultFieldsStore';

/**
 * 「当前索引 mapping 里有哪些字段」的模块级单例 store，与 `resultFieldsStore.ts`
 * 是同一套「按 scope 发布/订阅」模式，但发布的是完全不同的另一份数据。
 *
 * 为什么需要它：字段侧栏（`FieldsList`）与导出弹窗（`LogExportModal`）曾经各自发一次
 * `_mapping` 请求、各自用一个解析函数（`getFullFields()`+`mappingsToFullFields()` /
 * `getFields()`+`mappingsToFields()`）算出字段列表——两条独立链路，只要两个函数的
 * 兼容范围、请求参数（`allowHideSystemIndices`/`crossClusterEnabled` 等）有任何一处
 * 不同，两边就可能算出不一样的字段集合，本身处于「结构上就可能不一致」的状态，出过
 * 至少两轮排查都没能在没有真实 ES 响应的情况下把两条链路的差异点完全钉死。
 *
 * 现在改成侧栏算出字段列表后直接发布，导出弹窗优先订阅这一份——只要侧栏能正常显示
 * 出「常用字段」，导出弹窗用的就是同一个数组引用、过同一个 `groupFields()`，结果
 * 必然一致，不再依赖任何关于 mapping 响应结构、请求参数是否一致的假设。没有侧栏可用
 * 时（如宿主页面本来就没有接入字段侧栏），订阅方拿到 `undefined`，退回自己发请求。
 */

type Listener = () => void;

const store: Record<string, string[] | undefined> = {};
const listeners: Record<string, Set<Listener>> = {};
const scopeWriteOrder: string[] = [];

function emit(scopeKey: string) {
  listeners[scopeKey]?.forEach((listener) => listener());
}

/** 与 `resultFieldsStore.ts` 同款淘汰策略：多 tab/多次切换索引时不无限增长，仍有订阅者的 scope 不淘汰 */
function setIndexFields(scopeKey: string, fieldNames: string[]) {
  store[scopeKey] = fieldNames;

  const existedIndex = scopeWriteOrder.indexOf(scopeKey);
  if (existedIndex !== -1) scopeWriteOrder.splice(existedIndex, 1);
  scopeWriteOrder.push(scopeKey);
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
 * 发布侧：在渲染字段侧栏的组件里调用，把当前 mapping 字段名列表发布出去。
 *
 * `loading` 为 `true`（mapping 请求还在飞）时不写入/不覆盖：避免把「还没到位、临时兜底
 * 成的空数组」当成「这个索引真的没有字段」发布出去，污染订阅方——那样会重新引入本次
 * 要修的同一类 bug，只是换了一条链路。同一个 scope 上一轮请求成功发布过的值会保留，
 * 直到这一轮真正加载完成后才被覆盖。
 */
export function useIndexFieldsPublisher(scope: FieldsScope, fieldNames: string[], loading?: boolean) {
  const scopeKey = getScopeKey(scope);

  useEffect(() => {
    if (!scopeKey || loading) return;
    setIndexFields(scopeKey, fieldNames);
    // fieldNames 由调用方 useMemo 出稳定引用（随 mapping 请求结果变化），不需要额外去抖
  }, [scopeKey, fieldNames, loading]);
}

/** 消费侧：订阅某个 scope 的索引字段列表。返回 undefined 表示「还没有侧栏发布过」，调用方应退回自己的兜底获取方式 */
export function useIndexFields(scope: FieldsScope): string[] | undefined {
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
