import request from '@/utils/request';
import { RequestMethod } from '@/store/common';

export interface AuditLogItem {
  id: number;
  create_at: number;
  user_id: number;
  username: string;
  remote_addr: string;
  user_agent: string;
  method: string;
  path: string;
  object_type: string;
  object_id: string;
  action: string;
  module: string;
  action_label: string;
  request_body: string;
  status_code: number;
  risk_level: string;
}

export interface AuditLogListParams {
  p?: number;
  limit?: number;
  username?: string;
  object_type?: string;
  risk_level?: string;
  stime?: number;
  etime?: number;
  mine?: boolean;
}

export function getAuditLogs(params: AuditLogListParams) {
  return request('/api/n9e/audit-logs', {
    method: RequestMethod.Get,
    params,
  });
}
