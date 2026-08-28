import { getPromData } from '@/components/PromGraphCpt/services';
import { RequestMethod } from '@/store/common';
import request from '@/utils/request';
import { N9E_PATHNAME } from '@/utils/constant';
import type { PharosServiceEdge, PharosServiceGraph } from '../contract';
import { filterEdgesByPeerTokens, peerTokensFromSpanNames } from './envScope';
import {
  buildServiceGraphQueries,
  CLIENT_ENV_LABEL,
  escapePromLabel,
  hasWorkloadScope,
  mergeServiceGraphVectors,
  SERVICE_GRAPH_METRICS,
  toPromRange,
  type PromVectorSample,
  type ServiceGraphScope,
} from './promql';

export { buildServiceGraphQueries, edgeKey, mergeServiceGraphVectors, toPromRange, SERVICE_GRAPH_METRICS } from './promql';
export type { PromVectorSample, ServiceGraphScope } from './promql';

interface ServiceGraphEdgeDto {
  client?: string;
  server?: string;
  connection_type?: string;
  request_count?: number;
  failed_count?: number;
  error_rate?: number;
  p95_seconds?: number;
}

interface ServiceGraphDto {
  edges?: ServiceGraphEdgeDto[];
  visible_services?: string[];
  truncated?: boolean;
}

function finiteOrZero(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function parseEdges(rows: unknown): PharosServiceEdge[] {
  if (!Array.isArray(rows)) return [];
  const edges: PharosServiceEdge[] = [];
  rows.forEach((raw: ServiceGraphEdgeDto) => {
    const client = typeof raw?.client === 'string' ? raw.client : '';
    const server = typeof raw?.server === 'string' ? raw.server : '';
    if (!client || !server) return;
    const p95 = Number(raw.p95_seconds);
    edges.push({
      client,
      server,
      connectionType: typeof raw.connection_type === 'string' ? raw.connection_type : '',
      requestCount: finiteOrZero(raw.request_count),
      failedCount: finiteOrZero(raw.failed_count),
      errorRate: finiteOrZero(raw.error_rate),
      ...(raw.p95_seconds != null && Number.isFinite(p95) ? { p95Seconds: p95 } : {}),
    });
  });
  return edges;
}

/**
 * 以下四个 helper 与 `promql.ts` 一样已不在生产路径上：查询构造与团队裁剪都在后端
 * `pkg/dh/servicegraph`。保留作为 Go 侧实现的口径基准，勿删。
 */
async function queryProm(datasourceId: number, query: string, time: number): Promise<PromVectorSample[]> {
  const data = await getPromData(`/api/${N9E_PATHNAME}/proxy/${datasourceId}/api/v1/query`, { query, time });
  const result = data?.result;
  return Array.isArray(result) ? result : [];
}

async function queryVectors(datasourceId: number, range: string, time: number, scope?: ServiceGraphScope) {
  const queries = buildServiceGraphQueries(range, scope);
  const [total, failed, p95] = await Promise.all([
    queryProm(datasourceId, queries.total, time),
    queryProm(datasourceId, queries.failed, time),
    queryProm(datasourceId, queries.p95, time),
  ]);
  return mergeServiceGraphVectors({ total, failed, p95 });
}

/** True once Jaeger collector dimensions have been scraped onto service_graph series. */
async function serviceGraphHasEnvDimension(datasourceId: number, time: number): Promise<boolean> {
  try {
    const rows = await queryProm(datasourceId, `count(${SERVICE_GRAPH_METRICS.total}{${CLIENT_ENV_LABEL}=~".+"})`, time);
    return rows.some((row) => Number(row.value?.[1]) > 0);
  } catch {
    return false;
  }
}

function spanmetricsClientMatcher(scope: ServiceGraphScope): string | undefined {
  if (!scope.service || !scope.env) return undefined;
  const parts = [
    `service_name="${escapePromLabel(scope.service)}"`,
    `deployment_environment_name="${escapePromLabel(scope.env)}"`,
    'span_kind="SPAN_KIND_CLIENT"',
  ];
  if (scope.cluster) parts.push(`k8s_cluster_name="${escapePromLabel(scope.cluster)}"`);
  if (scope.namespace) parts.push(`k8s_namespace_name="${escapePromLabel(scope.namespace)}"`);
  return `{${parts.join(', ')}}`;
}

/**
 * Until service_graph carries env dimensions, use this env's CLIENT span names to drop
 * foreign database / virtual_node peers (e.g. test mongodb on a pre detail graph).
 */
async function fetchPeerTokensFromSpanmetrics(
  datasourceId: number,
  scope: ServiceGraphScope,
  range: string,
  time: number,
): Promise<Set<string> | undefined> {
  const matcher = spanmetricsClientMatcher(scope);
  if (!matcher) return undefined;
  try {
    const rows = await queryProm(
      datasourceId,
      `sum by (span_name) (increase(traces_span_metrics_calls_total${matcher}[${range}]))`,
      time,
    );
    const names = rows.map((row) => row.metric?.span_name).filter((name): name is string => Boolean(name));
    return peerTokensFromSpanNames(names);
  } catch {
    return undefined;
  }
}

/**
 * 后端查 Thanos 并按团队裁剪边（未绑定团队的服务不可见），前端不再直连 `/proxy/:id/api/v1/query`。
 */
export async function fetchServiceGraph(
  datasourceId: number,
  startUnix: number,
  endUnix: number,
  scope?: ServiceGraphScope,
): Promise<PharosServiceGraph> {
  const res = await request(`/api/${N9E_PATHNAME}/dh/service-graph`, {
    method: RequestMethod.Get,
    silence: true,
    params: {
      datasource_id: datasourceId,
      start: startUnix,
      end: endUnix,
      service: scope?.service || '',
      env: scope?.env || '',
      cluster: scope?.cluster || '',
      namespace: scope?.namespace || '',
    },
  });
  const dat: ServiceGraphDto | undefined = res && typeof res === 'object' && 'dat' in res ? (res as { dat: ServiceGraphDto }).dat : undefined;
  const services = dat?.visible_services;
  return {
    edges: parseEdges(dat?.edges),
    source: 'service-graph',
    visibleServices: Array.isArray(services) ? services.filter((name): name is string => typeof name === 'string') : undefined,
  };
}
