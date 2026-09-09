import { omitRedundantAllSeries, sumSeriesAtTimestamps } from './aggregate';

describe('sumSeriesAtTimestamps', () => {
  it('adds series that share timestamps', () => {
    const a = {
      points: [
        [1, 10],
        [2, 20],
      ] as Array<[number, number]>,
    };
    const b = {
      points: [
        [1, 3],
        [2, 7],
      ] as Array<[number, number]>,
    };
    expect(sumSeriesAtTimestamps([a, b])).toEqual([
      [1, 13],
      [2, 27],
    ]);
  });

  it('treats a missing timestamp as zero rather than dropping the All point', () => {
    const a = {
      points: [
        [1, 10],
        [2, 20],
      ] as Array<[number, number]>,
    };
    const b = { points: [[2, 5]] as Array<[number, number]> };
    expect(sumSeriesAtTimestamps([a, b])).toEqual([
      [1, 10],
      [2, 25],
    ]);
  });

  it('does not mutate the input series', () => {
    const a = { points: [[1, 4]] as Array<[number, number]> };
    const original = [...a.points];
    sumSeriesAtTimestamps([a]);
    expect(a.points).toEqual(original);
  });
});

describe('omitRedundantAllSeries', () => {
  it('drops All when exactly one measured peer arrived, and keeps the named pod', () => {
    const series = [{ name: 'All', emphasis: 'all' as const }, { name: 'pod-a' }];

    expect(omitRedundantAllSeries(series)).toEqual([{ name: 'pod-a' }]);
  });

  it('keeps All next to two or more peers, and when All is the only reading', () => {
    const two = [{ name: 'All', emphasis: 'all' as const }, { name: 'pod-a' }, { name: 'pod-b' }];
    const onlyAll = [{ name: 'All', emphasis: 'all' as const }];

    expect(omitRedundantAllSeries(two)).toEqual(two);
    expect(omitRedundantAllSeries(onlyAll)).toEqual(onlyAll);
  });

  it('does not count a limit or desired line as a peer', () => {
    const series = [{ name: 'All', emphasis: 'all' as const }, { name: 'pod-a' }, { name: 'limit', reference: 'ceiling' }];

    expect(omitRedundantAllSeries(series)).toEqual([{ name: 'pod-a' }, { name: 'limit', reference: 'ceiling' }]);
  });

  it('does not mutate the input list', () => {
    const series = [{ name: 'All', emphasis: 'all' as const }, { name: 'pod-a' }];
    const original = [...series];

    omitRedundantAllSeries(series);
    expect(series).toEqual(original);
  });
});
