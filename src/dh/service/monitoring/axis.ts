import type { MonitoringUnit } from './format';

/**
 * Y-axis range + tick increments for the service monitoring charts.
 *
 * uPlot's default y scale is 0–100 whenever every sample is 0, which is how the restart panel ended
 * up with a 0–100 axis for a flat zero line. It also picks fractional increments for small ranges,
 * so a replica count of 1 drew ticks 0 / 0 / 1 / 1 after `count` rounding. Both are fixed here by
 * locking the range and restricting the increments per unit.
 *
 * Ranges are zero-based except `signed` (network receive / transmit), where 0 is the midline. A
 * floating baseline on a non-negative metric turns ±0.1% jitter into what looks like an outage.
 */
export type MonitoringYAxisMode = 'count' | 'ratio' | 'utilization' | 'linear' | 'signed';

/** Headroom above the measured max before rounding up to a nice value. */
const HEADROOM = 1.1;
/** Counts get a little more, so a single restart spike does not touch the ceiling. */
const COUNT_HEADROOM = 1.15;
/** Smallest ceiling for a count axis: enough for "1 restart" to read as 1 of 2, not as full scale. */
const MIN_COUNT_MAX = 2;

/**
 * Error rate / CPU throttling / GC share. Same ladder as `errorRateYMax` in `../series`: a 1%
 * ceiling floor keeps sub-percent noise from filling the plot, and 5% lands on the throttling
 * threshold the panel hint talks about.
 */
const RATIO_FLOORS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1] as const;
/** Real utilization (node CPU / memory / disk, JVM CPU). Coarser, so the axis stops flickering. */
const UTILIZATION_FLOORS = [0.1, 0.25, 0.5, 1] as const;

const DECIMAL_MANTISSAS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 9, 10] as const;
const SMALL_INTEGER_MAXES = [1, 2, 3, 4, 5, 6, 8, 10] as const;
/** 1024-aligned so byte axes read 256 MiB / 512 MiB instead of 190.7 MiB. */
const BINARY_MANTISSAS = [
  1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128, 160, 192, 224, 256, 320, 384, 448, 512, 640, 768, 896, 1024,
] as const;

/** `[1, 2, 5] × 10^n`: whole-number ticks only, for replica / restart / thread / class counts. */
const INTEGER_INCRS: number[] = Array.from({ length: 10 }, (_, exp) => [1, 2, 5].map((mantissa) => mantissa * 10 ** exp)).flat();
/** Powers of two, so every byte tick is an exact IEC value. */
const BINARY_INCRS: number[] = Array.from({ length: 51 }, (_, exp) => 2 ** exp);

/** Ceiling used when nothing was measured, so an all-zero panel gets a plausible scale, not 0–100. */
const ZERO_MAX: Record<MonitoringUnit, number> = {
  cores: 0.1,
  bytes: 1024 * 1024,
  bytesPerSecond: 1024,
  percentUnit: RATIO_FLOORS[0],
  count: MIN_COUNT_MAX,
  short: 1,
  ops: 1,
  milliseconds: 10,
  seconds: 0.01,
};

export interface MonitoringYAxisInput {
  unit: MonitoringUnit;
  /** Defaults to the unit's natural mode; panels override it for true utilization ratios. */
  mode?: MonitoringYAxisMode;
  /** Values of the measured (solid) series. */
  values: Array<number | null | undefined>;
  /** Values of the dashed request / limit reference lines. Weighted exactly like `values`. */
  references?: Array<number | null | undefined>;
}

export interface MonitoringYAxisPlan {
  /** Locked `[min, max]` for `scalesBuilder({ yRange })`. Zero-based except `signed`. */
  range: [number, number];
  /** uPlot axis `incrs`; left undefined when the default decimal ladder is already right. */
  incrs?: number[];
}

function isByteUnit(unit: MonitoringUnit): boolean {
  return unit === 'bytes' || unit === 'bytesPerSecond';
}

export function defaultMonitoringYAxisMode(unit: MonitoringUnit): MonitoringYAxisMode {
  if (unit === 'count') return 'count';
  if (unit === 'percentUnit') return 'ratio';
  return 'linear';
}

/** Strips float dust from `mantissa * pow` so 0.7000000000000001 does not reach the axis. */
function clean(value: number): number {
  return Number(value.toPrecision(12));
}

