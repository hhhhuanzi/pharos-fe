export interface PositionedNode {
  id: string;
  position: { x: number; y: number };
  dragging?: boolean;
  width?: number;
  height?: number;
  positionAbsolute?: { x: number; y: number };
}

/**
 * Rebuild graph nodes but keep positions (and RF drag metrics) for ids that already exist.
 * New ids keep `next` default coordinates. Dropped ids disappear with `next`.
 */
export function mergeNodePositions<T extends PositionedNode>(prev: T[], next: T[]): T[] {
  const prevById = new Map(prev.map((node) => [node.id, node]));
  return next.map((node) => {
    const old = prevById.get(node.id);
    if (!old) return node;
    return {
      ...node,
      position: { x: old.position.x, y: old.position.y },
      dragging: old.dragging,
      width: old.width,
      height: old.height,
      positionAbsolute: old.positionAbsolute,
    };
  });
}
