import { isAutoQueryReady, hasUserEditedQuery } from './useAutoQueryOnReady';

describe('isAutoQueryReady', () => {
  it('数据源/索引/时间字段/时间范围全部就绪时返回 true', () => {
    expect(
      isAutoQueryReady({
        datasourceValue: 1,
        index: 'k8s-pod*',
        dateField: '@timestamp',
        range: { start: 'now-1h', end: 'now' },
      }),
    ).toBe(true);
  });

  it.each([
    ['datasourceValue', { index: 'k8s-pod*', dateField: '@timestamp', range: {} }],
    ['index', { datasourceValue: 1, dateField: '@timestamp', range: {} }],
    ['dateField', { datasourceValue: 1, index: 'k8s-pod*', range: {} }],
    ['range', { datasourceValue: 1, index: 'k8s-pod*', dateField: '@timestamp' }],
  ])('缺少 %s 时返回 false（模拟索引模式列表还没异步返回时的中间态）', (_name, input) => {
    expect(isAutoQueryReady(input)).toBe(false);
  });

  it('datasourceValue 为 0（合法但 falsy 的 id）时也认为未就绪——与 SideBarNav.tsx 里现有 `!!datasourceValue` 判断口径一致', () => {
    expect(isAutoQueryReady({ datasourceValue: 0, index: 'k8s-pod*', dateField: '@timestamp', range: {} })).toBe(false);
  });
});

describe('hasUserEditedQuery', () => {
  it('查询文本和过滤条件都为空时返回 false', () => {
    expect(hasUserEditedQuery({ queryText: '', filters: [] })).toBe(false);
    expect(hasUserEditedQuery({ queryText: undefined, filters: undefined })).toBe(false);
  });

  it('查询文本只有空白字符时视为未编辑，不阻断自动查询', () => {
    expect(hasUserEditedQuery({ queryText: '   ', filters: [] })).toBe(false);
  });

  it('查询文本非空时返回 true，避免自动查询覆盖用户还没提交的输入', () => {
    expect(hasUserEditedQuery({ queryText: 'status:error', filters: [] })).toBe(true);
  });

  it('已经添加过滤条件时返回 true，即使查询文本为空', () => {
    expect(hasUserEditedQuery({ queryText: '', filters: [{ key: 'level', operator: '=', value: 'error' }] })).toBe(true);
  });
});
