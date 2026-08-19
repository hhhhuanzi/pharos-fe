import { DURATION_BAR_MIN_PERCENT, durationBarPercent, maxDurationInSet } from './durationBar';

describe('durationBarPercent', () => {
  it('scales against max duration in the same unit (µs): 1.89ms vs 29.54s', () => {
    const shortUs = 1.89 * 1_000;
    const longUs = 29.54 * 1_000_000;
    expect(durationBarPercent(longUs, longUs)).toBe(100);
    expect(durationBarPercent(shortUs, longUs)).toBe(DURATION_BAR_MIN_PERCENT);
    expect(durationBarPercent(shortUs, longUs)).toBeLessThan(durationBarPercent(longUs, longUs));
  });

  it('is linear for values above the sliver floor', () => {
    expect(durationBarPercent(50, 100)).toBe(50);
    expect(durationBarPercent(25, 100)).toBe(25);
  });

  it('keeps a visible sliver for tiny positive durations', () => {
    expect(durationBarPercent(1, 1_000_000)).toBe(DURATION_BAR_MIN_PERCENT);
  });

  it('returns 0 for empty / invalid durations (no fake bar)', () => {
    expect(durationBarPercent(0, 100)).toBe(0);
    expect(durationBarPercent(-1, 100)).toBe(0);
    expect(durationBarPercent(Number.NaN, 100)).toBe(0);
  });

  it('caps at 100 when duration equals or exceeds max', () => {
    expect(durationBarPercent(100, 100)).toBe(100);
    expect(durationBarPercent(120, 100)).toBe(100);
  });
});

describe('maxDurationInSet', () => {
  it('returns the max finite positive duration', () => {
    expect(maxDurationInSet([1890, 29_540_000, 5000])).toBe(29_540_000);
  });

  it('ignores non-positive and non-finite values', () => {
    expect(maxDurationInSet([0, Number.NaN, -3, 12])).toBe(12);
    expect(maxDurationInSet([])).toBe(0);
  });
});
