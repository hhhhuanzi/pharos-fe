import { buildPromRatio } from '../series';
import type { MonitoringNameRewrite, MonitoringUnit } from './format';
import { JVM_SECTION } from './sections/jvm';
import { MIDDLEWARE_SECTION } from './sections/middleware';
import { NODE_SECTION } from './sections/node';
import { REPLICAS_SECTION } from './sections/replicas';
import { SUMMARY_SECTION } from './sections/summary';
import { TRAFFIC_SECTION } from './sections/traffic';
import { clusterMatcher, containerMatcher, podSetFilter, CONTAINER_MEMORY_WORKING_SET, type MonitoringScope } from './selectors';
import type { MonitoringReduce } from './values';

export type MonitoringPanelKind = 'chart' | 'stat' | 'table' | 'empty';
export type MonitoringAbsentMode = 'uninstrumented' | 'zero' | 'dash';

export interface MonitoringTargetDef {
  /** Unique within its panel; the section prefixes it to build the batch refId. */
  refId: string;
  build: (scope: MonitoringScope, rateWindow: string, rangeWindow: string) => string;
  /** Metric labels used to name the series, in order. */
  nameLabels?: string[];
  /** i18n key for a label-less series name (threshold lines) or a suffix (direction). */
  nameKey?: string;
  nameRewrite?: MonitoringNameRewrite;
  /** Threshold lines are drawn dashed so they read as a reference, not as measured data. */
  dashed?: boolean;
  /** Instant vector at range end. Stats / tables default to this; charts stay range queries. */
  instant?: boolean;
  /** How to collapse a matrix into one number for a stat card. */
  reduce?: MonitoringReduce;
  /** Empty series: RED uses "未接入"; OOM uses 0; everything else uses an em dash. */
  absent?: MonitoringAbsentMode;
  /** Override the panel unit for mixed-unit stat cards. */
  unit?: MonitoringUnit;
  /** i18n key for a secondary stat metric or a table-adjacent label. */
  labelKey?: string;
}

export interface MonitoringTableColumn {
  id: string;
  titleKey: string;
  /** Metric label, `__value__` for the sample, or `__ratio__` for num/den. */
  source: string;
  refId?: string;
  numRefId?: string;
  denRefId?: string;
  unit?: MonitoringUnit;
}

export interface MonitoringPanelDef {
  id: string;
  titleKey: string;
  /** Extra explanation rendered as a tooltip on the panel title. */
  hintKey?: string;
  unit: MonitoringUnit;
  /** antd grid span within a 24-column row. */
  span: number;
  kind?: MonitoringPanelKind;
  /** First two targets render as `a / b` (ready replicas). */
  primaryAsPair?: boolean;
  joinLabel?: string;
  /** waiting-reason tables are one row per series; pod inventory joins several queries by label. */
  tableMode?: 'join' | 'series';
  columns?: MonitoringTableColumn[];
  tableEmptyKey?: string;
  emptyKey?: string;
  targets: MonitoringTargetDef[];
}

export interface MonitoringSectionDef {
  id: string;
  titleKey: string;
  /** Collapsed sections are not mounted, so they issue no queries until opened. */
  defaultOpen: boolean;
  /** Section-level empty copy (zone 6). No panels → no queries. */
  emptyKey?: string;
  /** When every panel in the section came back empty (JVM not instrumented). */
  fallbackEmptyKey?: string;
  panels: MonitoringPanelDef[];
}

function cpuPanel(): MonitoringPanelDef {
  return {
    id: 'container_cpu',
    titleKey: 'monitoring.panel.cpu',
    hintKey: 'monitoring.panel.cpu_hint',
    unit: 'cores',
    span: 12,
    targets: [
      {
        refId: 'usage',
        nameLabels: ['pod'],
        build: (scope, rateWindow) => `sum by (pod) (rate(container_cpu_usage_seconds_total${containerMatcher(scope)}[${rateWindow}]))`,
      },
      {
        refId: 'request',
        nameKey: 'monitoring.legend.request',
        dashed: true,
        build: (scope) => `max(kube_pod_container_resource_requests${containerMatcher(scope, ['resource="cpu"'])})`,
      },
      {
        refId: 'limit',
        nameKey: 'monitoring.legend.limit',
        dashed: true,
        build: (scope) => `max(kube_pod_container_resource_limits${containerMatcher(scope, ['resource="cpu"'])})`,
      },
    ],
  };
}

