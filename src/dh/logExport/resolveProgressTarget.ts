/**
 * 进度条「分母」的收窄规则，从 useLogExport.ts 的 sessionProgress() 抽成纯函数便于单测。
 *
 * 首批响应之前，真实命中数（`total`）未知，只能用请求条数（架构上限 clamp 之后的
 * `target`）撑住分母——这一步没有办法避免，但通常远大于真实命中数，UI 侧要用
 * `totalUnknown`（`total == null && fetched === 0`）单独识别这段时间、改用不确定的
 * 进度样式，而不是直接展示一个看起来精确、实则注定要跳变的百分比。
 *
 * 首批响应之后 `total` 就固定了（ES 只在首批 `track_total_hits: true` 时返回，此后
 * 不再变化），分母随之收窄为 `min(target, total)`：命中数超过请求上限时仍封顶在
 * 请求上限，因为超过上限的部分本来就不会被导出，不能让分母比「实际能拉到的最大值」
 * 还大。因为 `total` 只会被赋值一次、`fetched` 单调递增，这个收窄只会朝着让百分比
 * 变大的方向发生一次，不会出现「先涨后跌」的回退。
 */
export function resolveProgressTarget(target: number, total: number | undefined): number {
  return total != null ? Math.min(target, total) : target;
}
