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
    unit: 'percentUnit',
    // Real utilization, not an error rate: a coarse ladder (10 / 25 / 50 / 100%) keeps the axis
    // from re-scaling on every refresh, and a busy node still lands on a 0–100% axis.
    yAxis: 'utilization',
    span: 12,
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
    unit: 'percentUnit',
    yAxis: 'utilization',
    span: 12,
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
    unit: 'percentUnit',
    yAxis: 'utilization',
    span: 12,
    targets: [
      {
        refId: 'disk',
        nameLabels: ['node'],
        build: (scope) => {
          // Root filesystem only. `min by (node)` across every mount hid which disk was full.
          const extra = ['fstype!~"tmpfs|overlay"', 'mountpoint="/"'];
          const avail = instanceToNode(`node_filesystem_avail_bytes${clusterMatcher(scope, extra)}`);
          const size = instanceToNode(`node_filesystem_size_bytes${clusterMatcher(scope, extra)}`);
          return withNodeJoin(`1 - min by (node) (${avail} / ${size})`, scope);
        },
      },
    ],
  };
}

/**
 * node-exporter counters, same join as CPU / memory / disk. Loopback is excluded; other devices
 * are summed per node so one in / one out line stays aligned with the other node panels.
 * Out is negated so the axis is symmetric around 0 (in up, out down).
 */
function networkPanel(): MonitoringPanelDef {
  return {
    id: 'node_network',
    titleKey: 'monitoring.panel.node_network',
    unit: 'bytesPerSecond',
    yAxis: 'signed',
    span: 12,
    targets: [
      {
        refId: 'receive',
        nameLabels: ['node'],
        nameKey: 'monitoring.legend.in',
        build: (scope, rateWindow) => {
          const receive = instanceToNode(`rate(node_network_receive_bytes_total${clusterMatcher(scope, ['device!="lo"'])}[${rateWindow}])`);
          return withNodeJoin(`sum by (node) (${receive})`, scope);
        },
      },
      {
        refId: 'transmit',
        nameLabels: ['node'],
        nameKey: 'monitoring.legend.out',
        build: (scope, rateWindow) => {
          const transmit = instanceToNode(`rate(node_network_transmit_bytes_total${clusterMatcher(scope, ['device!="lo"'])}[${rateWindow}])`);
          return withNodeJoin(`-sum by (node) (${transmit})`, scope);
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
  panels: [cpuPanel(), memoryPanel(), diskPanel(), networkPanel()],
};
