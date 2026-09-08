import { ENV_GROUP_LABEL } from '../constants';
import { escapePromLabel, escapePromRegex } from '../red';

/** cadvisor metric that carries both `cluster` and `container`; also the source of the pod set. */
export const CONTAINER_MEMORY_WORKING_SET = 'container_memory_working_set_bytes';

/**
 * Dashboard inputs are `service_name` + `cluster` (+ `namespace` / `env` when the page has them).
 * kube-state / cadvisor must bind `namespace` or same-named workloads in another ns (pre vs prod)
 * get summed together. OTel JVM / HTTP `namespace` is the collector — never the business ns.
 *
 * `service` here is the page's service_name. The K8s `service` label is a scrape target
 * (e.g. kubelet) and must not be used as a service filter.
 */
export interface MonitoringScope {
  service: string;
  cluster: string;
  /** K8s namespace. Matcher for cadvisor / kube-state; ignored by OTel / spanmetrics. */
  namespace?: string;
  /** spanmetrics `deployment_environment_name`. Ignored by K8s matchers. */
  env?: string;
}

function eq(name: string, value: string): string {
  return `${name}="${escapePromLabel(value)}"`;
}

function braces(matchers: string[]): string {
  return `{${matchers.join(',')}}`;
}

function k8sScope(scope: MonitoringScope): string[] {
  const matchers = [eq('cluster', scope.cluster)];
  if (scope.namespace) matchers.push(eq('namespace', scope.namespace));
  return matchers;
}

/** Stage-0 encoding: cadvisor / kube-state-metrics have no `service_name`. DESIGN maps it to `container`. */
export function containerMatcher(scope: MonitoringScope, extra: string[] = []): string {
  return braces([...k8sScope(scope), eq('container', scope.service), ...extra]);
}

/** Stage-0 encoding: `kube_deployment_*` is keyed by `deployment`, not `service_name`. */
export function workloadMatcher(scope: MonitoringScope, extra: string[] = []): string {
  return braces([...k8sScope(scope), eq('deployment', scope.service), ...extra]);
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

/** kube_pod_info and similar: cluster + business namespace when known. */
export function scopeMatcher(scope: MonitoringScope, extra: string[] = []): string {
  return braces([...k8sScope(scope), ...extra]);
}

/** RED family (spanmetrics). Env is the same slice the list row opened (URL `?env=`). */
export function spanmetricsMatcher(scope: MonitoringScope, extra: string[] = []): string {
  const matchers = [eq('service_name', scope.service)];
  if (scope.env) matchers.push(eq(ENV_GROUP_LABEL, scope.env));
  return braces([...matchers, ...extra]);
}

/**
 * node-exporter / container_network_*: cluster plus extras. Do not add business namespace —
 * node_* has none; network series are then intersected with {@link podSetFilter}.
 */
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
