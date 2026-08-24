import type { IndexPatternCandidate } from './indexPattern';
import { buildServiceLogFilters, SERVICE_LOG_DEFAULT_RANGE } from './query';

export interface ServiceLogFormValues {
  datasourceCate: 'elasticsearch';
  datasourceValue: number;
  query: {
    mode: 'index-patterns';
    index_pattern: number;
    index: string;
    date_field: string;
    range: { start: string; end: string };
    filters: ReturnType<typeof buildServiceLogFilters>;
    query: string;
  };
  refreshFlag: string;
}

export function isUsableIndexPattern(pattern: IndexPatternCandidate | undefined): pattern is IndexPatternCandidate & {
  id: number;
  datasource_id: number;
  name: string;
} {
  return (
    pattern != null &&
    typeof pattern.id === 'number' &&
    Number.isInteger(pattern.id) &&
    pattern.id > 0 &&
    typeof pattern.datasource_id === 'number' &&
    Number.isInteger(pattern.datasource_id) &&
    pattern.datasource_id > 0 &&
    typeof pattern.name === 'string' &&
    pattern.name.trim() !== ''
  );
}

export function buildServiceLogFormValues(pattern: IndexPatternCandidate, service?: string): ServiceLogFormValues | undefined {
  if (!isUsableIndexPattern(pattern)) return undefined;
  const dateField = typeof pattern.time_field === 'string' && pattern.time_field.trim() ? pattern.time_field : '@timestamp';
  return {
    datasourceCate: 'elasticsearch',
    datasourceValue: pattern.datasource_id,
    query: {
      mode: 'index-patterns',
      index_pattern: pattern.id,
      index: pattern.name,
      date_field: dateField,
      range: { start: SERVICE_LOG_DEFAULT_RANGE.start, end: SERVICE_LOG_DEFAULT_RANGE.end },
      filters: buildServiceLogFilters(service),
      query: '',
    },
    refreshFlag: 'refreshFlag_service_embed',
  };
}
