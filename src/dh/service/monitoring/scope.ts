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
 * Pick the scope to query. Preferred cluster + namespace come from the page environment.
 * Namespace is a real matcher for kube-state / cadvisor, so an exact pair must beat a
 * same-cluster different-namespace option (prod `turms` vs pre `pre-turms`).
 */
export function resolveScopeOption(options: MonitoringScopeOption[], preferred: PreferredScope = {}): MonitoringScopeOption | undefined {
  if (!options.length) {
    if (!preferred.cluster) return undefined;
    return preferred.namespace ? { cluster: preferred.cluster, namespace: preferred.namespace } : { cluster: preferred.cluster };
  }
  if (preferred.cluster) {
    const exact = options.find((option) => option.cluster === preferred.cluster && (!preferred.namespace || option.namespace === preferred.namespace));
    if (exact) return exact;
    const byCluster = options.find((option) => option.cluster === preferred.cluster);
    if (byCluster) return byCluster;
  }
  return options[0];
}
