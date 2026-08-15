import React, { useMemo } from 'react';
import ReactFlow, { Background, Controls, Handle, MiniMap, Position, type Edge, type Node, type NodeProps } from 'reactflow';
import 'reactflow/dist/style.css';
import type { PharosServiceEdge } from '../contract';
import { edgeKey } from './promql';
import { layoutServiceGraph } from './layout';

interface ServiceNodeData {
  label: string;
  dimmed: boolean;
}

function ServiceNode({ data }: NodeProps<ServiceNodeData>) {
  return (
    <div className={`rounded-lg fc-border bg-fc-100 px-3 py-1.5 text-sm text-title shadow-sm ${data.dimmed ? 'opacity-40' : ''}`}>
      <Handle type='target' position={Position.Left} className='bg-[var(--fc-fill-primary)]' />
      {data.label}
      <Handle type='source' position={Position.Right} className='bg-[var(--fc-fill-primary)]' />
    </div>
  );
}

const nodeTypes = { service: ServiceNode };

export function errorStroke(rate: number): string {
  if (rate >= 0.05) return 'var(--fc-fill-error)';
  if (rate >= 0.01) return 'var(--fc-fill-warning)';
  return 'var(--fc-fill-success)';
}

export function edgeStrokeWidth(requestCount: number): number {
  return Math.min(8, 1 + Math.log10(Math.max(requestCount, 1)) * 1.6);
}

interface IProps {
  edges: PharosServiceEdge[];
  selectedId?: string;
  focusService?: string;
  onSelectEdge: (id: string | undefined) => void;
  onSelectService: (name: string | undefined) => void;
}

export default function ServiceGraphCanvas(props: IProps) {
  const { edges, selectedId, focusService, onSelectEdge, onSelectService } = props;

  const { nodes, flowEdges } = useMemo(() => {
    const laidOut = layoutServiceGraph(edges);
    const involved = new Set<string>();
    if (focusService) {
      edges.forEach((edge) => {
        if (edge.client === focusService || edge.server === focusService) {
          involved.add(edge.client);
          involved.add(edge.server);
        }
      });
    }

    const nodes: Node<ServiceNodeData>[] = laidOut.map((node) => ({
      id: node.id,
      type: 'service',
      position: { x: node.x, y: node.y },
      data: { label: node.id, dimmed: Boolean(focusService) && !involved.has(node.id) },
    }));

    const flowEdges: Edge[] = edges.map((edge) => {
      const id = edgeKey(edge.client, edge.server, edge.connectionType);
      const focused = !focusService || edge.client === focusService || edge.server === focusService;
      const selected = id === selectedId;
      return {
        id,
        source: edge.client,
        target: edge.server,
        label: edge.connectionType || undefined,
        animated: selected,
        hidden: Boolean(focusService) && !focused,
        style: {
          stroke: selected ? 'var(--fc-fill-primary)' : errorStroke(edge.errorRate),
          strokeWidth: selected ? edgeStrokeWidth(edge.requestCount) + 1.5 : edgeStrokeWidth(edge.requestCount),
        },
      };
    });

    return { nodes, flowEdges };
  }, [edges, selectedId, focusService]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={flowEdges}
      nodeTypes={nodeTypes}
      fitView
      minZoom={0.3}
      maxZoom={1.6}
      proOptions={{ hideAttribution: true }}
      onNodeClick={(_e, node) => onSelectService(node.id === focusService ? undefined : node.id)}
      onEdgeClick={(_e, edge) => onSelectEdge(edge.id === selectedId ? undefined : edge.id)}
      onPaneClick={() => {
        onSelectEdge(undefined);
        onSelectService(undefined);
      }}
    >
      <Background color='var(--fc-border-color)' gap={18} />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable nodeColor='var(--fc-fill-primary)' maskColor='var(--fc-fill-3)' />
    </ReactFlow>
  );
}
