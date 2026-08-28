import { RELEASE_FLAGS } from '@/dh/releaseFlags';

/**
 * 上游新手引导是否展示。
 *
 * 只有两个消费点，都在引导组件自身、而不是各个调用方：
 * - `OnboardingActionsProvider` 的 `enabled`：这是引导动作层已有的整体开关（原本给商业版用），
 *   置假后 `NextStepsCard` / `OnboardingActionModals` 各自返回 null、`openAction` 变 no-op，
 *   所有引导 UI 一并收起，调用方（App / 机器列表 / 安装与采集向导）无需改动。
 * - `probeOnboardingShared`：`enabled` 拦不住进度探测 —— `NextStepsCard` 在返回 null 之前
 *   已经调过 `useOnboardingProgress`，仍会拉一轮机器 / 大盘 / 告警 / 通知列表。
 *
 * 返回 `boolean`，避免 `as const` 把下游条件收成死代码。
 */
export function isUpstreamOnboardingVisible(): boolean {
  return RELEASE_FLAGS.upstreamOnboarding;
}
