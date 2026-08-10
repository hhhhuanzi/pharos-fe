// Mock 掉 @/utils/constant（依赖 import.meta.env，jest 无法解析），与
// src/dh/logExport/filename.test.ts 的既有模式一致
jest.mock('@/utils/constant', () => ({ DatasourceCateEnum: { elasticsearch: 'elasticsearch' } }));

import { DatasourceCateEnum } from '@/utils/constant';

import { resolveSourceFields } from './resolveSourceFields';
import { LogExportContext, LogExportFormValues } from './types';

const baseCtx: LogExportContext = {
  cate: DatasourceCateEnum.elasticsearch,
  datasourceId: 1,
  datasourceName: 'es-1',
  start: 0,
  end: 1,
  query: { index: 'k8s-pod-*', date_field: '@timestamp' },
  reverse: true,
} as const;

const baseValues: LogExportFormValues = {
  format: 'csv',
  rows: 10000,
  columns: [],
  allFields: false,
} as const;

describe('resolveSourceFields', () => {
  it('未勾选全部字段时，裁剪到用户手动选的列', () => {
    const values: LogExportFormValues = { ...baseValues, columns: ['@timestamp', 'message'] };
    expect(resolveSourceFields(values, baseCtx)).toEqual(['@timestamp', 'message']);
  });

  it('未勾选全部字段且列为空时，退回不裁剪（undefined）', () => {
    expect(resolveSourceFields(baseValues, baseCtx)).toBeUndefined();
  });

  it('勾选全部字段且有结果样本时，用样本字段作为 _source 白名单，而不是不裁剪', () => {
    const values: LogExportFormValues = { ...baseValues, allFields: true };
    const ctx: LogExportContext = { ...baseCtx, resultFields: ['@timestamp', 'message', 'kubernetes.pod_name'] };
    expect(resolveSourceFields(values, ctx)).toEqual(['@timestamp', 'message', 'kubernetes.pod_name']);
  });

  it('勾选全部字段但没有结果样本（undefined）时，退回不裁剪，保留原有兜底行为', () => {
    const values: LogExportFormValues = { ...baseValues, allFields: true };
    expect(resolveSourceFields(values, baseCtx)).toBeUndefined();
  });

  it('勾选全部字段但结果样本为空数组时，同样视为「没有样本」，退回不裁剪', () => {
    const values: LogExportFormValues = { ...baseValues, allFields: true };
    const ctx: LogExportContext = { ...baseCtx, resultFields: [] };
    expect(resolveSourceFields(values, ctx)).toBeUndefined();
  });

  it('勾选全部字段时，手动选择的列（columns）不影响取字段结果——resultFields 优先级更高', () => {
    const values: LogExportFormValues = { ...baseValues, allFields: true, columns: ['message'] };
    const ctx: LogExportContext = { ...baseCtx, resultFields: ['@timestamp', 'message', 'kubernetes.pod_name'] };
    expect(resolveSourceFields(values, ctx)).toEqual(['@timestamp', 'message', 'kubernetes.pod_name']);
  });

  it('jsonl 格式始终不裁剪，即使有结果样本也忽略（语义要求完整文档）', () => {
    const values: LogExportFormValues = { ...baseValues, format: 'jsonl', allFields: true };
    const ctx: LogExportContext = { ...baseCtx, resultFields: ['@timestamp', 'message'] };
    expect(resolveSourceFields(values, ctx)).toBeUndefined();
  });

  it('raw 格式始终不裁剪：rowsToRawChunk 需要把完整文档序列化为 JSON', () => {
    const values: LogExportFormValues = { ...baseValues, format: 'raw', allFields: true };
    const ctx: LogExportContext = { ...baseCtx, resultFields: ['@timestamp', 'log'] };
    expect(resolveSourceFields(values, ctx)).toBeUndefined();
  });
});
