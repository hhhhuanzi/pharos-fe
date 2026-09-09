import { buildPromRatio } from '../series';
import type { MonitoringYAxisMode } from './axis';
import type { MonitoringSeriesReference } from './chartTheme';
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
  /**
   * Marks the series as something the measured ones are compared *against* rather than one of
   * them: chrome grey, dashed, no palette slot, no area fill. See `MonitoringSeriesReference`.
   */
  reference?: MonitoringSeriesReference;
  /** Solid All stroke on a mixed All + per-pod plot. Dropped when only one peer arrived. */
  emphasis?: 'all';
  /** Instant vector at range end. Stats / tables default to this; charts stay range queries. */
  instant?: boolean;
  /** How to collapse a matrix into one number for a stat card. */
  reduce?: MonitoringReduce;
  /**
   * What an empty result means for *this* query. An empty result is not automatically a missing
   * sample: see `absent: 'zero'` below.
   *
   * - `uninstrumented`: the series only exists once the service is instrumented, so no series means
   *   no instrumentation. RED metrics use this.
   * - `zero`: the series only exists once the event has happened at least once, so no series means
   *   it never happened — the reading is a real 0, graded like any other 0.
   * - `dash` (default): the exporter should always be publishing this, so no series means we failed
   *   to collect it. Genuinely unknown.
   */
  absent?: MonitoringAbsentMode;
  /**
   * Only read when `absent: 'zero'`. RefId of a sibling target in the same panel that proves the
   * exporter behind this query is actually being scraped: same exporter, same label matcher, but a
   * series that exists whether or not anything happened. If that sibling is empty too, nothing
   * about this container is being reported, so "it never happened" would be a guess and the em
   * dash is the honest answer.
   */
  absentZeroRequires?: string;
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
  /** Y-axis strategy; defaults to the unit's natural mode (see `axis.ts`). */
  yAxis?: MonitoringYAxisMode;
  /** antd grid span within a 24-column row. Charts stay at 12 (two per row); stats may use 8. */
  span: number;
  /**
   * Build an All series by summing every target series at the same timestamp. Used when All is
   * additive (QPS). Ratios and quantiles must query All separately — they do not sum.
   */
  deriveAll?: 'sum';
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
        reference: 'budget',
        build: (scope) => `max(kube_pod_container_resource_requests${containerMatcher(scope, ['resource="cpu"'])})`,
      },
      {
        refId: 'limit',
        nameKey: 'monitoring.legend.limit',
        reference: 'ceiling',
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
        reference: 'budget',
        build: (scope) => `max(kube_pod_container_resource_requests${containerMatcher(scope, ['resource="memory"'])})`,
      },
      {
        refId: 'limit',
        nameKey: 'monitoring.legend.limit',
        reference: 'ceiling',
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

/**
 * Reading order is symptom → cause, then outwards from the service: the summary, the request side
 * that tells you whether anything is actually wrong (RED), then the candidate causes in the order
 * a service owner rules them out — are the instances up (replicas), are they starved (workload),
 * is the runtime itself struggling (JVM), is the machine underneath dragging us down (node), is a
 * dependency to blame (middleware).
 *
 * The reverse (status → resource → traffic) was tried and reads backwards: it asks the reader to
 * study causes before knowing whether there is a symptom to explain.
 *
 * Sections that are routinely empty sit at the end so an uninstrumented service does not open on a
 * blank panel: JVM is empty without a Java probe, middleware is empty for everyone this period.
 */
export const MONITORING_SECTIONS: MonitoringSectionDef[] = [SUMMARY_SECTION, TRAFFIC_SECTION, REPLICAS_SECTION, WORKLOAD_SECTION, JVM_SECTION, NODE_SECTION, MIDDLEWARE_SECTION];

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
export function buildSectionQueries(section: MonitoringSectionDef, scope: MonitoringScope, rateWindow: string, rangeWindow = '1h'): MonitoringSectionQuery[] {
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
