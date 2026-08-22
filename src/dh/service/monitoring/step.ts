/** Prometheus / Thanos step floor; smaller steps only inflate the payload. */
export const MIN_STEP_SECONDS = 15;

const MIN_POINTS = 200;
const MAX_POINTS = 400;

/** Human-readable steps so the x-axis lands on round times instead of 37s-style increments. */
const NICE_STEPS = [15, 20, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400];

/**
 * Keeps every curve between 200 and 400 samples: a 1h window with a 15s step is fine, a 30d window
 * with one is 170k points per series. Windows shorter than `MIN_POINTS * MIN_STEP_SECONDS` return the
 * 15s floor and therefore fewer points — that is intended, the floor wins over the point budget.
 */
export function adaptiveStep(startUnix: number, endUnix: number): number {
  const span = Math.max(1, Math.round(endUnix - startUnix));
  const lower = span / MAX_POINTS;
  const upper = span / MIN_POINTS;
  const nice = NICE_STEPS.find((step) => step >= lower && step <= upper);
  if (nice != null) return Math.max(MIN_STEP_SECONDS, nice);
  return Math.max(MIN_STEP_SECONDS, Math.ceil(span / ((MIN_POINTS + MAX_POINTS) / 2)));
}
