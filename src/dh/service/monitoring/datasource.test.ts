import { pickMonitoringDatasourceId } from './datasource';

// Ordered the way `groupedDatasourceList` delivers them: is_default first.
// Thanos id is whatever the env assigned — the picker must key off the name, not a baked-in 6.
const list = [
  { id: 4, name: 'embedded-tsdb' },
  { id: 99, name: 'thanos' },
] as const;

describe('pickMonitoringDatasourceId', () => {
  it('does not fall for the default embedded store', () => {
    expect(pickMonitoringDatasourceId([...list])).toBe(99);
  });

  it('honours a stored choice that still exists', () => {
    expect(pickMonitoringDatasourceId([...list], 4)).toBe(4);
    expect(pickMonitoringDatasourceId([...list], 6)).toBe(99);
  });

  it('prefers any non-embedded source when no name looks like a long-term store', () => {
    expect(pickMonitoringDatasourceId([{ id: 4, name: 'embedded-tsdb' }, { id: 7, name: 'prom-prod' }])).toBe(7);
  });

  it('still returns something when only the embedded store exists', () => {
    expect(pickMonitoringDatasourceId([{ id: 4, name: 'embedded-tsdb' }])).toBe(4);
    expect(pickMonitoringDatasourceId([])).toBeUndefined();
  });
});
