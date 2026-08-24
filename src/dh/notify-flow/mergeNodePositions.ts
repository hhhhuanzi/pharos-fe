export interface PositionedNode {
  id: string;
  position: { x: number; y: number };
  dragging?: boolean;
  // reactflow 的 Node 用 null 表示「尚未测量」，这里跟着放宽，避免调用方要先做一层转换。
  width?: number | null;
  height?: number | null;
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
