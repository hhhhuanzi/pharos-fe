// Mock 掉 @/utils/constant（依赖 import.meta.env，jest 无法解析），与
// src/components/BusinessGroup/__tests__/sideBarWithAll.test.ts 的既有模式一致
jest.mock('@/utils/constant', () => ({ DatasourceCateEnum: { elasticsearch: 'elasticsearch' } }));

import { DatasourceCateEnum } from '@/utils/constant';

import { buildExportFilename } from './filename';
import { LogExportAdapter, LogExportContext } from './types';

function buildCtx(overrides: Partial<LogExportContext> = {}): LogExportContext {
  return {
    cate: DatasourceCateEnum.elasticsearch,
    datasourceId: 1,
    datasourceName: 'prod-es',
    start: Date.parse('2026-08-08T10:00:00Z'),
    end: Date.parse('2026-08-08T11:00:00Z'),
    query: {},
    reverse: true,
    ...overrides,
  };
}

function buildAdapter(digest: string): LogExportAdapter {
  return {
    cate: DatasourceCateEnum.elasticsearch,
    rawKey: 'message',
    getMaxRows: jest.fn(),
    prepare: jest.fn(),
    fetchPage: jest.fn(),
    getQueryDigest: () => digest,
  };
}

describe('buildExportFilename', () => {
  it('replaces * in the index digest (e.g. filebeat-*)', () => {
    const filename = buildExportFilename(buildCtx(), buildAdapter('filebeat-*'), 'csv');
    expect(filename).not.toContain('*');
    expect(filename).toContain('filebeat-_');
  });

  it('replaces spaces with underscore but keeps Chinese characters', () => {
    const filename = buildExportFilename(buildCtx({ datasourceName: '测试 集群' }), buildAdapter('idx'), 'csv');
    expect(filename).toContain('测试_集群');
    expect(filename).not.toContain(' ');
  });

  it('replaces all illegal filesystem characters with underscore', () => {
    const filename = buildExportFilename(buildCtx(), buildAdapter('a/b\\c:d?e"f<g>h|i'), 'jsonl');
    expect(filename).not.toMatch(/[\\/:?"<>|]/);
  });

  it('collapses consecutive underscores into one', () => {
    const filename = buildExportFilename(buildCtx(), buildAdapter('a***b'), 'csv');
    expect(filename).not.toMatch(/_{2,}/);
  });

  it('truncates overly long filenames to 120 chars while keeping the extension', () => {
    const filename = buildExportFilename(buildCtx(), buildAdapter('x'.repeat(200)), 'raw');
    expect(filename.length).toBeLessThanOrEqual(120);
    expect(filename.endsWith('.log')).toBe(true);
  });

  it('uses the correct extension per format', () => {
    expect(buildExportFilename(buildCtx(), buildAdapter('idx'), 'csv').endsWith('.csv')).toBe(true);
    expect(buildExportFilename(buildCtx(), buildAdapter('idx'), 'jsonl').endsWith('.jsonl')).toBe(true);
    expect(buildExportFilename(buildCtx(), buildAdapter('idx'), 'raw').endsWith('.log')).toBe(true);
  });
});
