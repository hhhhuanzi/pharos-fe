import { formatHttpMethodRoute, formatMonitoringValue, monitoringSeriesName, shortExportedInstance } from './format';

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

  it('picks percentage decimals from the percentage, so sub-percent error rates keep a digit', () => {
    expect(formatMonitoringValue('percentUnit', 1)).toBe('100%');
    expect(formatMonitoringValue('percentUnit', 0.1)).toBe('10%');
    expect(formatMonitoringValue('percentUnit', 0.0999)).toBe('9.99%');
    expect(formatMonitoringValue('percentUnit', 0.008)).toBe('0.8%');
    expect(formatMonitoringValue('percentUnit', 0.00012)).toBe('0.012%');
    expect(formatMonitoringValue('percentUnit', 0.00008)).not.toBe(formatMonitoringValue('percentUnit', 0.00012));
  });

  it('keeps byte axis ceilings on exact IEC labels', () => {
    expect(formatMonitoringValue('bytes', 896 * 1024 * 1024)).toBe('896 MiB');
    expect(formatMonitoringValue('bytes', 2.5 * 1024 * 1024 * 1024)).toBe('2.5 GiB');
    expect(formatMonitoringValue('bytesPerSecond', 256 * 1024)).toBe('256 KiB/s');
  });

  it('switches latency units with the magnitude instead of pinning one suffix', () => {
    expect(formatMonitoringValue('milliseconds', 0)).toBe('0 ms');
    expect(formatMonitoringValue('milliseconds', 5.46)).toBe('5.46 ms');
    expect(formatMonitoringValue('milliseconds', 1260)).toBe('1.26 s');
  });

  it('drops QPS decimals as the rate grows', () => {
    expect(formatMonitoringValue('ops', 0.1)).toBe('0.1');
    expect(formatMonitoringValue('ops', 7.2)).toBe('7.2');
    expect(formatMonitoringValue('ops', 146)).toBe('146');
  });

  it('groups large counts and never shows a fractional replica or class', () => {
    expect(formatMonitoringValue('count', 15000)).toBe((15000).toLocaleString());
    expect(formatMonitoringValue('count', 0.9)).toBe('1');
    expect(formatMonitoringValue('count', 2)).toBe('2');
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

  it('names interface series from span_name, not Value', () => {
    expect(monitoringSeriesName({ span_name: 'GET /api/orders' }, ['span_name'])).toBe('GET /api/orders');
    expect(monitoringSeriesName({ http_route: '/api/orders' }, ['http_route'])).toBe('/api/orders');
    expect(monitoringSeriesName({ span_name: 'com.arena.rpc.sec.calendar.api.GetDate' }, ['span_name'])).not.toBe('Value');
  });

  it('does not invent the uPlot default Value when the requested label is missing', () => {
    expect(monitoringSeriesName({}, ['http_route'])).toBe('');
    expect(monitoringSeriesName({}, ['span_name'])).not.toBe('Value');
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

  it('joins HTTP method and route as POST /api/orders', () => {
    expect(formatHttpMethodRoute({ http_request_method: 'POST', http_route: '/api/orders' })).toBe('POST /api/orders');
    expect(monitoringSeriesName({ http_request_method: 'GET', http_route: '/health' }, ['http_request_method', 'http_route'], undefined, 'httpMethodRoute')).toBe('GET /health');
  });

  it('keeps method-only when http.route was never reported', () => {
    expect(formatHttpMethodRoute({ http_request_method: 'POST' })).toBe('POST');
    expect(formatHttpMethodRoute({})).toBe('');
  });

  it('shortens exported_instance to the pod segment', () => {
    expect(shortExportedInstance('rome-sec.rome-sec-admin-abc.rome-sec-admin')).toBe('rome-sec-admin-abc');
    expect(monitoringSeriesName({ exported_instance: 'rome-sec.rome-sec-admin-abc.rome-sec-admin' }, ['exported_instance'], undefined, 'exportedInstancePod')).toBe(
      'rome-sec-admin-abc',
    );
  });
});
