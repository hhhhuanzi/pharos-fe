import type { PromVectorSample } from '@/dh/trace/dependencies/promql';

import { escapePromLabel } from '../red';
import { CONTAINER_MEMORY_WORKING_SET } from './selectors';

export interface MonitoringScopeOption {
  cluster: string;
  namespace?: string;
}

export interface PreferredScope {
  cluster?: string;
  namespace?: string;
}

/**
 * Where the queryable cluster comes from. The cluster shown on the detail page is derived
 * from the current environment's association. Asking cadvisor (stage-0 encoding:
 * container = service_name) gives the cluster / namespace pairs that actually have
 * this service's container metrics, so the page can bind PromQL to the right ns.
 */
export function buildScopeDiscoveryQuery(service: string): string {
  return `count by (cluster, namespace) (${CONTAINER_MEMORY_WORKING_SET}{container="${escapePromLabel(service)}"})`;
}

/** Header env is set but association has not arrived — do not pick another env's cluster/ns. */
export function isMonitoringIdentityPending(env?: string, clusters?: string[]): boolean {
  return Boolean(env) && clusters == null;
}

export function scopeOptionKey(option: MonitoringScopeOption): string {
  return `${option.cluster}\u0000${option.namespace || ''}`;
}

export function parseScopeOptions(samples: PromVectorSample[]): MonitoringScopeOption[] {
  const byKey = new Map<string, MonitoringScopeOption>();
  samples.forEach((sample) => {
    const cluster = sample.metric?.cluster?.trim();
    if (!cluster) return;
    const namespace = sample.metric?.namespace?.trim();
    const option: MonitoringScopeOption = namespace ? { cluster, namespace } : { cluster };
    byKey.set(scopeOptionKey(option), option);
  });
  return Array.from(byKey.values()).sort((a, b) => a.cluster.localeCompare(b.cluster) || (a.namespace || '').localeCompare(b.namespace || ''));
}

/**
 * Collapse the page's cluster / namespace lists onto one preferred pair.
 *
 * Association often carries both the business labels and the scrape ones (`k8s-devops` /
 * `opentelemetry`). Requiring `length === 1` then dropped the preferred namespace and the
 * resolver fell through to the first discovered pair — frequently the other environment
 * on the same cluster (`pre-turms` before `turms`).
 */
export function pickPreferredScope(options: MonitoringScopeOption[], clusters?: string[], namespaces?: string[]): PreferredScope {
  const clusterList = (clusters || []).filter((item) => item.length > 0);
  const namespaceList = (namespaces || []).filter((item) => item.length > 0);

  const exact = options.find((option) => option.namespace != null && clusterList.includes(option.cluster) && namespaceList.includes(option.namespace));
  if (exact) return { cluster: exact.cluster, namespace: exact.namespace };

  const byNamespace = options.find((option) => option.namespace != null && namespaceList.includes(option.namespace));
  if (byNamespace) return { cluster: byNamespace.cluster, namespace: byNamespace.namespace };

  if (clusterList.length === 1 && namespaceList.length === 1) {
    return { cluster: clusterList[0], namespace: namespaceList[0] };
  }
  if (clusterList.length === 1) return { cluster: clusterList[0] };
  if (namespaceList.length === 1) return { namespace: namespaceList[0] };
  return {};
}

/**
 * Pick the scope to query. Preferred cluster + namespace come from the page environment.
 * Namespace is a real matcher for kube-state / cadvisor, so an exact pair must beat a
 * same-cluster different-namespace option (prod `turms` vs pre `pre-turms`).
 *
 * When the preferred namespace is missing or does not match discovery, do **not** fall back
 * to another namespace on the same cluster or to a cluster-only matcher: both mix pre and
 * prod pods. Empty is the honest answer.
 */
export function resolveScopeOption(options: MonitoringScopeOption[], preferred: PreferredScope = {}): MonitoringScopeOption | undefined {
  if (preferred.cluster && preferred.namespace) {
    const exact = options.find((option) => option.cluster === preferred.cluster && option.namespace === preferred.namespace);
    if (exact) return exact;
    const onCluster = options.filter((option) => option.cluster === preferred.cluster && Boolean(option.namespace));
    if (onCluster.length === 1) return onCluster[0];
    if (onCluster.length > 1) return undefined;
    const byNamespace = options.find((option) => option.namespace === preferred.namespace);
    if (byNamespace) return byNamespace;
    if (!options.length) return { cluster: preferred.cluster, namespace: preferred.namespace };
    return undefined;
  }

  if (!options.length) return undefined;

  if (preferred.namespace) {
    const byNamespace = options.find((option) => option.namespace === preferred.namespace);
    if (byNamespace) return byNamespace;
    return undefined;
  }

  if (preferred.cluster) {
    const namespaced = options.filter((option) => option.cluster === preferred.cluster && Boolean(option.namespace));
    if (namespaced.length === 1) return namespaced[0];
    return undefined;
  }

  const namespaced = options.filter((option) => Boolean(option.namespace));
  if (namespaced.length === 1) return namespaced[0];
  return undefined;
}
