import { adaptiveStep, MIN_STEP_SECONDS } from './step';

function points(span: number): number {
  return span / adaptiveStep(0, span);
}

describe('adaptiveStep', () => {
  it.each([
    ['1h', 3600, 15],
    ['6h', 21600, 60],
    ['12h', 43200, 120],
    ['24h', 86400, 300],
    ['7d', 604800, 1800],
    ['30d', 2592000, 7200],
  ])('keeps %s between 200 and 400 points', (_label, span, expected) => {
    expect(adaptiveStep(0, span)).toBe(expected);
    expect(points(span)).toBeGreaterThanOrEqual(200);
    expect(points(span)).toBeLessThanOrEqual(400);
  });

  it('never goes below the 15s floor, even when that means fewer points', () => {
    expect(adaptiveStep(0, 900)).toBe(MIN_STEP_SECONDS);
    expect(adaptiveStep(0, 1)).toBe(MIN_STEP_SECONDS);
    expect(adaptiveStep(100, 100)).toBe(MIN_STEP_SECONDS);
  });

  it('still caps points when the span outgrows the nice-step ladder', () => {
    const span = 40000000; // ~463d: every nice step would return well over 400 points
    expect(points(span)).toBeLessThanOrEqual(400);
    expect(points(span)).toBeGreaterThanOrEqual(200);
  });
});
