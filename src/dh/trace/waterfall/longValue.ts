/** 低于这个规模的值在行内直接读就够了，不必多一个全屏入口。 */
export const MIN_LINES = 8;
export const MIN_CHARS = 1500;

/**
 * 行内摘要的规模。瀑布图的行高由虚拟列表按测量值钉死，摘要必须是有界的：
 * 3 行足够看出「这是个 MySQL 通信异常」还是「这是段 SQL」，字符数上限则用来
 * 兜住「整段 JSON 挤在一行、没有 \n」的情况。
 */
export const PREVIEW_LINES = 3;
export const PREVIEW_CHARS = 240;

const JSON_START = /^[[{]/;

export function isLongValue(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return value.length >= MIN_CHARS || value.split('\n').length >= MIN_LINES;
}

export function countLines(value: string): number {
  return value.split('\n').length;
}

export interface ValuePreview {
  text: string;
  truncated: boolean;
}

/** 行内摘要：先按行截断，再按字符截断，两道都过不了才是完整值。 */
export function previewValue(value: string, maxLines: number = PREVIEW_LINES, maxChars: number = PREVIEW_CHARS): ValuePreview {
  const lines = value.split('\n');
  let text = lines.slice(0, maxLines).join('\n');
  let truncated = lines.length > maxLines;
  if (text.length > maxChars) {
    text = text.slice(0, maxChars);
    truncated = true;
  }
  if (!truncated) {
    return { text, truncated: false };
  }
  return { text: `${text.replace(/\s+$/, '')}…`, truncated: true };
}

/** Modal 里展示的文本：整段是 JSON 对象/数组时缩进展开，其余原样。 */
export function formatFullValue(value: string): string {
  const trimmed = value.trim();
  if (!JSON_START.test(trimmed)) return value;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed !== null && typeof parsed === 'object') {
      return JSON.stringify(parsed, null, 2);
    }
  } catch (_) {
    return value;
  }
  return value;
}
