import type { PharosServiceEdge } from '../contract';

/** Instrumented callers of `nodeId` (the client side of edges into this node), heaviest first. */
export function adjacentClients(nodeId: string, edges: PharosServiceEdge[]): string[] {
  const counts = new Map<string, number>();
  edges.forEach((edge) => {
    if (edge.server !== nodeId) return;
    counts.set(edge.client, (counts.get(edge.client) || 0) + edge.requestCount);
  });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name);
}

/** Callees of `nodeId` (the server side of edges out of this node), heaviest first. */
export function adjacentServers(nodeId: string, edges: PharosServiceEdge[]): string[] {
  const counts = new Map<string, number>();
  edges.forEach((edge) => {
    if (edge.client !== nodeId) return;
    counts.set(edge.server, (counts.get(edge.server) || 0) + edge.requestCount);
  });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name);
}

export interface NeighborRow {
  name: string;
  direction: 'upstream' | 'downstream';
  connectionType: string;
  requestCount: number;
  errorRate: number;
  p95Seconds?: number;
}

/** 1-hop neighbors of an RPC (or any) node, upstream first then downstream, heaviest first in each group. */
export function neighborRows(nodeId: string, edges: PharosServiceEdge[]): NeighborRow[] {
  const upstream: NeighborRow[] = [];
  const downstream: NeighborRow[] = [];
  edges.forEach((edge) => {
    if (edge.server === nodeId) {
      upstream.push({
        name: edge.client,
        direction: 'upstream',
        connectionType: edge.connectionType,
        requestCount: edge.requestCount,
        errorRate: edge.errorRate,
        p95Seconds: edge.p95Seconds,
      });
    } else if (edge.client === nodeId) {
      downstream.push({
        name: edge.server,
        direction: 'downstream',
        connectionType: edge.connectionType,
        requestCount: edge.requestCount,
        errorRate: edge.errorRate,
        p95Seconds: edge.p95Seconds,
      });
    }
  });
  const byVolume = (a: NeighborRow, b: NeighborRow) => b.requestCount - a.requestCount || a.name.localeCompare(b.name);
  return [...upstream.sort(byVolume), ...downstream.sort(byVolume)];
}

/** `db.name` graph nodes (connection_type=database) so generic SQL matching can leave those spans alone. */
export function databaseNodeNames(edges: PharosServiceEdge[]): Set<string> {
  const names = new Set<string>();
  edges.forEach((edge) => {
    if (edge.connectionType !== 'database') return;
    names.add(edge.server.toLowerCase());
  });
  return names;
}
