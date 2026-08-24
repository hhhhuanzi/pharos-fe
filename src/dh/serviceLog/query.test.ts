import { LOG_SERVICE_FIELD } from '@/dh/service/constants';

import { buildServiceLogFilters } from './query';

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
