import type { PharosServiceEdge } from '../contract';
import { layoutEdgeDirections } from './layout';
import { edgeKey } from './promql';

/** RED of one call direction. Never merged with the other direction — only displayed next to it. */
export interface EdgeDirectionMetrics {
  client: string;
  server: string;
  connectionType: string;
  requestCount: number;
  failedCount: number;
  errorRate: number;
  p95Seconds?: number;
}

/**
 * One drawn edge per node pair.
 *
 * Structurally a `PharosServiceEdge` so layout / highlight / fan-out helpers keep working:
 * `client`→`server` is the drawn direction, and the top-level RED is the *worse* of the two
 * directions so the stroke color never under-reports a failing return path.
 */
export interface GraphDisplayEdge extends PharosServiceEdge {
  id: string;
  bidirectional: boolean;
  /** Metrics of `client → server`. */
  forward: EdgeDirectionMetrics;
  /** Metrics of `server → client`; only set when `bidirectional`. */
  backward?: EdgeDirectionMetrics;
}

/** A typed connection (`database` / `messaging_system`) says more than the empty RPC label. */
function preferConnectionType(a: string, b: string): string {
  if (!a) return b;
  return a;
}

function aggregateDirection(client: string, server: string, edges: PharosServiceEdge[]): EdgeDirectionMetrics {
  let requestCount = 0;
  let failedCount = 0;
  let weightedP95 = 0;
  let p95Weight = 0;
  let connectionType = '';
  let dominant = -1;
  edges.forEach((edge) => {
    requestCount += edge.requestCount;
    failedCount += edge.failedCount;
    if (edge.p95Seconds != null) {
      weightedP95 += edge.p95Seconds * Math.max(edge.requestCount, 1);
      p95Weight += Math.max(edge.requestCount, 1);
    }
    if (edge.requestCount > dominant) {
      dominant = edge.requestCount;
      connectionType = edge.connectionType;
    } else if (edge.requestCount === dominant) {
      connectionType = preferConnectionType(connectionType, edge.connectionType);
    }
  });
  return {
    client,
    server,
    connectionType,
    requestCount,
    failedCount,
    errorRate: requestCount > 0 ? failedCount / requestCount : 0,
    p95Seconds: p95Weight > 0 ? weightedP95 / p95Weight : undefined,
  };
}

function unorderedPairKey(a: string, b: string): string {
  return a < b ? `${a}\0${b}` : `${b}\0${a}`;
}

/**
 * Collapse every node pair to a single drawn edge.
 *
 * Two strokes per bidirectional pair (the previous shape) doubled the line count on a dense
 * graph for no extra information at rest: the two directions overlap in the same corridor and
 * are only distinguishable once you hover. One stroke with an arrowhead on both ends states
 * "these two call each other" at a glance, and both directions' RED stay available on the
 * hover card / drawer via `forward` and `backward`.
 *
 * The drawn direction comes from `layoutEdgeDirections`, so it matches the dagre rank order
 * (detail view: always `focusService → peer`).
 */
export function mergeMutualEdges(edges: PharosServiceEdge[], focusService?: string): GraphDisplayEdge[] {
  const byPair = new Map<string, PharosServiceEdge[]>();
  edges.forEach((edge) => {
    if (edge.client === edge.server) return;
    const key = unorderedPairKey(edge.client, edge.server);
    const list = byPair.get(key);
    if (list) list.push(edge);
    else byPair.set(key, [edge]);
  });

  return layoutEdgeDirections(edges, focusService).map((direction) => {
    const group = byPair.get(unorderedPairKey(direction.from, direction.to)) || [];
    const forward = aggregateDirection(
      direction.from,
      direction.to,
      group.filter((edge) => edge.client === direction.from),
    );
    const backward = direction.mutual
      ? aggregateDirection(
          direction.to,
          direction.from,
          group.filter((edge) => edge.client === direction.to),
        )
      : undefined;
    const errorRate = Math.max(forward.errorRate, backward?.errorRate ?? 0);
    const p95Candidates = [forward.p95Seconds, backward?.p95Seconds].filter((value): value is number => typeof value === 'number');
    return {
      id: edgeKey(direction.from, direction.to, forward.connectionType),
      client: direction.from,
      server: direction.to,
      connectionType: forward.connectionType,
      requestCount: forward.requestCount + (backward?.requestCount ?? 0),
      failedCount: forward.failedCount + (backward?.failedCount ?? 0),
      errorRate,
      p95Seconds: p95Candidates.length > 0 ? Math.max(...p95Candidates) : undefined,
      bidirectional: Boolean(backward),
      forward,
      backward,
    };
  });
}
