import { RELEASE_FLAGS } from '@/dh/releaseFlags';

/**
 * 1.2.0 藏掉未完成的 span 火焰图 Radio。实现仍在 `src/dh/trace/spanFlamegraph/**`。
 * 返回 `boolean`，避免 `as const` 把 JSX 收成死代码。
 */
export function isSpanFlamegraphSwitchVisible(): boolean {
  return RELEASE_FLAGS.spanFlamegraph;
}
