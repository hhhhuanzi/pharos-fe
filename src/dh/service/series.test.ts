import { SERVICE_GRAPH_METRICS } from '@/dh/trace/dependencies/promql';

import { alignServiceSeries, assignServiceColors, buildTopSeriesQueries, colorsForSeries, filterSeriesByNames, matrixToSeries, promRangeStep, rateWindow } from './series';

describe('promRangeStep / rateWindow', () => {
  it('keeps at least 15s step and a 60s rate window', () => {
    expect(promRangeStep(100, 200)).toBe(15);
    expect(rateWindow(15)).toBe('1m');
  });
});

describe('buildTopSeriesQueries', () => {
  it('returns null without services', () => {
    expect(buildTopSeriesQueries([], '5m')).toBeNull();
  });

  it('regex-matches the given servers for qps / error rate / p95', () => {
    const q = buildTopSeriesQueries(['order', 'a.b'], '5m');
    expect(q?.qps).toBe(`sum by (server) (rate(${SERVICE_GRAPH_METRICS.total}{server=~"order|a\\\\.b"}[5m]))`);
    expect(q?.errorRate).toContain(`${SERVICE_GRAPH_METRICS.failed}{server=~"order|a\\\\.b"}[5m]`);
    expect(q?.p95).toContain('histogram_quantile(0.95');
    expect(q?.p95).toContain(`${SERVICE_GRAPH_METRICS.serverBucket}{server=~"order|a\\\\.b"}[5m]`);
  });
});

describe('matrixToSeries / filterSeriesByNames / alignServiceSeries', () => {
  const matrix = [
    {
      metric: { server: 'order' },
      values: [
        [1, '1.5'],
        [2, 'NaN'],
        [3, '2'],
      ] as Array<[number, string]>,
    },
    { metric: { service_name: 'pay' }, values: [[1, '3']] as Array<[number, string]> },
    { metric: { server: '' }, values: [[1, '9']] as Array<[number, string]> },
  ];

  it('drops empty names and non-finite points', () => {
    expect(matrixToSeries(matrix)).toEqual([
      { name: 'order', points: [[1, 1.5], [3, 2]] },
      { name: 'pay', points: [[1, 3]] },
    ]);
  });

  it('keeps the requested name order', () => {
    const series = [
      { name: 'b', points: [[1, 1] as [number, number]] },
      { name: 'a', points: [[1, 2] as [number, number]] },
    ];
    expect(filterSeriesByNames(series, ['a', 'missing', 'b']).map((item) => item.name)).toEqual(['a', 'b']);
  });

  it('aligns timestamps and fills gaps with null', () => {
    const aligned = alignServiceSeries([
      {
        name: 'a',
        points: [
          [1, 10],
          [3, 30],
        ],
      },
      { name: 'b', points: [[2, 20]] },
    ]);
    expect(aligned.times).toEqual([1, 2, 3]);
    expect(aligned.labels).toEqual(['a', 'b']);
    expect(aligned.frames[1]).toEqual([10, null, 30]);
    expect(aligned.frames[2]).toEqual([null, 20, null]);
  });
});

describe('assignServiceColors / colorsForSeries', () => {
  const palette = ['#aaa', '#bbb', '#ccc', '#ddd'] as const;

  it('maps first-seen names to palette slots and ignores later duplicates', () => {
    expect(assignServiceColors(['admin', 'auth', 'admin', 'quote'], [...palette])).toEqual({
      admin: '#aaa',
      auth: '#bbb',
      quote: '#ccc',
    });
  });

  it('keeps the same color for a service across charts even when one chart omits it', () => {
    const colorByName = assignServiceColors(['admin', 'kline', 'auth', 'quote'], [...palette]);
    const p95 = colorsForSeries(['admin', 'kline', 'auth', 'quote'], colorByName, [...palette]);
    const qps = colorsForSeries(['kline', 'quote'], colorByName, [...palette]);
    const errorRate = colorsForSeries(['admin', 'quote'], colorByName, [...palette]);

    expect(p95).toEqual(['#aaa', '#bbb', '#ccc', '#ddd']);
    expect(qps).toEqual(['#bbb', '#ddd']);
    expect(errorRate).toEqual(['#aaa', '#ddd']);
    expect(qps[0]).toBe(p95[1]);
    expect(errorRate[0]).toBe(p95[0]);
    expect(errorRate[1]).toBe(p95[3]);
  });
});
