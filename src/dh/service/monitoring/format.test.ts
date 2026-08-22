import { formatMonitoringValue, monitoringSeriesName, shortExportedInstance } from './format';

describe('formatMonitoringValue', () => {
  it('renders missing values as an em dash rather than 0', () => {
    expect(formatMonitoringValue('cores', undefined)).toBe('—');
    expect(formatMonitoringValue('cores', null)).toBe('—');
    expect(formatMonitoringValue('bytes', NaN)).toBe('—');
    expect(formatMonitoringValue('percentUnit', 0)).toBe('0%');
  });

  it('keeps sub-core CPU readable', () => {
    expect(formatMonitoringValue('cores', 0.0117)).toBe('0.0117');
    expect(formatMonitoringValue('cores', 2.5)).toBe('2.5');
  });

  it('scales bytes on the IEC ladder', () => {
    expect(formatMonitoringValue('bytes', 512)).toBe('512 B');
    expect(formatMonitoringValue('bytes', 1024)).toBe('1 KiB');
    expect(formatMonitoringValue('bytes', 1024 * 1024 * 1005)).toBe('1005 MiB');
    expect(formatMonitoringValue('bytesPerSecond', 89)).toBe('89 B/s');
    expect(formatMonitoringValue('bytesPerSecond', 2048)).toBe('2 KiB/s');
  });

  it('renders ratios as percentages with more precision when small', () => {
    expect(formatMonitoringValue('percentUnit', 0.5)).toBe('50%');
    expect(formatMonitoringValue('percentUnit', 0.0123)).toBe('1.23%');
  });

  it('formats ops, counts, and latency without turning missing into 0', () => {
    expect(formatMonitoringValue('ops', 0.42)).toBe('0.42');
    expect(formatMonitoringValue('ops', 12.3)).toBe('12.3');
    expect(formatMonitoringValue('count', 3.2)).toBe('3');
    expect(formatMonitoringValue('milliseconds', 12.3)).toBe('12.3 ms');
    expect(formatMonitoringValue('milliseconds', 1500)).toBe('1.5 s');
    expect(formatMonitoringValue('seconds', 0.012)).toBe('12 ms');
    expect(formatMonitoringValue('ops', undefined)).toBe('—');
  });
});

describe('monitoringSeriesName', () => {
  it('names pod series by label', () => {
    expect(monitoringSeriesName({ pod: 'rome-sec-admin-f6448c9d6-lfbnc' }, ['pod'])).toBe('rome-sec-admin-f6448c9d6-lfbnc');
  });

  it('falls back to the static name for label-less threshold lines', () => {
    expect(monitoringSeriesName({}, ['pod'], 'limit')).toBe('limit');
  });

  it('combines labels with a static suffix', () => {
    expect(monitoringSeriesName({ pod: 'p-1' }, ['pod'], 'rx')).toBe('p-1 · rx');
  });

  it('describes remaining labels when nothing else identifies the series', () => {
    expect(monitoringSeriesName({ __name__: 'x', device: 'eth0' })).toBe('device=eth0');
    expect(monitoringSeriesName({})).toBe('');
  });

  it('shortens exported_instance to the pod segment', () => {
    expect(shortExportedInstance('rome-sec.rome-sec-admin-abc.rome-sec-admin')).toBe('rome-sec-admin-abc');
    expect(monitoringSeriesName({ exported_instance: 'rome-sec.rome-sec-admin-abc.rome-sec-admin' }, ['exported_instance'], undefined, 'exportedInstancePod')).toBe(
      'rome-sec-admin-abc',
    );
  });
});
