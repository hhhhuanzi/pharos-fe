import { alignServiceSeries, assignServiceColors, buildPromRatio, colorsForSeries, errorRateYMax, filterSeriesByNames, matrixToSeries, promRangeStep, rateWindow } from './series';

describe('promRangeStep / rateWindow', () => {
  it('keeps at least 15s step and a 60s rate window', () => {
    expect(promRangeStep(100, 200)).toBe(15);
    expect(rateWindow(15)).toBe('1m');
  });
});

describe('matrixToSeries / filterSeriesByNames / alignServiceSeries', () => {
  const matrix = [
    {
      metric: { service_name: 'order' },
      values: [
        [1, '1.5'],
        [2, 'NaN'],
        [3, '2'],
      ] as Array<[number, string]>,
    },
    { metric: { service_name: 'pay' }, values: [[1, '3']] as Array<[number, string]> },
    { metric: { service_name: '' }, values: [[1, '9']] as Array<[number, string]> },
  ];

  it('drops empty names and non-finite points', () => {
    expect(matrixToSeries(matrix)).toEqual([
      { name: 'order', points: [[1, 1.5], [3, 2]] },
      { name: 'pay', points: [[1, 3]] },
    ]);
  });

  it('ignores the service_graph server label, which node-level RED no longer reads', () => {
    const graphShaped = [{ metric: { server: 'order', server_deployment_environment_name: 'prod' }, values: [[1, '7']] as Array<[number, string]> }];
    expect(matrixToSeries(graphShaped)).toEqual([]);
  });

  it('names series per service + environment so two environments do not collapse into one line', () => {
    const perEnv = [
      { metric: { service_name: 'quote', deployment_environment_name: 'prod' }, values: [[1, '5']] as Array<[number, string]> },
      { metric: { service_name: 'quote', deployment_environment_name: 'test' }, values: [[1, '1']] as Array<[number, string]> },
      { metric: { deployment_environment_name: 'prod' }, values: [[1, '9']] as Array<[number, string]> },
    ];
    expect(matrixToSeries(perEnv)).toEqual([
      { name: 'quote (prod)', points: [[1, 5]] },
      { name: 'quote (test)', points: [[1, 1]] },
    ]);
  });

  it('keeps the requested name order', () => {
    const series = [
      { name: 'b', points: [[1, 1] as [number, number]] },
      { name: 'a', points: [[1, 2] as [number, number]] },
    ];
    expect(filterSeriesByNames(series, ['a', 'missing', 'b']).map((item) => item.name)).toEqual(['a', 'b']);
  });

  it('leaves a name with no series out rather than drawing it as a flat zero', () => {
    /** A fabricated 0 line read as "this service is healthy" when Prom had simply returned nothing. */
    const series = [{ name: 'quote', points: [[1, 0] as [number, number], [2, 0] as [number, number]] }];
    expect(filterSeriesByNames(series, ['admin', 'quote', 'auth'])).toEqual([series[0]]);
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

describe('buildPromRatio / errorRateYMax', () => {
  it('keeps zero-error series via `or (denom * 0)`', () => {
    expect(buildPromRatio('failed', 'total')).toBe('(failed or (total * 0)) / total');
  });

  it('floors an all-zero chart at 1% so uPlot cannot default to 0–100', () => {
    expect(errorRateYMax([0, 0, null, undefined])).toBe(0.01);
  });

  it('picks a nice ceiling from the observed ratio', () => {
    expect(errorRateYMax([0.008, 0.012])).toBe(0.02);
    expect(errorRateYMax([0.4])).toBe(0.5);
    expect(errorRateYMax([1])).toBe(1);
    expect(errorRateYMax([2])).toBe(2.2);
  });
});
