import { LOG_SERVICE_FIELD } from '@/dh/service/constants';

import { buildServiceLogFilters, SERVICE_LOG_DEFAULT_RANGE } from './query';

describe('SERVICE_LOG_DEFAULT_RANGE', () => {
  it('defaults the service logs tab to the last 15 minutes', () => {
    expect(SERVICE_LOG_DEFAULT_RANGE).toEqual({ start: 'now-15m', end: 'now' });
  });
});

describe('buildServiceLogFilters', () => {
  it('writes one Explorer AND filter on the container field', () => {
    expect(buildServiceLogFilters('turms-business-service')).toEqual([
      { key: LOG_SERVICE_FIELD, value: 'turms-business-service', operator: 'AND' },
    ]);
    expect(LOG_SERVICE_FIELD).toBe('kubernetes.container_name');
  });

  it('returns empty when the service name is missing', () => {
    expect(buildServiceLogFilters(undefined)).toEqual([]);
    expect(buildServiceLogFilters('  ')).toEqual([]);
  });
});
