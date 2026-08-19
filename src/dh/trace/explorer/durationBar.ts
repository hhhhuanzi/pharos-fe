/** Minimum visible width so a 1.89ms row is still a sliver next to a 29s row. */
export const DURATION_BAR_MIN_PERCENT = 2;

/**
 * Relative bar width for the list duration column.
 * Inputs must already be the same unit (microseconds on `PharosTraceSummary.durationUs`).
 * Longest in the current result set → ~100%; shorter rows scale linearly, floored at a sliver.
 */
export function durationBarPercent(durationUs: number, maxDurationUs: number): number {
  if (!(durationUs > 0) || !Number.isFinite(durationUs)) return 0;
  const max = maxDurationUs > 0 && Number.isFinite(maxDurationUs) ? maxDurationUs : durationUs;
  const pct = (durationUs / max) * 100;
  if (pct >= 100) return 100;
  return Math.max(pct, DURATION_BAR_MIN_PERCENT);
}

/** Max duration in the current result set. Ignores non-positive / non-finite values. */
export function maxDurationInSet(durationUsList: readonly number[]): number {
  let max = 0;
  for (const value of durationUsList) {
    if (typeof value === 'number' && Number.isFinite(value) && value > max) max = value;
  }
  return max;
}
