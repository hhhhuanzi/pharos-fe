import { lastPointValue, reduceSeries } from './values';

describe('lastPointValue / reduceSeries', () => {
  it('reads the last finite point', () => {
    expect(lastPointValue({ metric: {}, points: [[1, 0.2], [2, 0.4]] })).toBe(0.4);
    expect(lastPointValue({ metric: {}, points: [] })).toBeUndefined();
  });

  it('sums last points when a stat query returned several series', () => {
    expect(
      reduceSeries([
        { metric: { pod: 'a' }, points: [[1, 1]] },
        { metric: { pod: 'b' }, points: [[1, 2]] },
      ]),
    ).toBe(3);
  });

  it('returns undefined for an empty result so the card can say 未接入 rather than 0', () => {
    expect(reduceSeries([])).toBeUndefined();
  });
});
