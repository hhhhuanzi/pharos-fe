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
 * from trace labels, so it is empty for services without trace data. Asking cadvisor
 * (stage-0 encoding: container = service_name) gives the clusters that actually have
 * this service's container metrics. Namespace is collected only for toolbar display.
 */
export function buildScopeDiscoveryQuery(service: string): string {
  return `count by (cluster, namespace) (${CONTAINER_MEMORY_WORKING_SET}{container="${escapePromLabel(service)}"})`;
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
 * Pick the scope to query. A preferred cluster wins when it actually has data; the preferred
 * namespace is only a tiebreaker, since dropping it still returns correct series (service names are
 * unique within a cluster).
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
