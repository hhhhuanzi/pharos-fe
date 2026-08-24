import { LOG_SERVICE_FIELD } from '@/dh/service/constants';

/** ExplorerNG `query.filters` 条目，与官方 Filter 对齐，不自造 DSL。 */
export interface ServiceLogFilter {
  key: string;
  value: string;
  operator: 'AND';
}

export const SERVICE_LOG_DEFAULT_RANGE = { start: 'now-24h', end: 'now' } as const;

export function buildServiceLogFilters(service?: string): ServiceLogFilter[] {
  const name = typeof service === 'string' ? service.trim() : '';
  if (!name) return [];
  return [{ key: LOG_SERVICE_FIELD, value: name, operator: 'AND' }];
}
