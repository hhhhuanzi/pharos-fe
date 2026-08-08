/**
 * Excel / WPS 会把以 = + - @ 以及 Tab / CR 开头的单元格当作公式求值。
 * 日志内容是完全不可信的输入（攻击者可以往被采集的应用里写一行
 * `=cmd|'/c calc'!A1` 然后等着别人导出并打开），因此必须中和。
 *
 * 中和方式：前缀一个单引号。Excel 会显示为纯文本且不显示这个引号；
 * 其它工具（pandas 等）读到的是多一个引号的字符串，可接受 —— 相比 RCE，
 * 这点保真度损失是划算的。OWASP CSV Injection 推荐做法。
 */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function sanitizeCsvCell(value: string): string {
  return FORMULA_PREFIX.test(value) ? `'${value}` : value;
}

/**
 * 非字符串值的统一文本化。
 * - null / undefined → ''（不是字符串 "null"）
 * - object / array   → JSON.stringify（嵌套字段在 CSV 里只能这样）
 * - 其它             → String(v)
 */
export function formatCellValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/** 单元格值 → CSV 字段：中和公式 → 转义双引号 → 整体加引号 */
export function toCsvField(value: unknown): string {
  const raw = formatCellValue(value);
  return `"${sanitizeCsvCell(raw).replaceAll('"', '""')}"`;
}

/** 一批行 → 一段 CSV 文本（不含表头，不含 BOM，末尾带 \r\n） */
export function rowsToCsvChunk(rows: Record<string, unknown>[], columns: string[]): string {
  return rows.map((row) => columns.map((col) => toCsvField(row[col])).join(',')).join('\r\n') + '\r\n';
}

/** 表头行（列名本身也要转义，字段名可能含逗号或引号） */
export function csvHeader(columns: string[]): string {
  return columns.map((col) => toCsvField(col)).join(',') + '\r\n';
}
