import type { PharosServiceEdge } from '../contract';

export interface LaidOutNode {
  id: string;
  x: number;
  y: number;
}

const X0 = 48;
const Y0 = 48;
const X_GAP = 220;
const Y_GAP = 72;

/**
 * Left-to-right layers by Kahn topological order. Cycles (or a fully cyclic graph) land in a
 * trailing layer so every service still gets a coordinate — no extra layout library.
 */
export function layoutServiceGraph(edges: PharosServiceEdge[]): LaidOutNode[] {
  const names = new Set<string>();
  edges.forEach((edge) => {
    names.add(edge.client);
    names.add(edge.server);
  });

  const outgoing = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  names.forEach((name) => {
    outgoing.set(name, []);
    indegree.set(name, 0);
  });

  const seen = new Set<string>();
  edges.forEach((edge) => {
    if (edge.client === edge.server) return;
    const pair = `${edge.client}\0${edge.server}`;
    if (seen.has(pair)) return;
    seen.add(pair);
    outgoing.get(edge.client)?.push(edge.server);
    indegree.set(edge.server, (indegree.get(edge.server) || 0) + 1);
  });

  const remaining = new Set(names);
  const layers: string[][] = [];
  let queue = [...names].filter((name) => indegree.get(name) === 0).sort();

  while (queue.length > 0) {
    layers.push(queue);
    const next: string[] = [];
    queue.forEach((name) => {
      remaining.delete(name);
      (outgoing.get(name) || []).forEach((target) => {
        const nextDeg = (indegree.get(target) || 0) - 1;
        indegree.set(target, nextDeg);
        if (nextDeg === 0 && remaining.has(target)) next.push(target);
      });
    });
    queue = [...new Set(next)].sort();
  }
  if (remaining.size > 0) {
    layers.push([...remaining].sort());
  }

  const nodes: LaidOutNode[] = [];
  layers.forEach((layer, xi) => {
    layer.forEach((id, yi) => {
      nodes.push({ id, x: X0 + xi * X_GAP, y: Y0 + yi * Y_GAP });
    });
  });
  return nodes;
}
