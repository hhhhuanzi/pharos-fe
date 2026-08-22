import type { MonitoringPanelDef, MonitoringSectionDef } from '../panels';
import { containerMatcher, otelJobMatcher, podSetFilter, scopeMatcher, workloadMatcher, type MonitoringScope } from '../selectors';

function replicaTrendPanel(): MonitoringPanelDef {
  return {
    id: 'replicas_trend',
    titleKey: 'monitoring.panel.replicas',
    hintKey: 'monitoring.panel.replicas_hint',
    unit: 'count',
    span: 12,
    targets: [
      {
        refId: 'available',
        nameKey: 'monitoring.legend.available',
        build: (scope) => `sum(kube_deployment_status_replicas_available${workloadMatcher(scope)})`,
      },
      {
        refId: 'desired',
        nameKey: 'monitoring.legend.desired',
        dashed: true,
        build: (scope) => `sum(kube_deployment_spec_replicas${workloadMatcher(scope)})`,
      },
      {
        refId: 'unavailable',
        nameKey: 'monitoring.legend.unavailable',
        build: (scope) => `sum(kube_deployment_status_replicas_unavailable${workloadMatcher(scope)})`,
      },
    ],
  };
}

function restartsPanel(): MonitoringPanelDef {
  return {
    id: 'replicas_restarts',
    titleKey: 'monitoring.panel.restarts',
    hintKey: 'monitoring.panel.restarts_hint',
    unit: 'count',
    span: 12,
    targets: [
      {
        refId: 'restarts',
        nameLabels: ['pod'],
        build: (scope, rateWindow) => `sum by (pod) (increase(kube_pod_container_status_restarts_total${containerMatcher(scope)}[${rateWindow}]))`,
      },
    ],
  };
}

function waitingTable(): MonitoringPanelDef {
  return {
    id: 'replicas_waiting',
    titleKey: 'monitoring.panel.waiting',
    hintKey: 'monitoring.panel.waiting_hint',
    kind: 'table',
    unit: 'count',
    span: 24,
    joinLabel: 'pod',
    tableMode: 'series',
    tableEmptyKey: 'monitoring.table.waiting_empty',
    columns: [
      { id: 'pod', titleKey: 'monitoring.table.pod', source: 'pod' },
      { id: 'reason', titleKey: 'monitoring.table.reason', source: 'reason', refId: 'waiting' },
    ],
    targets: [
      {
        refId: 'waiting',
        nameLabels: ['pod', 'reason'],
        build: (scope) => `kube_pod_container_status_waiting_reason${containerMatcher(scope)} > 0`,
      },
    ],
  };
}

function cpuUsage(scope: MonitoringScope, rateWindow: string): string {
  return `sum by (pod) (rate(container_cpu_usage_seconds_total${containerMatcher(scope)}[${rateWindow}]))`;
}

function cpuLimit(scope: MonitoringScope): string {
  return `sum by (pod) (kube_pod_container_resource_limits${containerMatcher(scope, ['resource="cpu"'])})`;
}

function memUsage(scope: MonitoringScope): string {
  return `sum by (pod) (container_memory_working_set_bytes${containerMatcher(scope)})`;
}

function memLimit(scope: MonitoringScope): string {
  return `sum by (pod) (kube_pod_container_resource_limits${containerMatcher(scope, ['resource="memory"'])})`;
}

function podsTable(): MonitoringPanelDef {
  return {
    id: 'replicas_pods',
    titleKey: 'monitoring.panel.pods',
    hintKey: 'monitoring.panel.pods_hint',
    kind: 'table',
    unit: 'short',
    span: 24,
    joinLabel: 'pod',
    tableEmptyKey: 'monitoring.table.pods_empty',
    columns: [
      { id: 'pod', titleKey: 'monitoring.table.pod', source: 'pod' },
      { id: 'node', titleKey: 'monitoring.table.node', source: 'node', refId: 'info' },
      { id: 'ip', titleKey: 'monitoring.table.ip', source: 'pod_ip', refId: 'info' },
      { id: 'qos', titleKey: 'monitoring.table.qos', source: 'qos_class', refId: 'qos' },
      { id: 'cpu', titleKey: 'monitoring.table.cpu', source: '__value__', refId: 'cpu', unit: 'cores' },
      { id: 'cpu_water', titleKey: 'monitoring.table.cpu_water', source: '__ratio__', numRefId: 'cpu', denRefId: 'cpu_limit', unit: 'percentUnit' },
      { id: 'memory', titleKey: 'monitoring.table.memory', source: '__value__', refId: 'mem', unit: 'bytes' },
      { id: 'mem_water', titleKey: 'monitoring.table.mem_water', source: '__ratio__', numRefId: 'mem', denRefId: 'mem_limit', unit: 'percentUnit' },
      { id: 'jvm', titleKey: 'monitoring.table.jvm', source: '__value__', refId: 'jvm', unit: 'bytes' },
    ],
    targets: [
      {
        refId: 'info',
        build: (scope) => `kube_pod_info${scopeMatcher(scope)} ${podSetFilter(scope)}`,
      },
      {
        refId: 'qos',
        build: (scope) => `kube_pod_status_qos_class${scopeMatcher(scope)} ${podSetFilter(scope)}`,
      },
      {
        refId: 'cpu',
        build: (scope, rateWindow) => cpuUsage(scope, rateWindow),
      },
      {
        refId: 'cpu_limit',
        build: (scope) => cpuLimit(scope),
      },
      {
        refId: 'mem',
        build: (scope) => memUsage(scope),
      },
      {
        refId: 'mem_limit',
        build: (scope) => memLimit(scope),
      },
      {
        refId: 'jvm',
        nameLabels: ['exported_instance'],
        nameRewrite: 'exportedInstancePod',
        build: (scope) => `sum by (exported_instance) (jvm_memory_used_bytes${otelJobMatcher(scope, ['jvm_memory_type="heap"'])})`,
      },
    ],
  };
}

/** Section 3: replica trend, restarts, waiting reasons, per-pod inventory. */
export const REPLICAS_SECTION: MonitoringSectionDef = {
  id: 'replicas',
  titleKey: 'monitoring.section.replicas',
  defaultOpen: true,
  panels: [replicaTrendPanel(), restartsPanel(), waitingTable(), podsTable()],
};
