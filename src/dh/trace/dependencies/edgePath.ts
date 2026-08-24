import type { PharosServiceEdge } from '../contract';
import { edgeKey } from './promql';

export interface BezierFan {
  curvature: number;
  /** Vertical bow of both cubic control points, in px. Positive is downward. */
  offset: number;
}

export const BASE_BEZIER_CURVATURE = 0.35;
const OFFSET_STEP = 16;
const MAX_ABS_OFFSET = 48;
/** Min |control-X| so a short gap still bows; also the max bulge past an endpoint. */
export const BEZIER_MIN_DX = 24;

export const HANDLE_IN = 'in';
export const HANDLE_OUT = 'out';

function cubic(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/**
 * Horizontal cubic bezier with a vertical control-point offset.
 * Control X follows source→target so a right-to-left return stays in the inner corridor
 * instead of always bowing further right (the figure-8 / ∞).
 */
export function getOffsetBezierPath(input: {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  curvature?: number;
  offset?: number;
}): [string, number, number] {
  const curvature = input.curvature ?? BASE_BEZIER_CURVATURE;
  const offset = input.offset ?? 0;
  const span = input.targetX - input.sourceX;
  const dir = span >= 0 ? 1 : -1;
  const dx = Math.max(Math.abs(span) * curvature, BEZIER_MIN_DX);
  const c1x = input.sourceX + dir * dx;
  const c1y = input.sourceY + offset;
  const c2x = input.targetX - dir * dx;
  const c2y = input.targetY + offset;
  const path = `M${input.sourceX},${input.sourceY} C${c1x},${c1y} ${c2x},${c2y} ${input.targetX},${input.targetY}`;
  const labelX = cubic(0.5, input.sourceX, c1x, c2x, input.targetX);
  const labelY = cubic(0.5, input.sourceY, c1y, c2y, input.targetY);
  return [path, labelX, labelY];
}

/**
 * Fan inbound edges to the same sink so their mid-corridor arcs do not coincide.
 * Order follows laid-out source Y so the bow follows geometry, not insertion order.
 */
export function edgeBezierFans(edges: PharosServiceEdge[], nodeY: Map<string, number>): Map<string, BezierFan> {
  const inbound = new Map<string, PharosServiceEdge[]>();
  edges.forEach((edge) => {
    if (edge.client === edge.server) return;
    const list = inbound.get(edge.server);
    if (list) list.push(edge);
    else inbound.set(edge.server, [edge]);
  });

  const result = new Map<string, BezierFan>();
  inbound.forEach((group) => {
    const sorted = [...group].sort((a, b) => {
      const ya = nodeY.get(a.client) ?? 0;
      const yb = nodeY.get(b.client) ?? 0;
      if (ya !== yb) return ya - yb;
      const byClient = a.client.localeCompare(b.client);
      if (byClient !== 0) return byClient;
      return a.connectionType.localeCompare(b.connectionType);
    });
    const n = sorted.length;
    const spread = n <= 1 ? 0 : Math.min(MAX_ABS_OFFSET, (n - 1) * OFFSET_STEP);
    sorted.forEach((edge, i) => {
      const t = n <= 1 ? 0 : i / (n - 1) - 0.5;
      result.set(edgeKey(edge.client, edge.server, edge.connectionType), {
        curvature: BASE_BEZIER_CURVATURE + Math.abs(t) * 0.12,
        offset: t * 2 * spread,
      });
    });
  });
  return result;
}
