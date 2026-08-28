/**
 * 查询构造与向量合并已移到后端 `pkg/dh/servicegraph/promql.go`（拓扑需要按团队硬过滤，
 * 前端拿不到团队归属）。此处保留作为口径基准，两侧改动请互相比对。
 */
import type { PharosServiceEdge } from '../contract';

/** Default metric names from the OTel Collector `service_graph` connector. */
export const SERVICE_GRAPH_METRICS = {
  total: 'traces_service_graph_request_total',
  failed: 'traces_service_graph_request_failed_total',
  serverBucket: 'traces_service_graph_request_server_seconds_bucket',
} as const;

/**
 * Connector `dimensions` are emitted with a `client_` / `server_` prefix. After Prom
 * sanitization they look like these. Do **not** match scrape labels (`cluster` /
 * `env` / `namespace`) — those belong to the central Jaeger collector (k8s-devops).
 */
export const CLIENT_ENV_LABEL = 'client_deployment_environment_name';
export const SERVER_ENV_LABEL = 'server_deployment_environment_name';
export const CLIENT_CLUSTER_LABEL = 'client_k8s_cluster_name';
export const SERVER_CLUSTER_LABEL = 'server_k8s_cluster_name';
export const CLIENT_NAMESPACE_LABEL = 'client_k8s_namespace_name';
export const SERVER_NAMESPACE_LABEL = 'server_k8s_namespace_name';

/** Detail-topology slice. Global graph omits this and stays fleet-wide. */
export interface ServiceGraphScope {
  service?: string;
  env?: string;
  cluster?: string;
  namespace?: string;
}

export interface PromVectorSample {
  metric: Record<string, string>;
  value: [number, string];
}

export function toPromRange(seconds: number): string {
  const s = Math.max(1, Math.round(seconds));
  if (s % 86400 === 0) return `${s / 86400}d`;
  if (s % 3600 === 0) return `${s / 3600}h`;
  if (s % 60 === 0) return `${s / 60}m`;
  return `${s}s`;
}

export function escapePromLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function hasWorkloadScope(scope?: ServiceGraphScope): boolean {
  return Boolean(scope?.env || scope?.cluster || scope?.namespace);
}

function sideSelector(side: 'client' | 'server', scope: ServiceGraphScope): string | undefined {
  if (!scope.service) return undefined;
  const parts = [`${side}="${escapePromLabel(scope.service)}"`];
  if (scope.env) {
    parts.push(`${side === 'client' ? CLIENT_ENV_LABEL : SERVER_ENV_LABEL}="${escapePromLabel(scope.env)}"`);
  }
  if (scope.cluster) {
    parts.push(`${side === 'client' ? CLIENT_CLUSTER_LABEL : SERVER_CLUSTER_LABEL}="${escapePromLabel(scope.cluster)}"`);
  }
  if (scope.namespace) {
    parts.push(`${side === 'client' ? CLIENT_NAMESPACE_LABEL : SERVER_NAMESPACE_LABEL}="${escapePromLabel(scope.namespace)}"`);
  }
  return `{${parts.join(', ')}}`;
}

function scopedSum(fn: 'increase' | 'rate', metric: string, range: string, by: string, scope?: ServiceGraphScope): string {
  if (!scope?.service) {
    return `sum by (${by}) (${fn}(${metric}[${range}]))`;
  }
  const client = sideSelector('client', scope);
  const server = sideSelector('server', scope);
  return `sum by (${by}) (${fn}(${metric}${client}[${range}])) or sum by (${by}) (${fn}(${metric}${server}[${range}]))`;
}

export function buildServiceGraphQueries(range: string, scope?: ServiceGraphScope) {
  return {
    total: scopedSum('increase', SERVICE_GRAPH_METRICS.total, range, 'client, server, connection_type', scope),
    failed: scopedSum('increase', SERVICE_GRAPH_METRICS.failed, range, 'client, server, connection_type', scope),
    p95: `histogram_quantile(0.95, ${scopedSum(
      'rate',
      SERVICE_GRAPH_METRICS.serverBucket,
      range,
      'client, server, connection_type, le',
      scope,
    )})`,
  };
}

export function edgeKey(client: string, server: string, connectionType = ''): string {
  return `${client}\0${server}\0${connectionType}`;
}

function parseLabels(metric: Record<string, string>) {
  return {
    client: metric.client || '',
    server: metric.server || '',
    connectionType: metric.connection_type || '',
  };
}

function sampleValue(sample: PromVectorSample): number {
  const n = Number(sample.value?.[1]);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Join the three instant vectors on (client, server, connection_type). Edges with no traffic
 * (and no failures) are dropped so a stale-but-zero series does not draw a ghost line.
 */
export function mergeServiceGraphVectors(input: { total: PromVectorSample[]; failed: PromVectorSample[]; p95: PromVectorSample[] }): PharosServiceEdge[] {
  const byKey = new Map<string, PharosServiceEdge>();

  const ensure = (metric: Record<string, string>): PharosServiceEdge | null => {
    const { client, server, connectionType } = parseLabels(metric);
    if (!client || !server) return null;
    const key = edgeKey(client, server, connectionType);
    let edge = byKey.get(key);
    if (!edge) {
      edge = { client, server, connectionType, requestCount: 0, failedCount: 0, errorRate: 0 };
      byKey.set(key, edge);
    }
    return edge;
  };

  input.total.forEach((sample) => {
    const edge = ensure(sample.metric);
    const n = sampleValue(sample);
    if (edge && Number.isFinite(n)) edge.requestCount = n;
  });
  input.failed.forEach((sample) => {
    const edge = ensure(sample.metric);
    const n = sampleValue(sample);
    if (edge && Number.isFinite(n)) edge.failedCount = n;
  });
  input.p95.forEach((sample) => {
    const edge = ensure(sample.metric);
    const n = sampleValue(sample);
    if (edge && Number.isFinite(n)) edge.p95Seconds = n;
  });

  return Array.from(byKey.values())
    .map((edge) => ({
      ...edge,
      errorRate: edge.requestCount > 0 ? Math.min(1, edge.failedCount / edge.requestCount) : 0,
    }))
    .filter((edge) => edge.requestCount > 0 || edge.failedCount > 0)
    .sort((a, b) => b.errorRate - a.errorRate || (b.p95Seconds || 0) - (a.p95Seconds || 0) || b.requestCount - a.requestCount);
}
