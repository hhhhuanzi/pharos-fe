import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Tooltip } from 'antd';
import { ApiOutlined, CloudServerOutlined, DatabaseOutlined, HddOutlined, MessageOutlined, UserOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import ReactFlow, {
  applyNodeChanges,
  Background,
  BaseEdge,
  ControlButton,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  useStore,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
  type ReactFlowState,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { formatDuration } from '@/pages/traceCpt/utils/date';
import type { PharosServiceEdge } from '../contract';
import {
  EDGE_HIGHLIGHT_WIDTH_BOOST,
  edgeEmphasis,
  edgeErrorLabelVisible,
  edgeHighlightZIndex,
  edgeStrokeGeometry,
  edgeStrokeWidth,
  endpointsHighlight,
  errorTone,
  nodeFontScale,
  NODE_LABEL_FONT,
  formatErrorRatePercent,
  formatQps,
  graphFitViewOptions,
  graphTranslateExtent,
  GRAPH_ACTUAL_ZOOM,
  GRAPH_MAX_ZOOM,
  GRAPH_MIN_ZOOM,
  incidentHighlight,
  planGraphViewport,
  quantizeZoom,
  type GraphHighlight,
  type ViewportPlan,
} from './graphVisual';
import { BASE_BEZIER_CURVATURE, HANDLE_IN, HANDLE_OUT, edgeBezierFans, getOffsetBezierPath } from './edgePath';
import { freezeLayoutPositions } from './graphReady';
import { layoutServiceGraph, type GraphNodeKind, type LaidOutNode } from './layout';
import { fitLabel, NODE_LABEL_CHROME } from './nodeWidth';
import { mergeMutualEdges, type EdgeDirectionMetrics, type GraphDisplayEdge } from './mutualEdge';
import { quantizeViewport, DEFAULT_VIEWPORT } from './spacing';
import { inferPeerGlyph, type PeerGlyph } from './peerType';
import EdgeMetricCard, { type EdgeMetricDirection } from './EdgeMetricCard';
import './Graph.less';

/** Frames to keep retrying the opening viewport while React Flow measures the cards. */
const FIT_RETRY_FRAMES = 12;
/** Hard ceiling on the pre-layout blackout, so a stuck measure can never hide the canvas. */
const FIT_FALLBACK_MS = 600;

interface ServiceNodeData {
  label: string;
  subtitle?: string;
  kind: GraphNodeKind;
  glyph: PeerGlyph;
  dimmed: boolean;
  emphasized: boolean;
  /** Solved per graph; the label is cut against it rather than against a constant. */
  cardWidth: number;
  /** Matches `--dh-node-font-scale`, so the cut follows the text the zoom actually renders. */
  fontScale: number;
}

interface ServiceEdgeData {
  errorLabel: string;
  errorClass: string;
  errorRateLabel: string;
  qpsLabel: string;
  p95Label: string;
  directions: EdgeMetricDirection[];
  expanded: boolean;
  pinned: boolean;
  closeLabel: string;
  dimmed: boolean;
  showErrorLabel: boolean;
  curvature: number;
  offset: number;
  onLabelEnter: () => void;
  onLabelLeave: () => void;
  onLabelClick: (event: React.MouseEvent) => void;
}

const ERROR_TEXT_CLASS: Record<ReturnType<typeof errorTone>, string> = {
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error',
};

function NodeGlyph(props: { glyph: PeerGlyph }) {
  const className = 'dh-service-node__glyph shrink-0 text-hint';
  if (props.glyph === 'user') return <UserOutlined className={className} />;
  if (props.glyph === 'redis') return <HddOutlined className={className} />;
  if (props.glyph === 'mq') return <MessageOutlined className={className} />;
  if (props.glyph === 'db') return <DatabaseOutlined className={className} />;
  if (props.glyph === 'unknown') return <ApiOutlined className={className} />;
  return <CloudServerOutlined className={className} />;
}

const EMPHASIZED_CARD = 'border-solid border-[var(--fc-fill-primary)] bg-[var(--fc-violet-2)]';
/**
 * The idle card used to sit one fill step from the canvas behind the translucent border token,
 * which is legible at 1:1 and gone by the time a large graph has been fitted. Two steps of fill
 * plus an opaque stroke read as a chip in both themes, without a shadow (the repo is flat).
 */
const CARD_BY_KIND: Record<GraphNodeKind, string> = {
  service: 'border-solid border-[var(--fc-fill-7)] bg-fc-300',
  virtual: 'border-dashed border-[var(--fc-fill-7)] bg-fc-200',
};

function ServiceNode({ data }: NodeProps<ServiceNodeData>) {
  const card = data.emphasized ? EMPHASIZED_CARD : CARD_BY_KIND[data.kind];
  const subtitle = data.glyph === 'user' ? '' : data.subtitle?.trim() || '';
  const title = subtitle ? `${data.label} · ${subtitle}` : data.label;
  const label = fitLabel(data.label, data.cardWidth - NODE_LABEL_CHROME, NODE_LABEL_FONT * data.fontScale);
  return (
    <div className={`relative flex h-full w-full items-center gap-1.5 rounded-lg border px-2 ${card} ${data.dimmed ? 'opacity-40' : ''}`}>
      <Handle type='target' position={Position.Left} id={HANDLE_IN} isConnectable={false} />
      <NodeGlyph glyph={data.glyph} />
      {/* Reaching the full name used to mean waiting out the native `title` delay. */}
      <Tooltip title={title} mouseEnterDelay={0.3}>
        <div className='min-w-0 flex-1'>
          <div className='dh-service-node__label truncate font-medium leading-none text-title'>{label}</div>
          {subtitle ? <div className='dh-service-node__subtitle mt-1 truncate leading-none text-hint'>{subtitle}</div> : null}
        </div>
      </Tooltip>
      <Handle type='source' position={Position.Right} id={HANDLE_OUT} isConnectable={false} />
    </div>
  );
}

function ServiceGraphEdge(props: EdgeProps<ServiceEdgeData>) {
  const { id, sourceX, sourceY, targetX, targetY, style, markerEnd, markerStart, data } = props;
  const [path, labelX, labelY] = getOffsetBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    curvature: data?.curvature,
    offset: data?.offset,
  });
  const showLabel = Boolean(data?.showErrorLabel);
  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} markerStart={markerStart} />
      {showLabel && data ? (
        <EdgeLabelRenderer>
          <EdgeMetricCard
            errorLabel={data.errorLabel}
            errorClass={data.errorClass || 'text-success'}
            errorRateLabel={data.errorRateLabel}
            directions={data.directions}
            expanded={data.expanded}
            pinned={data.pinned}
            closeLabel={data.closeLabel}
            qpsLabel={data.qpsLabel}
            p95Label={data.p95Label}
            labelX={labelX}
            labelY={labelY}
            onMouseEnter={data.onLabelEnter}
            onMouseLeave={data.onLabelLeave}
            onClick={data.onLabelClick}
            onClose={data.onLabelClick}
          />
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

const nodeTypes = { service: ServiceNode };
const edgeTypes = { service: ServiceGraphEdge };

function toRfNodes(
  laidOut: LaidOutNode[],
  labels: Record<string, string>,
  subtitles: Record<string, string>,
  glyphs: Record<string, PeerGlyph>,
): Node<ServiceNodeData>[] {
  return laidOut.map((node) => {
    const glyph = glyphs[node.id] || inferPeerGlyph(node.id, node.kind, node.connectionHint);
    const subtitle = node.kind === 'virtual' && glyph !== 'user' ? subtitles[node.id] || undefined : undefined;
    return {
      id: node.id,
      type: 'service',
      position: { x: node.x, y: node.y },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      style: { width: node.width, height: node.height },
      zIndex: 10,
      data: {
        label: labels[node.id] || node.id,
        subtitle,
        kind: node.kind,
        glyph,
        dimmed: false,
        emphasized: false,
        cardWidth: node.width,
        fontScale: 1,
      },
    };
  });
}

/** Keep RF handleBounds when only captions change so traces fill-back does not re-measure and flash edges. */
function reuseMeasuredNodes(current: Node<ServiceNodeData>[], next: Node<ServiceNodeData>[]): Node<ServiceNodeData>[] {
  if (current.length === 0) return next;
  const prev = new Map(current.map((node) => [node.id, node]));
  return next.map((node) => {
    const old = prev.get(node.id);
    if (!old) return node;
    if (old.style?.width !== node.style?.width || old.style?.height !== node.style?.height) return node;
    return { ...old, position: node.position, style: node.style, data: node.data };
  });
}

function usePaneHasSize(ref: React.RefObject<HTMLElement>): boolean {
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => {
      const box = el.getBoundingClientRect();
      setReady(box.width > 8 && box.height > 8);
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return ready;
}

function resolveHighlight(input: {
  edges: GraphDisplayEdge[];
  hoveredNode?: string;
  hoveredEdge?: string;
  selectedNode?: string;
  selectedId?: string;
}): GraphHighlight | null {
  const { edges, hoveredNode, hoveredEdge, selectedNode, selectedId } = input;
  if (hoveredNode) return incidentHighlight(hoveredNode, edges);
  if (hoveredEdge) {
    const edge = edges.find((item) => item.id === hoveredEdge);
    return edge ? endpointsHighlight(edge) : null;
  }
  if (selectedNode) return incidentHighlight(selectedNode, edges);
  if (selectedId) {
    const edge = edges.find((item) => item.id === selectedId);
    return edge ? endpointsHighlight(edge) : null;
  }
  return null;
}

interface IProps {
  edges: PharosServiceEdge[];
  rangeSeconds: number;
  selectedId?: string;
  selectedNode?: string;
  nodeLabels?: Record<string, string>;
  nodeSubtitles?: Record<string, string>;
  nodeGlyphs?: Record<string, PeerGlyph>;
  /** Detail 1-hop center; emphasizes the current service and anchors bidirectional peers downstream. */
  focusService?: string;
  /** Pins / unpins the metric chip of an edge; `undefined` clears the pin. */
  onSelectEdge: (id: string | undefined) => void;
  onSelectNode: (id: string | undefined, kind?: GraphNodeKind) => void;
}

function ServiceGraphCanvasInner(props: IProps) {
  const { edges, rangeSeconds, selectedId, selectedNode, nodeLabels, nodeSubtitles, nodeGlyphs, focusService, onSelectEdge, onSelectNode } = props;
  const { t } = useTranslation('trace');
  const { fitView, setCenter, viewportInitialized } = useReactFlow();
  const fitViewRef = useRef(fitView);
  fitViewRef.current = fitView;
  const setCenterRef = useRef(setCenter);
  setCenterRef.current = setCenter;
  const fitOpts = useMemo(() => graphFitViewOptions(), []);
  const nodesInitialized = useNodesInitialized();
  const paneWidth = useStore((state: ReactFlowState) => state.width);
  const paneHeight = useStore((state: ReactFlowState) => state.height);
  // Quantized so a pinch/scroll does not restyle every edge on each intermediate zoom level.
  const zoom = useStore((state: ReactFlowState) => quantizeZoom(state.transform[2]));
  const displayEdges = useMemo(() => mergeMutualEdges(edges, focusService), [edges, focusService]);
  // React Flow already keeps pane width/height in its store via a ResizeObserver; quantizing it
  // keeps a drag-resize from relayouting on every pixel (and from oscillating with the layout).
  const container = useMemo(
    () => quantizeViewport(paneWidth > 0 && paneHeight > 0 ? { width: paneWidth, height: paneHeight } : DEFAULT_VIEWPORT),
    [paneWidth, paneHeight],
  );
  const laidOutRaw = useMemo(
    () => layoutServiceGraph(displayEdges, nodeSubtitles, focusService, container),
    [displayEdges, nodeSubtitles, focusService, container],
  );
  const frozenLayoutRef = useRef<LaidOutNode[] | null>(null);
  const containerKeyRef = useRef(`${container.width}x${container.height}`);
  if (containerKeyRef.current !== `${container.width}x${container.height}`) {
    // Freezing exists to keep captions fill-back from moving cards; a real resize must move them.
    containerKeyRef.current = `${container.width}x${container.height}`;
    frozenLayoutRef.current = null;
  }
  const laidOut = useMemo(() => freezeLayoutPositions(frozenLayoutRef.current, laidOutRaw), [laidOutRaw]);
  frozenLayoutRef.current = laidOut;
  const [nodes, setNodes] = useState<Node<ServiceNodeData>[]>(() => toRfNodes(laidOut, nodeLabels || {}, nodeSubtitles || {}, nodeGlyphs || {}));
  const [hoveredNode, setHoveredNode] = useState<string>();
  const [hoveredEdge, setHoveredEdge] = useState<string>();
  const hoverLeaveTimer = useRef<number>();

  const setEdgeHover = useCallback((id?: string) => {
    if (hoverLeaveTimer.current) window.clearTimeout(hoverLeaveTimer.current);
    if (id) {
      setHoveredEdge(id);
      return;
    }
    hoverLeaveTimer.current = window.setTimeout(() => setHoveredEdge(undefined), 100);
  }, []);

  useLayoutEffect(() => {
    setNodes((current) => reuseMeasuredNodes(current, toRfNodes(laidOut, nodeLabels || {}, nodeSubtitles || {}, nodeGlyphs || {})));
  }, [laidOut, nodeLabels, nodeSubtitles, nodeGlyphs]);

  useEffect(
    () => () => {
      if (hoverLeaveTimer.current) window.clearTimeout(hoverLeaveTimer.current);
    },
    [],
  );

  const highlight = useMemo(
    () => resolveHighlight({ edges: displayEdges, hoveredNode, hoveredEdge, selectedNode, selectedId }),
    [displayEdges, hoveredNode, hoveredEdge, selectedNode, selectedId],
  );

  const fontScale = nodeFontScale(zoom);
  const displayNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        zIndex: 10,
        data: {
          ...node.data,
          fontScale,
          dimmed: Boolean(highlight) && !highlight?.nodes.has(node.id),
          emphasized: node.id === hoveredNode || node.id === focusService || node.id === selectedNode,
        },
      })),
    [nodes, highlight, hoveredNode, focusService, selectedNode, fontScale],
  );

  const bezierFans = useMemo(() => {
    const nodeY = new Map<string, number>();
    laidOut.forEach((node) => nodeY.set(node.id, node.y));
    return edgeBezierFans(displayEdges, nodeY);
  }, [displayEdges, laidOut]);

  const directionRow = useCallback(
    (metrics: EdgeDirectionMetrics, withTitle: boolean): EdgeMetricDirection => ({
      title: withTitle ? `${nodeLabels?.[metrics.client] || metrics.client} → ${nodeLabels?.[metrics.server] || metrics.server}` : undefined,
      errorLabel: formatErrorRatePercent(metrics.errorRate),
      errorClass: ERROR_TEXT_CLASS[errorTone(metrics.errorRate)],
      qps: formatQps(metrics.requestCount, rangeSeconds),
      p95: metrics.p95Seconds == null ? '-' : formatDuration(Math.round(metrics.p95Seconds * 1e6)),
    }),
    [nodeLabels, rangeSeconds],
  );

  const flowEdges: Edge<ServiceEdgeData>[] = useMemo(
    () =>
      displayEdges.map((edge) => {
        const id = edge.id;
        const highlighted = Boolean(highlight?.edges.has(id));
        const dimmed = Boolean(highlight) && !highlighted;
        const pinned = id === selectedId;
        const showExtra = id === hoveredEdge || pinned;
        const emphasis = edgeEmphasis({ errorRate: edge.errorRate, dimmed, highlighted });
        const stroke = emphasis.stroke;
        const fan = bezierFans.get(id);
        const geometry = edgeStrokeGeometry({
          screenWidth: (edgeStrokeWidth(edge.requestCount) + (highlighted ? EDGE_HIGHLIGHT_WIDTH_BOOST : 0)) * emphasis.screenWidthScale,
          zoom,
          screenConstantWidth: emphasis.screenConstantWidth,
        });
        // An open V rather than `ArrowClosed`: a filled wedge out-weighs the line it terminates.
        const marker = { type: MarkerType.Arrow, width: emphasis.markerSize, height: emphasis.markerSize, color: stroke };
        return {
          id,
          type: 'service',
          source: edge.client,
          target: edge.server,
          sourceHandle: HANDLE_OUT,
          targetHandle: HANDLE_IN,
          interactionWidth: 24,
          zIndex: edgeHighlightZIndex(highlighted),
          markerEnd: marker,
          // Arrowheads on both ends read as "these two call each other" without a second stroke.
          markerStart: edge.bidirectional ? marker : undefined,
          style: { stroke, ...geometry },
          data: {
            errorLabel: formatErrorRatePercent(edge.errorRate),
            errorClass: ERROR_TEXT_CLASS[errorTone(edge.errorRate)],
            errorRateLabel: t('graph.edge_chip.error_rate'),
            qpsLabel: t('graph.edge_chip.qps_avg'),
            p95Label: t('graph.edge_chip.p95'),
            directions: edge.backward
              ? [directionRow(edge.forward, true), directionRow(edge.backward, true)]
              : [directionRow(edge.forward, false)],
            expanded: showExtra,
            pinned,
            closeLabel: t('graph.edge_chip.unpin'),
            dimmed,
            // A pinned chip must survive the pointer leaving the edge, so it ignores the dim rule.
            showErrorLabel: pinned || edgeErrorLabelVisible({ errorRate: edge.errorRate, expanded: showExtra, dimmed }),
            curvature: fan?.curvature ?? BASE_BEZIER_CURVATURE,
            offset: fan?.offset ?? 0,
            onLabelEnter: () => setEdgeHover(id),
            onLabelLeave: () => setEdgeHover(undefined),
            onLabelClick: (event) => {
              event.stopPropagation();
              onSelectEdge(id);
            },
          },
        };
      }),
    [displayEdges, highlight, hoveredEdge, selectedId, t, setEdgeHover, onSelectEdge, bezierFans, directionRow, zoom],
  );

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
  }, []);

  const layoutToken = useMemo(() => laidOut.map((node) => `${node.id}:${Math.round(node.x)}:${Math.round(node.y)}`).join('\n'), [laidOut]);

  const viewportNodes = useMemo(
    () => laidOut.map((node) => ({ id: node.id, x: node.x, y: node.y, width: node.width, height: node.height })),
    [laidOut],
  );
  const viewportPlan = useMemo(() => planGraphViewport({ nodes: viewportNodes, paneWidth, paneHeight }), [viewportNodes, paneWidth, paneHeight]);
  const planRef = useRef<ViewportPlan | null>(viewportPlan);
  planRef.current = viewportPlan;
  const planToken = viewportPlan ? `${viewportPlan.zoom.toFixed(3)}:${Math.round(viewportPlan.center.x)}:${Math.round(viewportPlan.center.y)}` : '';
  // Panning is bounded by the graph plus a pane of slack, so "actual size" on a graph much larger
  // than the pane cannot be dragged into empty space.
  const translateExtent = useMemo(() => graphTranslateExtent({ nodes: viewportNodes, paneWidth, paneHeight }), [viewportNodes, paneWidth, paneHeight]);

  const applyViewport = useCallback(() => {
    if (!viewportInitialized || !nodesInitialized || !planRef.current) return false;
    return fitViewRef.current(fitOpts);
  }, [viewportInitialized, nodesInitialized, fitOpts]);

  /** Opens the graph at one graph pixel per screen pixel, matching the detail topology's cards. */
  const zoomToActualSize = useCallback(() => {
    const plan = planRef.current;
    if (!plan) return;
    setCenterRef.current(plan.center.x, plan.center.y, { zoom: GRAPH_ACTUAL_ZOOM, duration: 200 });
  }, []);

  // Every relayout re-hides the viewport until the new coordinates are on screen, otherwise the
  // first frame after a node-set change paints the fresh cards under the *previous* transform —
  // that is the flash of long lines crossing the canvas. `fitView` also reports false while a
  // freshly added card is unmeasured, so retry across frames, and always reveal on a timeout so
  // a stuck measure can never leave the canvas blank the way the earlier gate did.
  const [settledToken, setSettledToken] = useState('');
  useEffect(() => {
    if (laidOut.length === 0) {
      setSettledToken(layoutToken);
      return undefined;
    }
    let frame = 0;
    let left = FIT_RETRY_FRAMES;
    const reveal = () => setSettledToken(layoutToken);
    const attempt = () => {
      if (applyViewport()) {
        frame = window.requestAnimationFrame(reveal);
        return;
      }
      if (left <= 0) {
        reveal();
        return;
      }
      left -= 1;
      frame = window.requestAnimationFrame(attempt);
    };
    attempt();
    const timer = window.setTimeout(reveal, FIT_FALLBACK_MS);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [layoutToken, planToken, applyViewport, laidOut.length]);

  // Card text is inside the zoomed pane, so its screen size follows the fit zoom. The scale is a
  // custom property on the pane wrapper (one place, inherited by every card) rather than a class:
  // Tailwind is `important: true` here, so a `text-*` class would win over any inline size.
  // A no-op at 1:1, so the detail topology reads it as 1 until someone zooms that graph out too.
  const nodeFontVar = { '--dh-node-font-scale': fontScale } as React.CSSProperties;

  return (
    <ReactFlow
      style={nodeFontVar}
      className={`dh-service-graph bg-fc-50 ${settledToken === layoutToken ? '' : 'dh-service-graph--measuring'}`}
      nodes={displayNodes}
      edges={flowEdges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      minZoom={GRAPH_MIN_ZOOM}
      maxZoom={GRAPH_MAX_ZOOM}
      translateExtent={translateExtent}
      fitViewOptions={fitOpts}
      nodesConnectable={false}
      edgesUpdatable={false}
      deleteKeyCode={null}
      proOptions={{ hideAttribution: true }}
      onNodesChange={onNodesChange}
      onNodeClick={(_e, node) => {
        onSelectNode(node.id, node.data.kind);
      }}
      onEdgeClick={(_e, rfEdge) => {
        onSelectEdge(rfEdge.id);
      }}
      onNodeMouseEnter={(_e, node) => setHoveredNode(node.id)}
      onNodeMouseLeave={() => setHoveredNode(undefined)}
      onEdgeMouseEnter={(_e, edge) => setEdgeHover(edge.id)}
      onEdgeMouseLeave={() => setEdgeHover(undefined)}
      onPaneClick={() => {
        onSelectEdge(undefined);
        onSelectNode(undefined);
      }}
    >
      <Background color='var(--fc-border-base)' gap={24} size={1} />
      {/* Pairs with the built-in fit button: fit shows the whole graph, 1:1 makes the cards
          readable at the same size as the detail topology. */}
      <Controls showInteractive={false} fitViewOptions={fitOpts}>
        <ControlButton className='dh-service-graph__actual-size' title={t('graph.actual_size')} aria-label={t('graph.actual_size')} onClick={zoomToActualSize}>
          <span>1:1</span>
        </ControlButton>
      </Controls>
      <MiniMap
        pannable
        zoomable
        nodeColor={(node) => (node.data?.kind === 'virtual' ? 'var(--fc-fill-5)' : 'var(--fc-fill-4)')}
        maskColor='rgb(var(--fc-fill-3-rgb) / 0.5)'
        style={{ width: 168, height: 112 }}
      />
    </ReactFlow>
  );
}

export default function ServiceGraphCanvas(props: IProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const paneReady = usePaneHasSize(wrapRef);
  return (
    <div ref={wrapRef} className='h-full w-full'>
      {paneReady ? (
        <ReactFlowProvider>
          <ServiceGraphCanvasInner {...props} />
        </ReactFlowProvider>
      ) : null}
    </div>
  );
}
