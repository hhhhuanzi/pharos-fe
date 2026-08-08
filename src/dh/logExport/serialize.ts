import _ from 'lodash';

import { csvHeader, rowsToCsvChunk } from './csv';
import { ExportFormat, LogExportFormValues, LogRow } from './types';

/** LogsViewer 注入的内部字段，导出结果中不应出现 */
export const INTERNAL_KEYS = ['___id___', '___raw___', '__n9e_id_n9e__', '__n9e_raw_n9e__'];

/** JSONL：一行一个完整文档。剔除 LogsViewer 注入的内部字段 */
export function rowsToJsonlChunk(rows: LogRow[], internalKeys: string[] = INTERNAL_KEYS): string {
  return rows.map((row) => JSON.stringify(_.omit(row, internalKeys))).join('\n') + '\n';
}

/** 原始文本：只取 rawKey 指向的字段；该字段不存在时退回整行 JSON，避免输出空行 */
export function rowsToRawChunk(rows: LogRow[], rawKey: string): string {
  return (
    rows
      .map((row) => {
        const line = row[rawKey];
        return typeof line === 'string' ? line : JSON.stringify(row);
      })
      .join('\n') + '\n'
  );
}

/**
 * 计算实际用于 CSV 列头的列集合。
 * `allFields` 为 true 时以【首批】行的 key 并集为列（决策点 6）——
 * 全部拉完后再确定列需要把所有行留在内存里，会击穿内存预算，技术上不可行。
 */
export function resolveCsvColumns(firstBatchRows: LogRow[], values: LogExportFormValues): string[] {
  if (!values.allFields) return values.columns;
  const keys = new Set<string>();
  firstBatchRows.forEach((row) => {
    Object.keys(row).forEach((k) => {
      if (!INTERNAL_KEYS.includes(k)) keys.add(k);
    });
  });
  return Array.from(keys);
}

/** 按导出格式把一批行序列化为字符串片段（不含表头/BOM，由调用方在首批之前单独写入） */
export function makeChunk(rows: LogRow[], format: ExportFormat, columns: string[], rawKey: string): string {
  if (format === 'csv') return rowsToCsvChunk(rows, columns);
  if (format === 'jsonl') return rowsToJsonlChunk(rows);
  return rowsToRawChunk(rows, rawKey);
}

export function makeHeader(format: ExportFormat, columns: string[]): string {
  if (format !== 'csv') return '';
  return csvHeader(columns);
}
