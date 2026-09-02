import { buildTraceDeepLink } from '@/dh/logTrace/deepLink';
import { getLogExplorerTarget, getLogTraceConfig } from '@/dh/logTrace/config';
import type { TracePluginType } from '@/dh/trace';

import { LOG_CLUSTER_FIELD, LOG_EXPLORER_PATH, LOG_NAMESPACE_FIELD, LOG_SERVICE_FIELD, TRACE_CLUSTER_TAG, TRACE_EXPLORER_PATH, TRACE_NAMESPACE_TAG } from './constants';
import { buildServiceDetailPath, type ServiceIdentity } from './url';

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

/**
 * Open the existing trace explorer with this service (and tags when we have them).
 *
 * The `tags` param is currently *not* read by the explorer: the compact search bar has no tag
 * filter, and the `initTags` prop that used to carry it was never wired into the query. Kept in the
 * URL so existing links stay valid; wiring it up means deciding what a cluster/namespace filter
 * should do when the values do not match the resource attributes (silently zero results), which is
 * its own change.
 */
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

/** 服务下钻日志 → 该服务详情的链路 Tab，按 traceId 打开整条瀑布。 */
export function buildServiceTraceByIdDeepLink(identity: ServiceIdentity, params: { traceId: string; datasourceId: number }): string | null {
  const traceId = params.traceId.trim();
  if (!identity.service || !traceId) return null;
  return buildServiceDetailPath(identity.service, {
    tab: 'traces',
    ds: identity.ds ?? params.datasourceId,
    env: identity.env,
    cluster: identity.cluster,
    namespace: identity.namespace,
    traceId,
  });
}

/** 服务页内跳服务链路；全局日志探索仍去全局 /trace/explorer。 */
export function pickLogToTraceUrl(
  identity: ServiceIdentity | undefined,
  params: { traceId: string; datasourceId: number; pluginType: TracePluginType },
): string {
  if (identity?.service) {
    const serviceUrl = buildServiceTraceByIdDeepLink(identity, { traceId: params.traceId, datasourceId: params.datasourceId });
    if (serviceUrl) return serviceUrl;
  }
  return buildTraceDeepLink({
    traceId: params.traceId,
    datasourceId: params.datasourceId,
    pluginType: params.pluginType,
  });
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
