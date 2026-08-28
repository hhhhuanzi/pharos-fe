import { LOG_SERVICE_FIELD } from '@/dh/service/constants';

import { buildServiceLogFormValues, isUsableIndexPattern } from './resolve';

describe('isUsableIndexPattern', () => {
  it('requires a positive id, datasource and non-empty name', () => {
    expect(isUsableIndexPattern({ id: 3, datasource_id: 1, name: 'turms-test*' })).toBe(true);
    expect(isUsableIndexPattern({ id: 0, datasource_id: 1, name: 'turms-test*' })).toBe(false);
    expect(isUsableIndexPattern({ id: 3, datasource_id: 1, name: '' })).toBe(false);
    expect(isUsableIndexPattern(undefined)).toBe(false);
  });
});

describe('buildServiceLogFormValues', () => {
  it('embeds the matched pattern and a default service filter', () => {
    const values = buildServiceLogFormValues(
      { id: 3, datasource_id: 7, name: 'turms-test*', time_field: '@timestamp' },
      'turms-business-service',
    );
    expect(values).toMatchObject({
      datasourceCate: 'elasticsearch',
      datasourceValue: 7,
      query: {
        mode: 'index-patterns',
        index_pattern: 3,
        index: 'turms-test*',
        date_field: '@timestamp',
        range: { start: 'now-15m', end: 'now' },
        filters: [{ key: LOG_SERVICE_FIELD, value: 'turms-business-service', operator: 'AND' }],
        query: '',
      },
      refreshFlag: 'refreshFlag_service_embed',
    });
  });

  it('returns undefined when the pattern cannot drive Explorer', () => {
    expect(buildServiceLogFormValues({ name: 'turms-test*' }, 'svc')).toBeUndefined();
  });
});
