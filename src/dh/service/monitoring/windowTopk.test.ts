import {
  applyWindowTopkToRangeQueries,
  collectWindowTopkNames,
  injectFirstSelectorMatcher,
  injectLabelRegex,
  isWindowTopkRefId,
  windowTopkInstantQueries,
  windowTopkRefId,
} from './windowTopk';

describe('windowTopk ref ids', () => {
  it('marks ranking probes so they are not plotted', () => {
    expect(windowTopkRefId('traffic_client.client')).toBe('traffic_client.client__window_topk');
    expect(isWindowTopkRefId('traffic_client.client__window_topk')).toBe(true);
    expect(isWindowTopkRefId('traffic_client.client')).toBe(false);
  });
});

describe('collectWindowTopkNames', () => {
  it('keeps the k highest totals and drops blank labels', () => {
    const names = collectWindowTopkNames(
      [
        { metric: { span_name: 'find message' }, points: [[1, 10]] },
        { metric: { span_name: 'find groupMember' }, points: [[1, 40]] },
        { metric: { span_name: '' }, points: [[1, 99]] },
        { metric: { span_name: 'find user' }, points: [[1, 30]] },
        { metric: { span_name: 'find admin' }, points: [[1, 20]] },
      ],
      'span_name',
      3,
    );
    expect(names).toEqual(['find groupMember', 'find user', 'find admin']);
  });
});

describe('injectLabelRegex', () => {
  const query = 'sum by (span_name) (rate(traces_span_metrics_calls_total{service_name="rome",span_kind=~"CLIENT"}[5m]))';

  it('pins the first selector to the ranked names', () => {
    expect(injectLabelRegex(query, 'span_name', ['find message', 'find user'])).toBe(
      'sum by (span_name) (rate(traces_span_metrics_calls_total{service_name="rome",span_kind=~"CLIENT",span_name=~"find message|find user"}[5m]))',
    );
  });

  it('escapes regex metacharacters in span names', () => {
    expect(injectLabelRegex(query, 'span_name', ['find turms-prod.message'])).toContain('span_name=~"find turms-prod\\\\.message"');
  });

  it('matches nothing when ranking is empty so the legend cannot grow', () => {
    expect(injectLabelRegex(query, 'span_name', [])).toContain('span_name=~"^$"');
  });

  it('leaves a query without a selector unchanged', () => {
    expect(injectFirstSelectorMatcher('up', 'span_name=~"a"')).toBe('up');
  });
});

describe('applyWindowTopkToRangeQueries', () => {
  const clientQuery = 'sum by (span_name) (rate(traces_span_metrics_calls_total{service_name="rome",span_kind=~"CLIENT"}[5m]))';

  it('rewrites only the ranked range query and leaves siblings alone', () => {
    const rewritten = applyWindowTopkToRangeQueries(
      [
        {
          batchRefId: 'traffic_client.client',
          query: clientQuery,
          windowTopk: {
            k: 2,
            by: 'span_name',
            rank: () => 'topk(2, sum by (span_name) (increase(x[1h])))',
          },
          windowTopkQuery: 'topk(2, sum by (span_name) (increase(x[1h])))',
        },
        { batchRefId: 'traffic_qps.qps', query: 'sum by (pod) (rate(http_count[5m]))' },
      ],
      [
        {
          refId: 'traffic_client.client__window_topk',
          series: [
            { metric: { span_name: 'find message' }, points: [[1, 80]] },
            { metric: { span_name: 'find user' }, points: [[1, 40]] },
            { metric: { span_name: 'find groupMember' }, points: [[1, 10]] },
          ],
        },
      ],
    );
    expect(rewritten).toEqual([
      {
        refId: 'traffic_client.client',
        query: 'sum by (span_name) (rate(traces_span_metrics_calls_total{service_name="rome",span_kind=~"CLIENT",span_name=~"find message|find user"}[5m]))',
      },
      { refId: 'traffic_qps.qps', query: 'sum by (pod) (rate(http_count[5m]))' },
    ]);
  });

  it('emits the ranking probe separately from plotted queries', () => {
    expect(
      windowTopkInstantQueries([
        { batchRefId: 'traffic_client.client', query: clientQuery, windowTopkQuery: 'topk(8, x)' },
        { batchRefId: 'traffic_qps.qps', query: 'up' },
      ]),
    ).toEqual([{ refId: 'traffic_client.client__window_topk', query: 'topk(8, x)' }]);
  });
});
