/** Form duration is seconds (decimals allowed). Adapters still receive Jaeger `Nms` strings. */

/** Empty is valid (no filter). Rejects NaN and negatives. */
export function isValidDurationSeconds(value?: number | string | null): boolean {
  if (value == null || value === '') return true;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n >= 0;
}

/**
 * Convert form seconds to Jaeger `query.duration_min`.
 * 0.01 → `10ms`. Empty / 0 / invalid → undefined (no filter).
 */
export function secondsToDurationMin(value?: number | string | null): string | undefined {
  if (value == null || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const ms = Math.round(n * 1000);
  if (ms <= 0) return undefined;
  return `${ms}ms`;
}

/**
 * Parse a duration filter into milliseconds (SkyWalking `minTraceDuration`).
 * Idempotent; does not throw — invalid / empty input returns undefined.
 * Accepts the Jaeger string we emit (`10ms`) and historical unit suffixes.
 */
export function parseDurationToMs(value?: string): number | undefined {
  if (!value) return undefined;
  const match = /^(\d+(?:\.\d+)?)(us|ms|s|m|h)$/.exec(value.trim());
  if (!match) return undefined;
  const n = Number(match[1]);
  if (!Number.isFinite(n)) return undefined;
  const unit = match[2];
  if (unit === 'us') return n / 1000;
  if (unit === 'ms') return n;
  if (unit === 's') return n * 1000;
  if (unit === 'm') return n * 60 * 1000;
  return n * 3600 * 1000;
}
