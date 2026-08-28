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
  /**
   * 上游 Nightingale 的新手引导：机器列表「接下来」引导条、三个引导动作弹窗、引导进度探测。
   * 我们自己的接入路径与它不一致，先整体隐藏，实现代码保留在
   * `src/components/OnboardingActions/**` 与 `src/components/OnboardingProgress/**`。
   */
  upstreamOnboarding: false,
} as const;
