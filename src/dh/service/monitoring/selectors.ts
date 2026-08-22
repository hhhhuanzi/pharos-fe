import { escapePromLabel, escapePromRegex } from '../red';

/** cadvisor metric that carries both `cluster` and `container`; also the source of the pod set. */
export const CONTAINER_MEMORY_WORKING_SET = 'container_memory_working_set_bytes';

/**
 * Dashboard inputs are only `service_name` + `cluster` (PLAN-metrics-label-contract).
 * `namespace` may be shown in the toolbar; it is never a PromQL matcher — OTel's namespace
 * is the collector, and Pharos often has none.
 *
 * `service` here is the page's service_name. The K8s `service` label is a scrape target
 * (e.g. kubelet) and must not be used as a service filter.
 */
export interface MonitoringScope {
  service: string;
  cluster: string;
  /** Display-only. Matchers ignore it. */
  namespace?: string;
}

function eq(name: string, value: string): string {
  return `${name}="${escapePromLabel(value)}"`;
}

function braces(matchers: string[]): string {
  return `{${matchers.join(',')}}`;
}

/** Stage-0 encoding: cadvisor / kube-state-metrics have no `service_name`. DESIGN maps it to `container`. */
export function containerMatcher(scope: MonitoringScope, extra: string[] = []): string {
  return braces([eq('cluster', scope.cluster), eq('container', scope.service), ...extra]);
}

/** Stage-0 encoding: `kube_deployment_*` is keyed by `deployment`, not `service_name`. */
export function workloadMatcher(scope: MonitoringScope, extra: string[] = []): string {
  return braces([eq('cluster', scope.cluster), eq('deployment', scope.service), ...extra]);
}

/**
 * JVM / HTTP family. Scraped from the OTel collector: no `container`, and `namespace` / `pod`
 * name the collector. Stage 0 (PLAN: 前端暂用 exported_*) uses
 * `{cluster, exported_job=~".+/$service_name"}` — not `container=`, not business namespace.
 */
export function otelJobMatcher(scope: MonitoringScope, extra: string[] = []): string {
  const job = `exported_job=~"${escapePromLabel(`.+/${escapePromRegex(scope.service)}`)}"`;
  return braces([eq('cluster', scope.cluster), job, ...extra]);
}

/** Cluster only. Used with {@link podSetFilter} on families that have no service dimension. */
export function scopeMatcher(scope: MonitoringScope, extra: string[] = []): string {
  return braces([eq('cluster', scope.cluster), ...extra]);
}

/** RED family (spanmetrics). The only family that already carries the contract label. */
export function spanmetricsMatcher(scope: MonitoringScope, extra: string[] = []): string {
  return braces([eq('service_name', scope.service), ...extra]);
}

/** node_* / container_network_*: cluster plus extras, then intersect the pod set. */
export function clusterMatcher(scope: MonitoringScope, extra: string[] = []): string {
  return braces([eq('cluster', scope.cluster), ...extra]);
}

/**
 * Pod-set primitive for metrics that lack `container` (`container_network_*`, `kube_pod_info`,
 * the node join). Intersects on `pod` with a cadvisor series that does carry the stage-0
 * encoding of service_name. `pod=~"<service>-.*"` is forbidden: it collides with same-prefix
 * services and misses StatefulSets.
 */
export function podSetFilter(scope: MonitoringScope): string {
  return `and on (pod) (max by (pod) (${CONTAINER_MEMORY_WORKING_SET}${containerMatcher(scope)}))`;
}