function maxFinite(values: Array<number | null | undefined>): number {
  let max = 0;
  values.forEach((value) => {
    if (typeof value === 'number' && Number.isFinite(value) && value > max) max = value;
  });
  return max;
}

function maxAbsFinite(values: Array<number | null | undefined>): number {
  let max = 0;
  values.forEach((value) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return;
    const abs = Math.abs(value);
    if (abs > max) max = abs;
  });
  return max;
}

/**
 * A reference line is a measurement too: `limit`, `request` and `desired` are read out of Thanos
 * exactly like the solid series and only *drawn* dashed. So they set the ceiling on equal terms,
 * and a limit is never dropped from the range to keep the usage curve interesting — a 2-core limit
 * over 25 mCore of usage flattens that curve onto the baseline, which is the honest answer to the
 * question the panel exists for: nowhere near it. Squeezing the axis to make sub-percent jitter
 * legible would draw a dramatic-looking curve *and* leave the amber limit line off the plot while
 * the tooltip and legend still list it, which is what people got confused by.
 */
function measuredExtent(values: Array<number | null | undefined>, references: Array<number | null | undefined>): number {
  return Math.max(maxFinite(values), maxFinite(references));
}

function decimalCeil(value: number): number {
  if (!(value > 0)) return 0;
  const pow = 10 ** Math.floor(Math.log10(value));
  const mantissa = value / pow;
  const nice = DECIMAL_MANTISSAS.find((candidate) => mantissa <= candidate + 1e-9) ?? 10;
  return clean(nice * pow);
}

function binaryCeil(value: number): number {
  if (!(value > 0)) return 0;
  let pow = 1;
  while (value / pow >= 1024 && pow < 1024 ** 5) pow *= 1024;
  const mantissa = value / pow;
  const nice = BINARY_MANTISSAS.find((candidate) => mantissa <= candidate + 1e-9) ?? 1024;
  return clean(nice * pow);
}

/** Whole-number ceiling. `decimalCeil` mantissas are all integers once the decade is ≥ 10. */
function integerCeil(value: number): number {
  const padded = value * COUNT_HEADROOM;
  if (padded <= MIN_COUNT_MAX) return MIN_COUNT_MAX;
  if (padded <= 10) return SMALL_INTEGER_MAXES.find((candidate) => candidate >= padded) ?? 10;
  return Math.ceil(decimalCeil(padded));
}

function ratioCeil(value: number, floors: readonly number[]): number {
  if (!(value > 0)) return floors[0];
  const padded = value * HEADROOM;
  if (value > 1) return clean(padded);
  return floors.find((floor) => floor >= padded) ?? 1;
}

/** Range + increments for one chart's y axis. */
export function buildMonitoringYAxis({ unit, mode, values, references = [] }: MonitoringYAxisInput): MonitoringYAxisPlan {
  const resolvedMode = mode ?? defaultMonitoringYAxisMode(unit);
  const extent = measuredExtent(values, references);

  if (resolvedMode === 'count') {
    return { range: [0, integerCeil(extent)], incrs: INTEGER_INCRS };
  }
  if (resolvedMode === 'ratio' || resolvedMode === 'utilization') {
    return { range: [0, ratioCeil(extent, resolvedMode === 'ratio' ? RATIO_FLOORS : UTILIZATION_FLOORS)] };
  }
  if (resolvedMode === 'signed') {
    const absExtent = maxAbsFinite([...values, ...references]);
    const incrs = isByteUnit(unit) ? BINARY_INCRS : undefined;
    if (absExtent <= 0) {
      const zero = ZERO_MAX[unit];
      return { range: [-zero, zero], incrs };
    }
    const max = isByteUnit(unit) ? binaryCeil(absExtent * HEADROOM) : decimalCeil(absExtent * HEADROOM);
    return { range: [-max, max], incrs };
  }
  if (extent <= 0) {
    return { range: [0, ZERO_MAX[unit]], incrs: isByteUnit(unit) ? BINARY_INCRS : undefined };
  }
  if (isByteUnit(unit)) {
    return { range: [0, binaryCeil(extent * HEADROOM)], incrs: BINARY_INCRS };
  }
  return { range: [0, decimalCeil(extent * HEADROOM)] };
}
