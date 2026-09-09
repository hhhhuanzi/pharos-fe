import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MinusCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import ReactFlow, {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { NS } from '@/pages/notificationRules/constants';

import { DRAG_CLICK_THRESHOLD, LAYOUT, SOURCE_NODE_ID } from './constants';
import { mergeNodePositions } from './mergeNodePositions';
import type { NotifyFlowFilterContent, NotifyFlowFocus, NotifyFlowGraph, NotifyFlowKvChip } from './types';

interface SourceNodeData {
  label: string;
  selected?: boolean;
}

interface FilterNodeData extends NotifyFlowFilterContent {
  index: number;
  width: number;
  title: string;
  selected: boolean;
  labels: { severity: string; time: string; condition: string; and: string };
}

interface ChannelNodeData {
  index: number;
  title: string;
  channelName: string;
  paramsSummary: string;
  selected: boolean;
  disabled?: boolean;
  onDelete?: (index: number) => void;
}

interface TemplateNodeData {
  index: number;
  title: string;
  templateName: string;
  selected: boolean;
}

function boxClass(selected: boolean): string {
  return `cursor-grab rounded-lg border border-solid p-3 ${selected ? 'border-[var(--fc-fill-primary)] bg-[var(--fc-violet-2)]' : 'border-[var(--fc-border-color)] bg-fc-100'}`;
}

function NodeCaption({ title }: { title: string }) {
  return <div className='pointer-events-none absolute bottom-full left-0 mb-1 text-base text-hint'>{title}</div>;
}

function TextChip({ text }: { text: string }) {
  return (
    <span
      className='inline-flex max-w-full truncate rounded-lg border border-solid border-[var(--fc-border-color)] bg-fc-50 px-2 py-0.5 text-base leading-none text-main'
      title={text}
    >
      {text}
    </span>
  );
}

function KvChip({ chip }: { chip: NotifyFlowKvChip }) {
  const title = chip.value ? `${chip.key} ${chip.op} ${chip.value}` : `${chip.key} ${chip.op}`;
  return (
    <span
      className='inline-flex max-w-full items-center gap-1 truncate rounded-lg border border-solid border-[var(--fc-border-color)] bg-fc-50 px-2 py-0.5 text-base leading-none'
      title={title}
    >
      <span className='text-main'>{chip.key}</span>
      <span className='text-hint'>{chip.op}</span>
      {chip.value ? <span className='font-medium text-title'>{chip.value}</span> : null}
    </span>
  );
}

function FilterRow(props: { label: string; children: React.ReactNode }) {
  return (
    <div className='flex gap-2'>
      <div className='w-8 shrink-0 text-base text-hint'>{props.label}</div>
      <div className='flex min-w-0 flex-1 flex-wrap items-center gap-2'>{props.children}</div>
    </div>
  );
}

function SourceNode({ data }: NodeProps<SourceNodeData>) {
  return (
    <div className={`${boxClass(Boolean(data.selected))} px-4 py-3 text-l1 font-bold text-title`}>
      {data.label}
      <Handle type='source' position={Position.Right} isConnectable={false} className='bg-[var(--fc-fill-primary)]' />
    </div>
  );
}

function FilterNode({ data }: NodeProps<FilterNodeData>) {
  return (
    <div className='relative' style={{ width: data.width }}>
      <NodeCaption title={data.title} />
      <div className={boxClass(data.selected)}>
        <Handle type='target' position={Position.Left} isConnectable={false} className='bg-[var(--fc-fill-primary)]' />
        {data.unrestricted ? (
          <div className='text-base text-hint'>{data.unrestrictedText}</div>
        ) : (
          <div className='flex flex-col gap-2'>
            {data.severity ? (
              <FilterRow label={data.labels.severity}>
                <TextChip text={data.severity} />
              </FilterRow>
            ) : null}
            {data.times.length > 0 ? (
              <FilterRow label={data.labels.time}>
                {data.times.map((time, timeIndex) => (
                  <TextChip key={`${timeIndex}-${time}`} text={time} />
                ))}
              </FilterRow>
            ) : null}
            {data.chips.length > 0 ? (
              <FilterRow label={data.labels.condition}>
                {data.chips.map((chip, chipIndex) => (
                  <React.Fragment key={`${chipIndex}-${chip.key}-${chip.op}-${chip.value}`}>
                    {chipIndex > 0 ? <span className='text-base text-soft'>{data.labels.and}</span> : null}
                    <KvChip chip={chip} />
                  </React.Fragment>
                ))}
              </FilterRow>
            ) : null}
          </div>
        )}
        <Handle type='source' position={Position.Right} isConnectable={false} className='bg-[var(--fc-fill-primary)]' />
      </div>
    </div>
  );
}

function ChannelNode({ data }: NodeProps<ChannelNodeData>) {
  return (
    <div className='relative' style={{ width: LAYOUT.channelWidth }}>
      <NodeCaption title={data.title} />
      <div className={boxClass(data.selected)}>
        <Handle type='target' position={Position.Left} isConnectable={false} className='bg-[var(--fc-fill-primary)]' />
        <div className='flex items-start gap-2'>
          <div className='min-w-0 flex-1'>
            <div className='truncate text-l1 font-bold text-title' title={data.channelName}>
              {data.channelName}
            </div>
            {data.paramsSummary ? (
              <div className='mt-1 truncate text-base text-hint' title={data.paramsSummary}>
                {data.paramsSummary}
              </div>
            ) : null}
          </div>
          {!data.disabled && data.onDelete ? (
            <MinusCircleOutlined
              className='nodrag mt-1 shrink-0 text-soft hover:text-title'
              onClick={(event) => {
                event.stopPropagation();
                data.onDelete?.(data.index);
              }}
            />
          ) : null}
        </div>
        <Handle type='source' position={Position.Right} isConnectable={false} className='bg-[var(--fc-fill-primary)]' />
      </div>
    </div>
  );
}

function TemplateNode({ data }: NodeProps<TemplateNodeData>) {
  return (
    <div className='relative' style={{ width: LAYOUT.templateWidth }}>
      <NodeCaption title={data.title} />
      <div className={boxClass(data.selected)}>
        <Handle type='target' position={Position.Left} isConnectable={false} className='bg-[var(--fc-fill-primary)]' />
        <div className='truncate text-l1 font-bold text-title' title={data.templateName}>
          {data.templateName}
        </div>
      </div>
    </div>
  );
}

const nodeTypes = { source: SourceNode, filter: FilterNode, channel: ChannelNode, template: TemplateNode };

interface FitViewOnTokenProps {
  token: string;
  ready: boolean;
}

function FitViewOnToken(props: FitViewOnTokenProps) {
  const { token, ready } = props;
  const { fitView } = useReactFlow();
  const fitViewRef = useRef(fitView);
  fitViewRef.current = fitView;

  useEffect(() => {
    if (!ready) return;
    const frame = window.requestAnimationFrame(() => {
      fitViewRef.current({ padding: 0.16, maxZoom: 1 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [token, ready]);

  return null;
}

function focusOfKind(kind: string): NotifyFlowFocus | undefined {
  if (kind === 'filter') return 'filters';
  if (kind === 'channel') return 'channel';
  if (kind === 'template') return 'template';
  return undefined;
}

function toRfNodes(
  graph: NotifyFlowGraph,
  selectedIndex: number | undefined,
  disabled: boolean | undefined,
  onDelete: ((index: number) => void) | undefined,
  titles: { filter: string; channel: string; template: string },
  labels: { severity: string; time: string; condition: string; and: string },
): Node[] {
  return graph.nodes.map((node) => {
    const selected = node.kind !== 'source' && node.index === selectedIndex;
    const shared = {
      id: node.id,
      position: node.position,
      draggable: true,
      connectable: false,
      selectable: node.kind !== 'source',
      deletable: false,
      selected,
      style: { overflow: 'visible' as const },
    };

    if (node.kind === 'source') {
      return { ...shared, type: 'source', data: { label: node.label, selected: false } };
    }
    if (node.kind === 'filter') {
      return {
        ...shared,
        type: 'filter',
        data: { index: node.index, width: graph.columns.filterWidth, title: titles.filter, selected, labels, ...node.content },
      };
    }
    if (node.kind === 'channel') {
      return {
        ...shared,
        type: 'channel',
        data: {
          index: node.index,
          title: titles.channel,
          channelName: node.channelName,
          paramsSummary: node.paramsSummary,
          selected,
          disabled,
          onDelete,
        },
      };
    }
    return {
      ...shared,
      type: 'template',
      data: { index: node.index, title: titles.template, templateName: node.templateName, selected },
    };
  });
}

function toRfEdges(graph: NotifyFlowGraph, selectedIndex?: number): Edge[] {
  return graph.edges.map((edge) => {
    const selected = selectedIndex === edge.index;
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'smoothstep',
      data: { index: edge.index },
      deletable: false,
      updatable: false,
      focusable: false,
      selected,
      style: {
        stroke: selected ? 'var(--fc-fill-primary)' : 'var(--fc-text-4)',
        strokeWidth: selected ? 2 : 1.5,
      },
    };
  });
}

export interface NotifyFlowCanvasProps {
  graph: NotifyFlowGraph;
  selectedIndex?: number;
  disabled?: boolean;
  fill?: boolean;
  fitToken?: number;
  resetToken?: number;
  onOpen: (index: number, focus?: NotifyFlowFocus) => void;
  onDelete?: (index: number) => void;
}

function NotifyFlowCanvasInner(props: NotifyFlowCanvasProps) {
  const { t } = useTranslation(NS);
  const { graph, selectedIndex, disabled, fill, fitToken = 0, resetToken = 0, onOpen, onDelete } = props;
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const draggedRef = useRef(false);
  const lastResetRef = useRef(resetToken);
  const draggedIdsRef = useRef<Set<string>>(new Set());
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  const titles = useMemo(
    () => ({
      filter: t('flow.filter_title'),
      channel: t('flow.channel_title'),
      template: t('flow.template_title'),
    }),
    [t],
  );

  const labels = useMemo(
    () => ({
      severity: t('flow.row_severity'),
      time: t('flow.row_time'),
      condition: t('flow.row_condition'),
      and: t('flow.and'),
    }),
    [t],
  );

  useEffect(() => {
    const built = toRfNodes(graph, selectedIndex, disabled, onDelete, titles, labels);
    const isReset = resetToken !== lastResetRef.current;
    lastResetRef.current = resetToken;
    if (isReset) {
      draggedIdsRef.current = new Set();
    }
    setNodes((prev) => (isReset || prev.length === 0 ? built : mergeNodePositions(prev, built, draggedIdsRef.current)));
    setEdges(toRfEdges(graph, selectedIndex));
  }, [graph, selectedIndex, disabled, onDelete, titles, labels, resetToken]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
  }, []);

  const chainCount = graph.nodes.filter((node) => node.kind === 'filter').length;
  const canvasHeight = Math.min(LAYOUT.canvasMaxHeight, Math.max(LAYOUT.canvasMinHeight, graph.contentHeight));
  const fitKey = `${chainCount}:${fitToken}:${fill ? '1' : '0'}`;

  return (
    <div className='overflow-hidden rounded-lg bg-fc-50 fc-border' style={{ height: fill ? '100%' : canvasHeight }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        minZoom={0.3}
        maxZoom={1.6}
        nodeOrigin={[0, 0.5]}
        nodesDraggable
        nodesConnectable={false}
        edgesUpdatable={false}
        elementsSelectable
        panOnDrag
        autoPanOnNodeDrag={false}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
        onConnect={() => undefined}
        onNodesChange={onNodesChange}
        onNodeDragStart={(event) => {
          dragStartRef.current = { x: event.clientX, y: event.clientY };
          draggedRef.current = false;
        }}
        onNodeDrag={(event, node) => {
          const start = dragStartRef.current;
          if (!start) return;
          if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > DRAG_CLICK_THRESHOLD) {
            draggedRef.current = true;
            draggedIdsRef.current.add(node.id);
          }
        }}
        onNodeClick={(_event, node) => {
          if (draggedRef.current) {
            draggedRef.current = false;
            return;
          }
          if (node.id === SOURCE_NODE_ID) return;
          const index = node.data?.index;
          const focus = focusOfKind(node.type ?? '');
          if (typeof index === 'number') {
            onOpen(index, focus);
          }
        }}
        onEdgeClick={(_event, edge) => {
          const index = edge.data?.index;
          if (typeof index === 'number') {
            onOpen(index);
          }
        }}
      >
        <Background color='var(--fc-border-color)' gap={18} />
        <Controls showInteractive />
        <MiniMap pannable zoomable nodeColor='var(--fc-fill-primary)' maskColor='var(--fc-fill-3)' />
        <FitViewOnToken token={fitKey} ready={nodes.length > 0} />
      </ReactFlow>
    </div>
  );
}

export default function NotifyFlowCanvas(props: NotifyFlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <NotifyFlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