function cpuThrottlingPanel(): MonitoringPanelDef {
  return {
    id: 'container_cpu_throttling',
    titleKey: 'monitoring.panel.cpu_throttling',
    hintKey: 'monitoring.panel.cpu_throttling_hint',
    unit: 'percentUnit',
    span: 12,
    targets: [
      {
        refId: 'ratio',
        nameLabels: ['pod'],
        build: (scope, rateWindow) => {
          const throttled = `sum by (pod) (rate(container_cpu_cfs_throttled_periods_total${containerMatcher(scope)}[${rateWindow}]))`;
          const periods = `sum by (pod) (rate(container_cpu_cfs_periods_total${containerMatcher(scope)}[${rateWindow}]))`;
          return buildPromRatio(throttled, periods);
        },
      },
    ],
  };
}

function memoryPanel(): MonitoringPanelDef {
  return {
    id: 'container_memory',
    titleKey: 'monitoring.panel.memory',
    hintKey: 'monitoring.panel.memory_hint',
    unit: 'bytes',
    span: 12,
    targets: [
      {
        refId: 'working_set',
        nameLabels: ['pod'],
        build: (scope) => `sum by (pod) (${CONTAINER_MEMORY_WORKING_SET}${containerMatcher(scope)})`,
      },
      {
        refId: 'request',
        nameKey: 'monitoring.legend.request',
        dashed: true,
        build: (scope) => `max(kube_pod_container_resource_requests${containerMatcher(scope, ['resource="memory"'])})`,
      },
      {
        refId: 'limit',
        nameKey: 'monitoring.legend.limit',
        dashed: true,
        build: (scope) => `max(kube_pod_container_resource_limits${containerMatcher(scope, ['resource="memory"'])})`,
      },
    ],
  };
}

function networkPanel(): MonitoringPanelDef {
  // container_network_* has no `container` label, hence the pod-set primitive; `id!="/"` drops the
  // host interface series that cadvisor reports alongside the pod ones.
  const build = (metric: string) => (scope: MonitoringScope, rateWindow: string) =>
    `sum by (pod) (rate(${metric}${clusterMatcher(scope, ['id!="/"'])}[${rateWindow}]) ${podSetFilter(scope)})`;
  return {
    id: 'container_network',
    titleKey: 'monitoring.panel.network',
    hintKey: 'monitoring.panel.network_hint',
    unit: 'bytesPerSecond',
    span: 12,
    targets: [
      { refId: 'receive', nameLabels: ['pod'], nameKey: 'monitoring.legend.receive', build: build('container_network_receive_bytes_total') },
      { refId: 'transmit', nameLabels: ['pod'], nameKey: 'monitoring.legend.transmit', build: build('container_network_transmit_bytes_total') },
    ],
  };
}

/** Section 2 of the design doc: what the service itself consumes. */
export const WORKLOAD_SECTION: MonitoringSectionDef = {
  id: 'workload',
  titleKey: 'monitoring.section.workload',
  defaultOpen: true,
  panels: [cpuPanel(), cpuThrottlingPanel(), memoryPanel(), networkPanel()],
};

export const MONITORING_SECTIONS: MonitoringSectionDef[] = [
  SUMMARY_SECTION,
  TRAFFIC_SECTION,
  WORKLOAD_SECTION,
  REPLICAS_SECTION,
  JVM_SECTION,
  NODE_SECTION,
  MIDDLEWARE_SECTION,
];

export function batchRefId(panelId: string, targetRefId: string): string {
  return `${panelId}.${targetRefId}`;
}

export interface MonitoringSectionQuery extends MonitoringTargetDef {
  panelId: string;
  batchRefId: string;
  query: string;
  instant: boolean;
}

function targetIsInstant(panel: MonitoringPanelDef, target: MonitoringTargetDef): boolean {
  if (target.instant != null) return target.instant;
  return panel.kind === 'stat' || panel.kind === 'table';
}

/** Flattens a section into one batch payload, keeping the panel each query belongs to. */
export function buildSectionQueries(
  section: MonitoringSectionDef,
  scope: MonitoringScope,
  rateWindow: string,
  rangeWindow = '1h',
): MonitoringSectionQuery[] {
  return section.panels.flatMap((panel) =>
    panel.targets.map((target) => ({
      ...target,
      panelId: panel.id,
      batchRefId: batchRefId(panel.id, target.refId),
      query: target.build(scope, rateWindow, rangeWindow),
      instant: targetIsInstant(panel, target),
    })),
  );
}
