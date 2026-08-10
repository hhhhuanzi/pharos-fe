import _ from 'lodash';

import { csvHeader, rowsToCsvChunk, truncationMarker } from './csv';
import { MAX_CELL_CHARS } from './constants';
import { ExportFormat, LogExportFormValues, LogRow } from './types';

/** LogsViewer 注入的内部字段，导出结果中不应出现 */
export const INTERNAL_KEYS = ['___id___', '___raw___', '__n9e_id_n9e__', '__n9e_raw_n9e__'];

/**
 * 截断行内异常巨大的字段值，返回值与命中一次都没截断时的原始引用相等，
 * 调用方可以用 `result !== row` 零成本判断「这一行有没有发生截断」，不用额外传第二个返回值。
 *
 * 必须在 adapter 把 ES hit 展平成 `LogRow`之后、序列化成任何格式之前调用——
 * CSV / JSONL / 原始文本三种格式都从同一份 `LogRow[]` 出发，在这里统一截断，
 * 比在三个序列化函数里各写一遍更不容易漏，且能在 CSV 转义 / JSON.stringify 之前
 * 就把体积压下来，而不是等这些函数把大字符串又处理一遍之后才补救。
 *
 * 只处理字符串值：`flatten()` 已经把数组转成了 JSON 字符串（见 flatten.ts），
 * 因此「一个字段是超大数组」也会在这里被捕获；只有 maxDepth 截断处残留的裸对象
 * 引用不是字符串，这类值留给 `formatCellValue` 在真正 stringify 的时候兜底。
 */
export function guardRowValueSize(row: LogRow): LogRow {
  let mutated: LogRow | null = null;
  for (const key of Object.keys(row)) {
    const value = row[key];
    if (typeof value === 'string' && value.length > MAX_CELL_CHARS) {
      if (!mutated) mutated = { ...row };
      mutated[key] = value.slice(0, MAX_CELL_CHARS) + truncationMarker(value.length);
    }
  }
  return mutated ?? row;
}

/** JSONL：一行一个完整文档。剔除 LogsViewer 注入的内部字段 */
export function rowsToJsonlChunk(rows: LogRow[], internalKeys: string[] = INTERNAL_KEYS): string {
  return rows.map((row) => JSON.stringify(_.omit(row, internalKeys))).join('\n') + '\n';
}

/**
 * 原始日志：一行一个完整文档 JSON，不挑选任何正文字段。
 *
 * 这是用户两次明确确认后的产品定义，不要再按 `message`、`log` 等字段名做特殊处理。
 */
export function rowsToRawChunk(rows: LogRow[]): string {
  return rows.map((row) => JSON.stringify(row)).join('\n') + '\n';
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
export function makeChunk(rows: LogRow[], format: ExportFormat, columns: string[]): string {
  if (format === 'csv') return rowsToCsvChunk(rows, columns);
  if (format === 'jsonl') return rowsToJsonlChunk(rows);
  return rowsToRawChunk(rows);
}

export function makeHeader(format: ExportFormat, columns: string[]): string {
  if (format !== 'csv') return '';
  return csvHeader(columns);
}
