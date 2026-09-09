/**
 * The one place the product decides what green, yellow and red mean, and at which numbers they
 * switch over. Every status colour in the app is expected to come from here: a reading must never
 * be green in the service list and yellow in the monitoring tab, and a threshold must never be 1%
 * in one view and 2% in another.
 *
 * The standard is the one the service overview list has always used, because that is the screen
 * people calibrate on:
 *
 * - `success` → `text-success` / `--fc-fill-success`. Measured, and inside the band we call fine.
 *   Zero restarts and zero OOM kills belong here: "the event never happened" is the healthy
 *   answer, not a missing sample.
 * - `warning` → `text-warning` / `--fc-fill-warning`. Worth a look. Headroom is thinning, errors
 *   have started, something restarted once.
 * - `error` → `text-error` / `--fc-fill-error`. Already broken. Replicas missing, OOM kills, errors
 *   at a level a caller notices, a limit essentially reached.
 *
 * `TONE_ABSENT` grey is not a fourth verdict. It is the app-wide weak text colour, used for the
 * `—` placeholder when there is nothing to grade. Grey never means "fine" and never means "bad";
 * it means we did not measure this.
 *
 * Two rules keep the page from turning into a wall of colour, given that a normal reading is green:
 *
 * 1. Only numbers that carry a *verdict* are toned. A metric with no threshold behind it — QPS,
 *    P95, CPU cores, memory bytes, pod names — is a value, not a grade, and stays in whatever body
 *    text colour its component already uses. Painting P95 green would be claiming 34ms is
 *    "healthy" with no rule to back it up. That is why the functions below have no "neutral"
 *    return: a caller with nothing to grade should not be asking for a tone at all.
 * 2. Tone is the *only* emphasis a verdict gets: no bold, no background chip, no icon. Numbers in
 *    one card are already uniformly sized and weighted, so colour is the single variable.
 *
 * Text and fill share one token per level. `text-warning` and `statusFillRgb('warning')` both
 * resolve to `--fc-fill-warning` (light `rgb(250, 200, 0)`): warning is yellow, the same hue on a
 * number, a dot and a chart stroke. Forking a private palette per page is what produced the drift
 * this module exists to remove.
 */
export type StatusLevel = 'success' | 'warning' | 'error';

/** Measured and fine. The most repeated tone in any healthy view. */
export const TONE_NORMAL = 'text-success';
/** Worth a look, not yet broken. */
export const TONE_WARNING = 'text-warning';
/** Broken now. */
export const TONE_CRITICAL = 'text-error';
/** Nothing to grade. A placeholder colour, not a verdict. */
export const TONE_ABSENT = 'text-soft';

export type StatusTone = typeof TONE_NORMAL | typeof TONE_WARNING | typeof TONE_CRITICAL;
/** What a display helper returns: a verdict, or the placeholder when there is no reading. */
export type StatusToneOrAbsent = StatusTone | typeof TONE_ABSENT;

const TEXT_CLASS: Record<StatusLevel, StatusTone> = {
  success: TONE_NORMAL,
  warning: TONE_WARNING,
  error: TONE_CRITICAL,
};

const FILL_RGB_VAR: Record<StatusLevel, string> = {
  success: 'var(--fc-fill-success-rgb)',
  warning: 'var(--fc-fill-warning-rgb)',
  error: 'var(--fc-fill-error-rgb)',
};

/** Tailwind text class for a level. Both themes are handled by the CSS variable behind it. */
export function statusTextClass(level: StatusLevel): StatusTone {
  return TEXT_CLASS[level];
}

/**
 * The same level as a bare `rgb()` triple, for canvas and SVG strokes that need their own alpha and
 * therefore cannot use the text class.
 */
export function statusFillRgb(level: StatusLevel, alpha = 1): string {
  return `rgb(${FILL_RGB_VAR[level]} / ${alpha})`;
}

function measured(value?: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Failed calls over total calls. 1% is where an SLO starts bleeding; 5% is visible to callers.
 * These two numbers are the product's error-rate scale — service list, dependency graph, node
 * drawer and the monitoring tab all read them from here.
 */
export const ERROR_RATE_WARNING = 0.01;
export const ERROR_RATE_CRITICAL = 0.05;

export function errorRateLevel(rate: number): StatusLevel {
  if (rate >= ERROR_RATE_CRITICAL) return 'error';
  if (rate >= ERROR_RATE_WARNING) return 'warning';
  return 'success';
}

export function errorRateTone(rate?: number | null): StatusToneOrAbsent {
  if (!measured(rate)) return TONE_ABSENT;
  return statusTextClass(errorRateLevel(rate));
}

/**
 * Usage over the container's own limit.
 *
 * The scale used to open at 70%, which painted a correctly sized container yellow — 73% of limit is
 * a *good* container, and a warning that fires on good containers teaches people to ignore
 * warnings. 80% is the first point where headroom is genuinely thinning (it is also the autoscaling
 * target most teams pick), and 95% is where CPU starts being throttled and memory is one traffic
 * spike away from an OOM kill.
 */
export const UTILIZATION_WARNING = 0.8;
export const UTILIZATION_CRITICAL = 0.95;

export function utilizationLevel(ratio: number): StatusLevel {
  if (ratio >= UTILIZATION_CRITICAL) return 'error';
  if (ratio >= UTILIZATION_WARNING) return 'warning';
  return 'success';
}

export function utilizationTone(ratio?: number | null): StatusToneOrAbsent {
  if (!measured(ratio)) return TONE_ABSENT;
  return statusTextClass(utilizationLevel(ratio));
}

/** Restarts over the selected window. One restart is a question; five is a crash loop. */
export const RESTART_CRITICAL = 5;

export function restartTone(count?: number | null): StatusToneOrAbsent {
  if (!measured(count)) return TONE_ABSENT;
  if (count >= RESTART_CRITICAL) return TONE_CRITICAL;
  return count > 0 ? TONE_WARNING : TONE_NORMAL;
}

/** A memory kill is never routine, so the first one is already red. Zero of them is green. */
export function oomTone(count?: number | null): StatusToneOrAbsent {
  if (!measured(count)) return TONE_ABSENT;
  return count > 0 ? TONE_CRITICAL : TONE_NORMAL;
}

/** Every desired replica ready is green; some missing is amber; none ready is red. */
export function readyTone(ready?: number | null, desired?: number | null): StatusToneOrAbsent {
  if (!measured(ready) || !measured(desired) || desired <= 0) return TONE_ABSENT;
  if (ready >= desired) return TONE_NORMAL;
  if (ready <= 0) return TONE_CRITICAL;
  return TONE_WARNING;
}
