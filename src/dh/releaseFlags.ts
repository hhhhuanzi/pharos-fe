/**
 * 发版门控。1.2.0 先关掉未完成能力，实现代码保留。
 * 1.3.0：把对应项改回 `true` 即可重新展示。
 */
export const RELEASE_FLAGS = {
  /**
   * 服务详情「事件 / 性能火焰图 / 异常堆栈」，以及侧栏「事件中心」。
   * 1.3.0 改为 true。
   */
  serviceDeferredTabs: false,
  /**
   * 链路详情「Span 火焰图」切换。点开是 span 树横条半成品，不是 icicle/flame。
   * 完成真正火焰图后再改为 true。不要和服务详情「性能火焰图」tab 混用。
   */
  spanFlamegraph: false,
} as const;
