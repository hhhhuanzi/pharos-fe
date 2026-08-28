import { LOG_SERVICE_FIELD } from '@/dh/service/constants';

/** ExplorerNG `query.filters` 条目，与官方 Filter 对齐，不自造 DSL。 */
export interface ServiceLogFilter {
  key: string;
  value: string;
  operator: 'AND';
}

/** 服务下钻日志 Tab 首次打开默认最近 15 分钟；不影响全局 /log/explorer。 */
export const SERVICE_LOG_DEFAULT_RANGE = { start: 'now-15m', end: 'now' } as const;

export function buildServiceLogFilters(service?: string): ServiceLogFilter[] {
  const name = typeof service === 'string' ? service.trim() : '';
  if (!name) return [];
  return [{ key: LOG_SERVICE_FIELD, value: name, operator: 'AND' }];
}
