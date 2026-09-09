import { buildInstantBatchPayload, buildRangeBatchPayload, matrixToMonitoringSeries, vectorToMonitoringSeries, zipInstantBatchResult, zipRangeBatchResult } from './query';

describe('matrixToMonitoringSeries', () => {
  it('parses a Prometheus matrix and keeps the raw labels for legends', () => {
    expect(
      matrixToMonitoringSeries([
        {
          metric: { pod: 'p-1' },
          values: [
            [1, '0.5'],
            [2, '0.75'],
          ],
        },
      ]),
    ).toEqual([
      {
        metric: { pod: 'p-1' },
        points: [
          [1, 0.5],
          [2, 0.75],
        ],
      },
    ]);
  });

  it('keeps an all-zero series so a quiet GC name still plots', () => {
    expect(
      matrixToMonitoringSeries([
        {
          metric: { jvm_gc_name: 'G1 Old Generation' },
          values: [
            [1, '0'],
            [2, '0'],
          ],
        },
      ]),
    ).toEqual([
      {
        metric: { jvm_gc_name: 'G1 Old Generation' },
        points: [
          [1, 0],
          [2, 0],
        ],
      },
    ]);
  });

  it('drops NaN points and series left empty by that', () => {
    expect(
      matrixToMonitoringSeries([
        {
          metric: { pod: 'p-1' },
          values: [
            [1, 'NaN'],
            [2, '3'],
          ],
        },
        { metric: { pod: 'p-2' }, values: [[1, 'NaN']] },
      ]),
    ).toEqual([{ metric: { pod: 'p-1' }, points: [[2, 3]] }]);
  });

  it('tolerates a missing or malformed batch slot', () => {
    expect(matrixToMonitoringSeries(undefined)).toEqual([]);
    expect(matrixToMonitoringSeries([{ metric: { pod: 'p' } }])).toEqual([]);
  });
});

describe('buildRangeBatchPayload / zipRangeBatchResult', () => {
  const queries = [
    { refId: 'cpu.usage', query: 'up' },
    { refId: 'cpu.limit', query: 'max(limit)' },
  ];

  it('repeats start/end/step onto every query and does not bake in a datasource id', () => {
    expect(buildRangeBatchPayload(99, queries, 100, 200, 15)).toEqual({
      datasource_id: 99,
      queries: [
        { refId: 'cpu.usage', query: 'up', start: 100, end: 200, step: 15 },
        { refId: 'cpu.limit', query: 'max(limit)', start: 100, end: 200, step: 15 },
      ],
    });
  });

  it('zips positional batch slots back onto the requested refIds', () => {
    const dat = [[{ metric: { pod: 'p-1' }, values: [[1, '0.2']] }], [{ metric: {}, values: [[1, '1']] }]];
    expect(zipRangeBatchResult(queries, dat)).toEqual([
      { refId: 'cpu.usage', series: [{ metric: { pod: 'p-1' }, points: [[1, 0.2]] }] },
      { refId: 'cpu.limit', series: [{ metric: {}, points: [[1, 1]] }] },
    ]);
  });

  it('yields empty series when a slot is missing, without shifting later queries', () => {
    expect(zipRangeBatchResult(queries, [[{ metric: { pod: 'p-1' }, values: [[1, '0.2']] }]])).toEqual([
      { refId: 'cpu.usage', series: [{ metric: { pod: 'p-1' }, points: [[1, 0.2]] }] },
      { refId: 'cpu.limit', series: [] },
    ]);
  });
});

describe('vectorToMonitoringSeries / zipInstantBatchResult', () => {
  it('turns an instant vector into a one-point series', () => {
    expect(vectorToMonitoringSeries([{ metric: { pod: 'p-1' }, value: [10, '1.5'] }])).toEqual([{ metric: { pod: 'p-1' }, points: [[10, 1.5]] }]);
    expect(vectorToMonitoringSeries([{ metric: {}, value: [1, 'NaN'] }])).toEqual([]);
  });

  it('zips instant slots the same way as range slots', () => {
    const queries = [{ refId: 'qps', query: 'sum(rate(x[1h]))' }];
    expect(buildInstantBatchPayload(7, queries, 99)).toEqual({
      datasource_id: 7,
      queries: [{ refId: 'qps', query: 'sum(rate(x[1h]))', time: 99 }],
    });
    expect(zipInstantBatchResult(queries, [[{ metric: {}, value: [99, '0.2'] }]])).toEqual([{ refId: 'qps', series: [{ metric: {}, points: [[99, 0.2]] }] }]);
  });
});
