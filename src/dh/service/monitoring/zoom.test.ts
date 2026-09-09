import { readUplotSelectRange } from './zoom';

function plot(left: number, width: number, from: number, to: number) {
  return {
    select: { left, width },
    posToVal: (pos: number, scaleKey: string) => {
      if (scaleKey !== 'x') return NaN;
      if (pos === left) return from;
      if (pos === left + width) return to;
      return NaN;
    },
  };
}

describe('readUplotSelectRange', () => {
  it('returns the boxed unix range', () => {
    expect(readUplotSelectRange(plot(40, 120, 1_757_316_000, 1_757_320_500))).toEqual({
      min: 1_757_316_000,
      max: 1_757_320_500,
    });
  });

  it('orders a right-to-left drag', () => {
    expect(readUplotSelectRange(plot(40, 120, 200, 100))).toEqual({ min: 100, max: 200 });
  });

  it('ignores a cleared selection or a click', () => {
    expect(readUplotSelectRange(plot(40, 0, 100, 100))).toBeUndefined();
  });

  it('ignores a zero-width time span', () => {
    expect(readUplotSelectRange(plot(40, 10, 100, 100))).toBeUndefined();
  });
});
