import { isValidDurationSeconds, parseDurationToMs, secondsToDurationMin } from './duration';

describe('isValidDurationSeconds', () => {
  it('accepts empty, zero, and decimal seconds', () => {
    expect(isValidDurationSeconds(undefined)).toBe(true);
    expect(isValidDurationSeconds(null)).toBe(true);
    expect(isValidDurationSeconds('')).toBe(true);
    expect(isValidDurationSeconds(0)).toBe(true);
    expect(isValidDurationSeconds(0.01)).toBe(true);
    expect(isValidDurationSeconds(1)).toBe(true);
    expect(isValidDurationSeconds('1.2')).toBe(true);
  });

  it('rejects non-numeric and negative values', () => {
    expect(isValidDurationSeconds('100ms')).toBe(false);
    expect(isValidDurationSeconds('nope')).toBe(false);
    expect(isValidDurationSeconds(-1)).toBe(false);
    expect(isValidDurationSeconds(Number.NaN)).toBe(false);
  });
});

describe('secondsToDurationMin', () => {
  it('converts seconds to a Jaeger millisecond string', () => {
    expect(secondsToDurationMin(0.01)).toBe('10ms');
    expect(secondsToDurationMin(1)).toBe('1000ms');
    expect(secondsToDurationMin('1.2')).toBe('1200ms');
  });

  it('returns undefined for empty, zero, or invalid input and is idempotent', () => {
    expect(secondsToDurationMin(undefined)).toBeUndefined();
    expect(secondsToDurationMin(null)).toBeUndefined();
    expect(secondsToDurationMin('')).toBeUndefined();
    expect(secondsToDurationMin(0)).toBeUndefined();
    expect(secondsToDurationMin(-1)).toBeUndefined();
    expect(secondsToDurationMin(0.01)).toBe(secondsToDurationMin(0.01));
  });
});

describe('parseDurationToMs', () => {
  it('converts each unit to milliseconds', () => {
    expect(parseDurationToMs('500us')).toBe(0.5);
    expect(parseDurationToMs('10ms')).toBe(10);
    expect(parseDurationToMs('100ms')).toBe(100);
    expect(parseDurationToMs('1.2s')).toBe(1200);
    expect(parseDurationToMs('1m')).toBe(60_000);
    expect(parseDurationToMs('1h')).toBe(3_600_000);
  });

  it('returns undefined for empty or invalid input and is idempotent', () => {
    expect(parseDurationToMs(undefined)).toBeUndefined();
    expect(parseDurationToMs('')).toBeUndefined();
    expect(parseDurationToMs('nope')).toBeUndefined();
    expect(parseDurationToMs('100ms')).toBe(parseDurationToMs('100ms'));
  });
});
