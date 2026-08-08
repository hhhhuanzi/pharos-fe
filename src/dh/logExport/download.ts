import { ExportFormat } from './types';

const MIME: Record<ExportFormat, string> = {
  csv: 'text/csv;charset=utf-8;',
  jsonl: 'application/x-ndjson;charset=utf-8;',
  raw: 'text/plain;charset=utf-8;',
};

/**
 * `Blob(parts: string[])` 逐段编码写入内部缓冲区，不需要调用方先拼成一个大字符串。
 * 先 `parts.join('')` 再 `new Blob([bigString])` 会让内存峰值翻倍，且 300MB 级的
 * 拼接容易直接撞上 V8 的字符串长度上限（`RangeError: Invalid string length`）。
 * 因此这里【不能】改成先 join 再传单元素数组。
 */
export function saveBlobParts(parts: string[], filename: string, format: ExportFormat): void {
  const blob = new Blob(parts, { type: MIME[format] });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // 仓库现有的 CSV 下载实现都漏了这一步，几十 MB 的 Blob 会一直挂在内存里直到页面卸载
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
