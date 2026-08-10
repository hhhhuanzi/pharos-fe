const CHARS_PER_MB = 1024 * 1024;

/**
 * 累计字符数 → 展示用体积。
 *
 * 注意这是【近似值】：我们统计的是写入 `parts[]` 的 UTF-16 字符数，而文件是 UTF-8。
 * 纯 ASCII 日志 1 字符 = 1 字节，估得很准；中文日志 1 字符 = 3 字节，实际文件会更大。
 * 之所以仍按字符数统计，是因为它是唯一能在不额外编码一遍的前提下 O(1) 拿到的量
 * （每批算一次 `TextEncoder.encode().length` 会把整批数据再编码一遍，成本翻倍）。
 */
export function formatChars(chars: number): string {
  if (chars <= 0) return '0 KB';
  const mb = chars / CHARS_PER_MB;
  // 不足 1 KB 也显示 1 KB：已经写进去了，报 0 会让人以为什么都没发生
  if (mb < 1) return `${Math.max(1, Math.round(chars / 1024))} KB`;
  return `${mb.toFixed(1)} MB`;
}

/** 闸门、警告线这类整数阈值的展示：不带小数，避免出现「300.0 MB」这种噪音 */
export function formatCharsLimit(chars: number): string {
  return `${Math.round(chars / CHARS_PER_MB)} MB`;
}
