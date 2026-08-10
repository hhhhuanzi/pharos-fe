import { Field } from '@/pages/logExplorer/types';

import flattenLogFields from './flattenLogFields';
import groupFields, { hasResultInfo } from './groupFields';
import getRecommendedRank from './recommendedFields';

const toFields = (names: readonly string[]): Field[] => names.map((field) => ({ field, indexable: true, type: 'string' }));

const MAPPING = [
  '@timestamp',
  'jsonPayload.dest_google_service.connectivity',
  'jsonPayload.dest_google_service.service_name',
  'jsonPayload.dest_instance.project_id',
  'kubernetes.namespace_name',
  'kubernetes.pod_name',
  'log',
  'message',
] as const;

describe('getRecommendedRank', () => {
  it('命中时间/正文/容器等常见字段', () => {
    expect(getRecommendedRank('@timestamp')).toBeDefined();
    expect(getRecommendedRank('log')).toBeDefined();
    expect(getRecommendedRank('kubernetes.pod_name')).toBeDefined();
  });

  it('不命中业务嵌套字段', () => {
    expect(getRecommendedRank('jsonPayload.dest_instance.project_id')).toBeUndefined();
    expect(getRecommendedRank('jsonPayload.dest_google_service.connectivity')).toBeUndefined();
  });

  it('同样命中词表时浅路径排在深路径前面', () => {
    expect(getRecommendedRank('log')!).toBeLessThan(getRecommendedRank('jsonPayload.nested.log')!);
  });
});

describe('flattenLogFields', () => {
  it('展平嵌套对象为叶子路径，并跳过官方注入的内部字段', () => {
    const logs = [
      {
        __n9e_id_n9e__: 'log_id_1',
        __n9e_raw_n9e__: {
          '@timestamp': '2026-08-08T00:00:00Z',
          kubernetes: { pod_name: 'api-0', labels: { app: 'api' } },
          log: 'hello',
        },
      },
    ];
    expect(flattenLogFields(logs, { rawKey: '__n9e_raw_n9e__' })).toEqual(['@timestamp', 'kubernetes.labels.app', 'kubernetes.pod_name', 'log']);
  });

  it('null 值不算存在，数组字段本身算存在', () => {
    expect(flattenLogFields([{ a: null, b: ['x', 'y'] }])).toEqual(['b']);
  });
});

describe('hasResultInfo', () => {
  it('undefined 或空数组都算「还没有结果信息」', () => {
    expect(hasResultInfo(undefined)).toBe(false);
    expect(hasResultInfo([])).toBe(false);
  });

  it('非空数组算「已有结果信息」', () => {
    expect(hasResultInfo(['message'])).toBe(true);
  });
});

describe('groupFields', () => {
  it('没有结果信息时不产生空字段分组，行为退回官方两组', () => {
    const groups = groupFields({ fields: toFields(MAPPING) });
    expect(groups.empty).toHaveLength(0);
    expect(groups.selected).toHaveLength(0);
    expect(groups.popular.concat(groups.available)).toHaveLength(MAPPING.length);
  });

  it('结果样本为空数组时同样退回官方两组（而不是把所有字段判成空字段）', () => {
    const groups = groupFields({ fields: toFields(MAPPING), resultFields: [] });
    expect(groups.empty).toHaveLength(0);
    expect(groups.popular.concat(groups.available)).toHaveLength(MAPPING.length);
  });

  it('把结果里没有值的字段收进空字段分组', () => {
    const groups = groupFields({
      fields: toFields(MAPPING),
      resultFields: ['@timestamp', 'kubernetes.pod_name', 'log'],
    });
    expect(groups.empty.map((item) => item.field)).toEqual([
      'jsonPayload.dest_google_service.connectivity',
      'jsonPayload.dest_google_service.service_name',
      'jsonPayload.dest_instance.project_id',
      'kubernetes.namespace_name',
      'message',
    ]);
  });

  it('叶子路径的祖先前缀也算有值，避免 object 类型字段被误判为空', () => {
    const groups = groupFields({
      fields: toFields(['kubernetes'] as const),
      resultFields: ['kubernetes.pod_name'],
    });
    expect(groups.empty).toHaveLength(0);
    expect(groups.available.concat(groups.popular).map((item) => item.field)).toEqual(['kubernetes']);
  });

  it('常用字段按「用户频次优先、其次内置推荐」排序并置顶', () => {
    const groups = groupFields({
      fields: toFields(MAPPING),
      popularCounts: { 'jsonPayload.dest_instance.project_id': 3 },
      resultFields: ['@timestamp', 'jsonPayload.dest_instance.project_id', 'kubernetes.pod_name', 'log'],
    });
    expect(groups.popular.map((item) => item.field)).toEqual(['jsonPayload.dest_instance.project_id', '@timestamp', 'log', 'kubernetes.pod_name']);
    expect(groups.available.map((item) => item.field)).toEqual([]);
  });

  it('已选字段按表格列顺序而不是字母序排列，且不重复出现在其他分组', () => {
    const groups = groupFields({
      fields: toFields(MAPPING),
      organizeFieldNames: ['message', '@timestamp'],
      resultFields: ['@timestamp', 'log', 'message'],
    });
    expect(groups.selected.map((item) => item.field)).toEqual(['message', '@timestamp']);
    expect(groups.popular.map((item) => item.field)).toEqual(['log']);
  });

  it('常用字段分组有数量上限', () => {
    const groups = groupFields({
      fields: toFields(MAPPING),
      popularCounts: { message: 1, log: 1 },
      popularGroupMax: 1,
    });
    expect(groups.popular).toHaveLength(1);
  });
});
