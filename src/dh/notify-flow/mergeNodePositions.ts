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
 * Rebuild graph nodes. Only ids the user has dragged keep their coordinates;
 * everyone else takes the newly computed layout so taller filter cards can reflow.
 */
export function mergeNodePositions<T extends PositionedNode>(prev: T[], next: T[], draggedIds?: Iterable<string>): T[] {
  const dragged = new Set(draggedIds ?? []);
  const prevById = new Map(prev.map((node) => [node.id, node]));
  return next.map((node) => {
    const old = prevById.get(node.id);
    if (!old || !dragged.has(node.id)) return node;
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
