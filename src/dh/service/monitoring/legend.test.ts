import { isolateLegendName, isLegendNameHidden, resolveMonitoringSeriesName, shouldIsolateLegendClick, snapshotLegendSelection } from './legend';

describe('isolateLegendName', () => {
  it('isolates the clicked series instead of hiding it', () => {
    expect(isolateLegendName(undefined, 'All')).toBe('All');
    expect(isLegendNameHidden('All', 'All')).toBe(false);
    expect(isLegendNameHidden('All', 'pod-a')).toBe(true);
  });

  it('restores every series when the isolated row is clicked again', () => {
    expect(isolateLegendName('All', 'All')).toBeUndefined();
  });

  it('switches isolate when another row is clicked', () => {
    expect(isolateLegendName('All', 'pod-a')).toBe('pod-a');
    expect(isLegendNameHidden('pod-a', 'All')).toBe(true);
    expect(isLegendNameHidden('pod-a', 'pod-a')).toBe(false);
  });

  it('shows every series when nothing is isolated', () => {
    expect(isLegendNameHidden(undefined, 'All')).toBe(false);
    expect(isLegendNameHidden(undefined, 'pod-a')).toBe(false);
  });
});

describe('shouldIsolateLegendClick', () => {
  it('isolates a plain click with no selection', () => {
    expect(shouldIsolateLegendClick(null)).toBe(true);
    expect(shouldIsolateLegendClick({ isCollapsed: true, text: '', intersectsRow: false })).toBe(true);
  });

  it('does not isolate after the user drag-selects text in the row', () => {
    expect(shouldIsolateLegendClick({ isCollapsed: false, text: 'turms-business-service-7c7d568c44-9g5v2', intersectsRow: true })).toBe(false);
  });

  it('still isolates when the selection is outside the row', () => {
    expect(shouldIsolateLegendClick({ isCollapsed: false, text: 'elsewhere', intersectsRow: false })).toBe(true);
  });
});

describe('snapshotLegendSelection', () => {
  const inside = 'inside' as unknown as Node;
  const row = { contains: (node: Node | null) => node === inside } as Node;

  it('returns null when the document has no selection', () => {
    expect(snapshotLegendSelection(row, null)).toBeNull();
  });

  it('records a drag-select that intersects the row', () => {
    const selection = {
      isCollapsed: false,
      toString: () => 'turms-business-service-7c7d568c44-9g5v2',
      anchorNode: inside,
      focusNode: inside,
    } as Selection;

    expect(snapshotLegendSelection(row, selection)).toEqual({
      isCollapsed: false,
      text: 'turms-business-service-7c7d568c44-9g5v2',
      intersectsRow: true,
    });
  });
});

describe('resolveMonitoringSeriesName', () => {
  it('keeps a status-code series and drops one that has no status label', () => {
    expect(resolveMonitoringSeriesName({ http_response_status_code: '200' }, ['http_response_status_code'], undefined, undefined, 'HTTP 状态码 QPS')).toBe('200');
    expect(resolveMonitoringSeriesName({}, ['http_response_status_code'], undefined, undefined, 'HTTP 状态码 QPS')).toBeUndefined();
  });

  it('uses the panel title only when the query never asked for labels', () => {
    expect(resolveMonitoringSeriesName({}, undefined, undefined, undefined, 'QPS')).toBe('QPS');
    expect(resolveMonitoringSeriesName({}, [], undefined, undefined, 'QPS')).toBe('QPS');
  });
});
