import { getLogExplorerTarget, getLogTraceConfig } from '@/dh/logTrace/config';

import { LOG_CLUSTER_FIELD, LOG_EXPLORER_PATH, LOG_NAMESPACE_FIELD, LOG_SERVICE_FIELD, TRACE_CLUSTER_TAG, TRACE_EXPLORER_PATH, TRACE_NAMESPACE_TAG } from './constants';
import type { ServiceIdentity } from './url';

export function escapeEsQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function buildServiceLogQuery(identity: Pick<ServiceIdentity, 'service' | 'cluster' | 'namespace'>): string {
  const parts: string[] = [];
  if (identity.service) parts.push(`${LOG_SERVICE_FIELD}:"${escapeEsQueryValue(identity.service)}"`);
  if (identity.cluster) parts.push(`${LOG_CLUSTER_FIELD}:"${escapeEsQueryValue(identity.cluster)}"`);
  if (identity.namespace) parts.push(`${LOG_NAMESPACE_FIELD}:"${escapeEsQueryValue(identity.namespace)}"`);
  return parts.join(' AND ');
}

export function buildServiceTraceTags(identity: Pick<ServiceIdentity, 'cluster' | 'namespace'>): string {
  const parts: string[] = [];
  if (identity.cluster) parts.push(`${TRACE_CLUSTER_TAG}=${identity.cluster}`);
  if (identity.namespace) parts.push(`${TRACE_NAMESPACE_TAG}=${identity.namespace}`);
  return parts.join(' ');
}

/** Open the existing trace explorer with this service (and tags when we have them). */
export function buildServiceTraceDeepLink(identity: ServiceIdentity): string | null {
  if (!identity.service || identity.ds == null) return null;
  const search = new URLSearchParams({
    service: identity.service,
    datasourceValue: String(identity.ds),
    pluginType: 'jaeger',
  });
  const tags = buildServiceTraceTags(identity);
  if (tags) search.set('tags', tags);
  return `${TRACE_EXPLORER_PATH}?${search.toString()}`;
}

export function buildServiceLogDeepLink(identity: Pick<ServiceIdentity, 'service' | 'cluster' | 'namespace'>, target: { datasourceId: number; indexPattern?: number; index?: string }): string {
  const search = new URLSearchParams({
    data_source_name: 'elasticsearch',
    data_source_id: String(target.datasourceId),
    query: buildServiceLogQuery(identity),
    __execute__: 'true',
  });
  if (target.indexPattern != null) {
    search.set('index_pattern', String(target.indexPattern));
  } else if (target.index) {
    search.set('index', target.index);
  }
  return `${LOG_EXPLORER_PATH}?${search.toString()}`;
}

/** Same ES target as 链路 → 日志; missing config → null, caller warns, do not empty-jump. */
export function resolveServiceLogDeepLink(identity: Pick<ServiceIdentity, 'service' | 'cluster' | 'namespace'>): string | null {
  if (!identity.service) return null;
  const target = getLogExplorerTarget(getLogTraceConfig());
  if (!target) return null;
  return buildServiceLogDeepLink(identity, target);
}
