import type { PharosServiceEdge } from '../contract';

/** Default metric names from the OTel Collector `service_graph` connector. */
export const SERVICE_GRAPH_METRICS = {
  total: 'traces_service_graph_request_total',
  failed: 'traces_service_graph_request_failed_total',
  serverBucket: 'traces_service_graph_request_server_seconds_bucket',
} as const;

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

export function buildServiceGraphQueries(range: string) {
  return {
    total: `sum by (client, server, connection_type) (increase(${SERVICE_GRAPH_METRICS.total}[${range}]))`,
    failed: `sum by (client, server, connection_type) (increase(${SERVICE_GRAPH_METRICS.failed}[${range}]))`,
    p95: `histogram_quantile(0.95, sum by (client, server, connection_type, le) (rate(${SERVICE_GRAPH_METRICS.serverBucket}[${range}])))`,
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
