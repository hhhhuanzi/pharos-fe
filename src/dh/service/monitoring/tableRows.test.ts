import {
  collectMonitoringJoinKeys,
  isWrappingTableColumn,
  joinKeyOf,
  MONITORING_TABLE_COMPACT_CELL_CLASS,
  MONITORING_TABLE_WRAP_CELL_CLASS,
  monitoringTableColumnWidth,
} from './tableRows';

const series = (metric: Record<string, string>) => ({ metric, points: [] as Array<[number, number]> });

describe('joinKeyOf', () => {
  it('prefers the pod label and only rewrites exported_instance when asked', () => {
    expect(joinKeyOf(series({ pod: 'svc-a' }), 'pod', false)).toBe('svc-a');
    expect(joinKeyOf(series({ exported_instance: 'pre-turms.svc-b.svc' }), 'pod', true)).toBe('svc-b');
    expect(joinKeyOf(series({ exported_instance: 'pre-turms.svc-b.svc' }), 'pod', false)).toBeUndefined();
  });
});

describe('collectMonitoringJoinKeys', () => {
  it('does not invent rows from cluster-wide JVM series', () => {
    const keys = collectMonitoringJoinKeys(
      [
        { target: { nameRewrite: undefined }, series: [series({ pod: 'turms-prod-1' })] },
        { target: { nameRewrite: 'exportedInstancePod' }, series: [series({ exported_instance: 'pre-turms.turms-pre-1.turms' })] },
      ],
      'pod',
    );

    expect(keys).toEqual(['turms-prod-1']);
  });
});

describe('isWrappingTableColumn', () => {
  it('wraps pod and node names and keeps short fields on one line', () => {
    expect(isWrappingTableColumn('pod')).toBe(true);
    expect(isWrappingTableColumn('node')).toBe(true);
    expect(isWrappingTableColumn('reason')).toBe(true);
    expect(isWrappingTableColumn('ip')).toBe(false);
    expect(isWrappingTableColumn('qos')).toBe(false);
    expect(isWrappingTableColumn('cpu')).toBe(false);
    expect(isWrappingTableColumn('jvm')).toBe(false);
  });
});

describe('monitoring table cell classes', () => {
  it('lets the user select text and wraps long names instead of ellipsizing', () => {
    expect(MONITORING_TABLE_WRAP_CELL_CLASS).toContain('select-text');
    expect(MONITORING_TABLE_WRAP_CELL_CLASS).toContain('break-all');
    expect(MONITORING_TABLE_WRAP_CELL_CLASS).toContain('whitespace-normal');
    expect(MONITORING_TABLE_WRAP_CELL_CLASS).not.toContain('truncate');
    expect(MONITORING_TABLE_WRAP_CELL_CLASS).not.toContain('ellipsis');
    expect(MONITORING_TABLE_COMPACT_CELL_CLASS).toContain('whitespace-nowrap');
    expect(MONITORING_TABLE_COMPACT_CELL_CLASS).toContain('select-text');
  });
});

describe('monitoringTableColumnWidth', () => {
  it('hugs short fields and caps wrap columns so a long node name wraps in full', () => {
    const node = 'gke-trade-prod-linux-common-16c64g-sg-b84a2f3c-abcd';
    const nodeWidth = monitoringTableColumnWidth('node', '节点', [node]);
    expect(nodeWidth).toBeLessThanOrEqual(360);
    expect(nodeWidth).toBeGreaterThanOrEqual(168);

    const ipWidth = monitoringTableColumnWidth('ip', 'Pod IP', ['10.20.30.40']);
    expect(ipWidth).toBeGreaterThanOrEqual(72);
    expect(ipWidth).toBeLessThan(168);
  });
});
