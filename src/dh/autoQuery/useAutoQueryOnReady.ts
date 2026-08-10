import { useEffect, useRef } from 'react';

/**
 * 判断「首次自动查询」所需的必要条件是否就绪，以及用户是否已经开始编辑查询条件。
 *
 * 背景：`ExplorerNG/SideBarNav/index.tsx` 里，数据源确定后会异步拉取索引模式列表
 * （`getESIndexPatterns`），成功后在 `onSuccess` 里自动选中第一个索引模式、连带算出
 * 默认的 `index`/`date_field`（见该文件 141-162 行），但这条路径本身不会调用
 * `executeQuery()`——同一个 `onSuccess` 里「URL 带了 `index_pattern` 参数」的分支
 * （115-140 行）反而会在算出默认值后调用一次 `executeQuery()`。也就是说，「有没有自动
 * 查询」这件事在官方代码里本来就不是一个统一决策，「默认进入、无 URL 参数」这条最常见
 * 的路径恰好落在没有自动查询的分支上，导致用户一进页面看到的是空态主区域 + 一批只是
 * 「mapping 全量字段套内置推荐词表」算出来的「常用字段」候选（还没有查询结果样本，
 * `groupFields.ts` 的 `isPresent()` 恒为 true，不产生真正的过滤效果）。
 *
 * 这个 hook 用一个持久的 `ref` 保证「只在必要条件第一次全部就绪的那一刻」触发一次
 * `executeQuery()`：往后不管这些值怎么变化（用户切换索引模式、改时间范围等），都不会
 * 再自动触发——那些场景已经由官方各自的 `onChange` 处理（切索引模式清空 `refreshFlag`
 * 要求用户显式再查一次、选时间字段/时间范围会直接调用 `executeQuery()`），不需要、也不
 * 应该由这个 hook 重复处理。
 */
export interface AutoQueryReadyInput {
  /** 已选中的数据源 */
  datasourceValue?: unknown;
  /** 已确定的索引/索引模式名 */
  index?: unknown;
  /** 已确定的时间字段 */
  dateField?: unknown;
  /** 已就绪的时间范围 */
  range?: unknown;
  /** 搜索框里的查询文本，用于判断用户是否已经开始编辑查询条件 */
  queryText?: unknown;
  /** 已添加的过滤条件，用于判断用户是否已经开始编辑查询条件 */
  filters?: unknown[];
}

/** 数据源/索引/时间字段/时间范围是否都已就绪——不管就绪的具体值是什么，只要求非空 */
export function isAutoQueryReady(input: AutoQueryReadyInput): boolean {
  return !!input.datasourceValue && !!input.index && !!input.dateField && !!input.range;
}

/**
 * 用户是否已经在必要条件就绪之前开始编辑查询条件（输入搜索文本、添加过滤器）。
 * 为 true 时应跳过自动查询，避免用一次自动查询打断/覆盖用户尚未提交的输入。
 */
export function hasUserEditedQuery(input: Pick<AutoQueryReadyInput, 'queryText' | 'filters'>): boolean {
  const queryText = typeof input.queryText === 'string' ? input.queryText.trim() : '';
  return queryText.length > 0 || (Array.isArray(input.filters) && input.filters.length > 0);
}

/**
 * 在必要条件第一次全部就绪时自动执行一次查询，此后（包括依赖值继续变化、组件因 Tab
 * 切换重新可见）都不会再次触发——Tab 切换在这个页面里是 `display:none/block` 而不是
 * 卸载重新挂载（见 `pages/logExplorer/index.tsx`），`triggeredRef` 在组件生命周期内
 * 是持久的，不会因为切走再切回来而被重置。
 *
 * `hasQueryAlreadyStarted` 用于覆盖一个更窄的边界场景：`SideBarNav/index.tsx` 里还有
 * 另一条官方既有路径（URL 带了能匹配到的 `index_pattern` 参数时，`getESIndexPatterns`
 * 的 `onSuccess` 会自己调一次 `executeQuery()`），它设置 `index`/`date_field` 的同一次
 * `setFieldsValue` 恰好也会让这里的 `ready` 第一次变 true，理论上可能与这个 hook 各自
 * 调用一次 `executeQuery()`、变成两次重复查询。用 `setTimeout(0)` 延迟到与
 * `executeQuery()` 内部同样的宏任务时机再检查一次「是不是已经有一次查询正在起飞」——
 * 如果官方那条路径的调用更早发生，它内部同样经过 `setTimeout(0)` 才真正写 `refreshFlag`，
 * FIFO 顺序下一定先于这里排到；这里再检查到 `refreshFlag` 已经非空就跳过，不会重复触发。
 */
export default function useAutoQueryOnReady(input: AutoQueryReadyInput, executeQuery: () => void, hasQueryAlreadyStarted?: () => boolean): void {
  const triggeredRef = useRef(false);
  const ready = isAutoQueryReady(input);

  useEffect(() => {
    if (triggeredRef.current || !ready) return;
    // 不管这一次是否因为用户已经在编辑查询条件而跳过真正的 executeQuery() 调用，
    // 都要把「已经判定过一次」标记为 true——否则用户在就绪后又清空了输入框，会被
    // 「追发」一次意料之外的自动查询，等同于换了个时机重新引入同一类打断问题。
    triggeredRef.current = true;
    if (hasUserEditedQuery(input)) return;
    setTimeout(() => {
      if (hasQueryAlreadyStarted?.()) return;
      executeQuery();
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
}
