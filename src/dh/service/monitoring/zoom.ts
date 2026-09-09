/**
 * uPlot box-select → page time range. Same idea as dashboard TimeSeriesNG `setScale` /
 * `onZoomWithoutDefult`, but we read `setSelect` so a data reload cannot be mistaken for a
 * user drag (that path would turn "last 3 hours" into an absolute window on every refresh).
 */

export interface UplotSelectLike {
  select: { left: number; width: number };
  posToVal: (pos: number, scaleKey: string) => number;
}

/** Unix seconds of the current selection, or undefined when the box was cleared / is a click. */
export function readUplotSelectRange(u: UplotSelectLike): { min: number; max: number } | undefined {
  if (u.select.width <= 0) return undefined;
  const a = u.posToVal(u.select.left, 'x');
  const b = u.posToVal(u.select.left + u.select.width, 'x');
  if (!Number.isFinite(a) || !Number.isFinite(b)) return undefined;
  const min = Math.min(a, b);
  const max = Math.max(a, b);
  if (!(max > min)) return undefined;
  return { min, max };
}
