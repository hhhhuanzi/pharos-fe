export const LOG_CELL_MAX_LINES = 10;
export const LOG_CELL_LINE_HEIGHT_PX = 18;
export const LOG_CELL_PADDING_Y_PX = 8;
export const LOG_CELL_VIEW_ALL_HEIGHT_PX = 22;
export const LOG_CELL_MIN_HEIGHT_PX = 35;
/** 按 12px 字号估算换行，用于行高；真实是否溢出再由单元格测量校正 */
export const LOG_CELL_WRAP_CHARS = 100;

export function fieldValueToText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function countVisualLines(text: string, wrapChars = LOG_CELL_WRAP_CHARS): number {
  if (!text) return 1;
  const paragraphs = text.split(/\r\n|\r|\n/);
  let lines = 0;
  for (const paragraph of paragraphs) {
    lines += Math.max(1, Math.ceil(paragraph.length / wrapChars));
  }
  return lines;
}

export function shouldShowViewAll(text: string): boolean {
  return countVisualLines(text) > LOG_CELL_MAX_LINES;
}

export function estimateClampedRowHeight(row: Record<string, unknown>, fields: string[]): number {
  let maxLines = 1;
  for (const field of fields) {
    const lines = countVisualLines(fieldValueToText(row[field]));
    if (lines > maxLines) maxLines = lines;
  }
  const clampedLines = Math.min(LOG_CELL_MAX_LINES, maxLines);
  const extra = maxLines > LOG_CELL_MAX_LINES ? LOG_CELL_VIEW_ALL_HEIGHT_PX : 0;
  return Math.max(LOG_CELL_MIN_HEIGHT_PX, LOG_CELL_PADDING_Y_PX + clampedLines * LOG_CELL_LINE_HEIGHT_PX + extra);
}
