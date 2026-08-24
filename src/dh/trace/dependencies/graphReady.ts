export interface LaidOutSnapshot {
  id: string;
  x: number;
  y: number;
}

function nodeIdKey(nodes: Array<{ id: string }>): string {
  return nodes.map((node) => node.id).sort().join('\n');
}

/**
 * Traces fill-back only changes captions / 36→48px height. Re-running dagre would write new
 * y values and RF would remount internals — a visible 0,0→LR jump. Keep the first x/y for the
 * same node set; height/kind still come from `next`.
 */
export function freezeLayoutPositions<T extends LaidOutSnapshot>(previous: T[] | null, next: T[]): T[] {
  if (!previous || nodeIdKey(previous) !== nodeIdKey(next)) return next;
  const prevById = new Map(previous.map((node) => [node.id, node]));
  return next.map((node) => {
    const old = prevById.get(node.id);
    if (!old) return node;
    return { ...node, x: old.x, y: old.y };
  });
}
