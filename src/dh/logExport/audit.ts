import request from '@/utils/request';
import { RequestMethod } from '@/store/common';

import { AUDIT_RECORD_PATH, MAX_AUDIT_FIELDS } from './constants';
import { LogExportRecordRequest, LogExportRecordResponse } from './types';

export class LogExportForbiddenError extends Error {
  constructor() {
    super('forbidden');
    this.name = 'LogExportForbiddenError';
  }
}

/**
 * fields 数组可能很长（「使用全部字段」时可达数百个）。审计中间件对
 * request_body 的截断（8192 字节）只是简单加 `...(truncated)`，会把 JSON
 * 截成非法串。前端必须在发送前自行限制，见 pharos-ops/HANDOFF-log-export.md §11.3。
 */
function clampAuditFields(fields: string[]): string[] {
  if (fields.length <= MAX_AUDIT_FIELDS) return fields;
  return [...fields.slice(0, MAX_AUDIT_FIELDS), `...(+${fields.length - MAX_AUDIT_FIELDS} more)`];
}

/**
 * 调用埋点接口。phase='start' 时 403 会 throw LogExportForbiddenError，调用方应终止导出；
 * 其它失败（网络抖动等）只 `console.warn`，返回 undefined —— 不阻断导出，
 * 理由见 pharos-ops/HANDOFF-log-export.md 决策点 4：审计中间件本身是异步落库的，
 * 埋点接口返回 200 也不保证已落库，为一个「假保证」牺牲可用性不划算。
 */
export async function recordLogExport(req: LogExportRecordRequest): Promise<LogExportRecordResponse | undefined> {
  const body: LogExportRecordRequest = { ...req, fields: clampAuditFields(req.fields) };
  try {
    const res = await request(AUDIT_RECORD_PATH, {
      method: RequestMethod.Post,
      data: body,
      headers: { 'Content-Type': 'application/json' },
      silence: true,
    });
    return res?.dat as LogExportRecordResponse | undefined;
  } catch (err: any) {
    if (err?.status === 403) {
      throw new LogExportForbiddenError();
    }
    console.warn('[dh/logExport] recordLogExport failed, export continues:', err);
    return undefined;
  }
}
