import moment from 'moment';

import { ExportFormat, LogExportAdapter, LogExportContext } from './types';

const EXT: Record<ExportFormat, string> = {
  csv: 'csv',
  jsonl: 'jsonl',
  raw: 'log',
};

/** ES 的 index 常含 `*`，Windows 下会导致下载失败，必须做非法字符替换 */
const ILLEGAL_CHARS = /[\\/:*?"<>|\s]/g;
const MAX_FILENAME_LENGTH = 120;

function sanitizeFilenamePart(part: string): string {
  return part.replace(ILLEGAL_CHARS, '_').replace(/_+/g, '_');
}

export function buildExportFilename(ctx: LogExportContext, adapter: LogExportAdapter, format: ExportFormat): string {
  const digest = adapter.getQueryDigest(ctx);
  const startStr = moment(ctx.start).format('YYYYMMDD-HHmm');
  const endStr = moment(ctx.end).format('YYYYMMDD-HHmm');
  const ext = EXT[format];

  const namePart = sanitizeFilenamePart(`${ctx.datasourceName}_${digest}_${startStr}_${endStr}`);
  const suffix = `.${ext}`;
  const maxNameLength = MAX_FILENAME_LENGTH - suffix.length;
  const truncated = namePart.length > maxNameLength ? namePart.slice(0, maxNameLength) : namePart;
  return `${truncated}${suffix}`;
}
