import type { MonitoringPanelDef, MonitoringSectionDef } from '../panels';
import { clusterMatcher, podSetFilter, scopeMatcher, type MonitoringScope } from '../selectors';

/**
 * node-exporter's `instance` is often `node:9100`; kube_pod_info carries `node`. Join on `node`
 * after stripping the port, rather than renaming kube_pod_info → instance (which misses `:9100`).
 */
function withNodeJoin(inner: string, scope: MonitoringScope): string {
  const pods = `max by (node) (kube_pod_info${scopeMatcher(scope)} ${podSetFilter(scope)})`;
  return `(${inner}) and on (node) (${pods})`;
}

function instanceToNode(expr: string): string {
  return `label_replace(${expr}, "node", "$1", "instance", "([^:]+).*")`;
}

function cpuPanel(): MonitoringPanelDef {
  return {
    id: 'node_cpu',
    titleKey: 'monitoring.panel.node_cpu',
    hintKey: 'monitoring.panel.node_hint',
    unit: 'percentUnit',
    span: 8,
    targets: [
      {
        refId: 'cpu',
        nameLabels: ['node'],
        build: (scope, rateWindow) => {
          const idle = instanceToNode(`rate(node_cpu_seconds_total${clusterMatcher(scope, ['mode="idle"'])}[${rateWindow}])`);
          return withNodeJoin(`1 - avg by (node) (${idle})`, scope);
        },
      },
    ],
  };
}

function memoryPanel(): MonitoringPanelDef {
  return {
    id: 'node_memory',
    titleKey: 'monitoring.panel.node_memory',
    hintKey: 'monitoring.panel.node_hint',
    unit: 'percentUnit',
    span: 8,
    targets: [
      {
        refId: 'memory',
        nameLabels: ['node'],
        build: (scope) => {
          const avail = instanceToNode(`node_memory_MemAvailable_bytes${clusterMatcher(scope)}`);
          const total = instanceToNode(`node_memory_MemTotal_bytes${clusterMatcher(scope)}`);
          return withNodeJoin(`1 - sum by (node) (${avail}) / sum by (node) (${total})`, scope);
        },
      },
    ],
  };
}

function diskPanel(): MonitoringPanelDef {
  return {
    id: 'node_disk',
    titleKey: 'monitoring.panel.node_disk',
    hintKey: 'monitoring.panel.node_hint',
    unit: 'percentUnit',
    span: 8,
    targets: [
      {
        refId: 'disk',
        nameLabels: ['node'],
        build: (scope) => {
          const extra = ['fstype!~"tmpfs|overlay"'];
          const avail = instanceToNode(`node_filesystem_avail_bytes${clusterMatcher(scope, extra)}`);
          const size = instanceToNode(`node_filesystem_size_bytes${clusterMatcher(scope, extra)}`);
          return withNodeJoin(`1 - min by (node) (${avail} / ${size})`, scope);
        },
      },
    ],
  };
}

/** Section 5: nodes that currently run this service's pods. No PSI. Default expanded. */
export const NODE_SECTION: MonitoringSectionDef = {
  id: 'node',
  titleKey: 'monitoring.section.node',
  defaultOpen: true,
  panels: [cpuPanel(), memoryPanel(), diskPanel()],
};
