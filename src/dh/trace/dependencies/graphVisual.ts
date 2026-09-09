import { ERROR_RATE_WARNING, errorRateLevel, statusFillRgb, type StatusLevel } from '@/dh/status';

import type { PharosServiceEdge } from '../contract';
import { edgeKey } from './promql';

export const TYPED_CONNECTIONS = ['database', 'messaging_system', 'virtual_node'] as const;

export function isTypedConnection(type: string): boolean {
  return type === 'database' || type === 'messaging_system' || type === 'virtual_node';
}

export function formatErrorRatePercent(rate: number): string {
  const pct = rate * 100;
  if (pct === 0) return '0%';
  if (pct < 1) return `${pct.toFixed(2)}%`;
  if (pct < 10) return `${pct.toFixed(1)}%`;
  return `${Math.round(pct)}%`;
}

/**
 * Non-zero error rates stay on the path. 0% is hover/select only — a full graph of
 * healthy edges otherwise stacks identical chips on the same corridor.
 */
export function edgeErrorLabelVisible(input: { errorRate: number; expanded: boolean; dimmed: boolean }): boolean {
  if (input.dimmed) return false;
  if (input.errorRate > 0) return true;
  return input.expanded;
}

/**
 * Window-mean QPS: `increase(traces_service_graph_request_total[range]) / range`.
 * `requestCount` is already that increase (not a peak / max_over_time).
 */
export function formatQps(requestCount: number, rangeSeconds: number): string {
  if (rangeSeconds <= 0) return '-';
  const qps = requestCount / rangeSeconds;
  if (qps >= 100) return qps.toFixed(0);
  if (qps >= 1) return qps.toFixed(1);
  return qps.toFixed(2);
}

/**
 * Keep only edges that touch `service` (and therefore only those endpoints).
 * Neighbors-of-neighbors are dropped — filter the data, do not hide with CSS.
 */
export function filterOneHopEdges(edges: PharosServiceEdge[], service: string): PharosServiceEdge[] {
  if (!service) return edges;
  return edges.filter((edge) => edge.client === service || edge.server === service);
}

/**
 * Stroke uses token RGB + alpha so idle edges still show the three error-rate
 * bands (not washed-out grey), from the same tokens the text classes use.
 */
export function errorStroke(rate: number, alpha = 1): string {
  return statusFillRgb(errorRateLevel(rate), alpha);
}

/** Product threshold for "nothing to look at here": below it an edge is connective tissue. */
export const HEALTHY_ERROR_RATE = ERROR_RATE_WARNING;

export function isHealthyEdge(rate: number): boolean {
  return rate < HEALTHY_ERROR_RATE;
}

/**
 * Interaction floor: the user may deliberately zoom all the way out to eyeball the shape of a
 * large graph. The opening viewport always fits the whole graph — an earlier build cropped large
 * graphs around a "busiest node" anchor, which pushed the layout off-centre and left services
 * unreachable without dragging. Reading a large graph is now an explicit act: the 1:1 button.
 */
export const GRAPH_MIN_ZOOM = 0.1;
export const GRAPH_MAX_ZOOM = 1.6;
export const GRAPH_FIT_MAX_ZOOM = 1;
export const GRAPH_FIT_PADDING = 0.12;
/** "Actual size": one graph pixel per screen pixel, so cards match the detail topology exactly. */
export const GRAPH_ACTUAL_ZOOM = 1;

export function graphFitViewOptions(): { padding: number; maxZoom: number; minZoom: number } {
  return { padding: GRAPH_FIT_PADDING, maxZoom: GRAPH_FIT_MAX_ZOOM, minZoom: GRAPH_MIN_ZOOM };
}

export interface ViewportNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GraphBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  center: { x: number; y: number };
}

export function graphBounds(nodes: ViewportNode[]): GraphBounds | null {
  if (nodes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  nodes.forEach((node) => {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
  });
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxY - minY, 1),
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
  };
}

export interface ViewportPlan {
  zoom: number;
  center: { x: number; y: number };
}

/**
 * Opening viewport: always the whole graph, centred on its bounding box. Pure so the zoom the
 * canvas will open at is testable without a browser.
 */
export function planGraphViewport(input: { nodes: ViewportNode[]; paneWidth: number; paneHeight: number }): ViewportPlan | null {
  const { nodes, paneWidth, paneHeight } = input;
  const bounds = graphBounds(nodes);
  if (!bounds || paneWidth <= 0 || paneHeight <= 0) return null;
  const usableWidth = paneWidth * (1 - GRAPH_FIT_PADDING * 2);
  const usableHeight = paneHeight * (1 - GRAPH_FIT_PADDING * 2);
  return {
    zoom: Math.min(usableWidth / bounds.width, usableHeight / bounds.height, GRAPH_FIT_MAX_ZOOM),
    center: bounds.center,
  };
}

/** Panning room around the graph, so 1:1 never lets the user drag the graph out of sight. */
export const GRAPH_PAN_MARGIN_RATIO = 0.5;
export const GRAPH_PAN_MARGIN_MIN = 240;

/**
 * `translateExtent` for React Flow: the bounding box plus half a pane of slack on each side.
 * Without it, zooming to 1:1 on a graph far larger than the pane makes it easy to drag into
 * empty space with nothing on screen to steer back by.
 */
export function graphTranslateExtent(input: { nodes: ViewportNode[]; paneWidth: number; paneHeight: number }): [[number, number], [number, number]] | undefined {
  const bounds = graphBounds(input.nodes);
  if (!bounds) return undefined;
  const marginX = Math.max(input.paneWidth * GRAPH_PAN_MARGIN_RATIO, GRAPH_PAN_MARGIN_MIN);
  const marginY = Math.max(input.paneHeight * GRAPH_PAN_MARGIN_RATIO, GRAPH_PAN_MARGIN_MIN);
  return [
    [bounds.minX - marginX, bounds.minY - marginY],
    [bounds.maxX + marginX, bounds.maxY + marginY],
  ];
}

/**
 * Volume is a slight width change. The baseline is deliberately thin: at 1:1 (the detail
 * topology, and the global one in "actual size") a heavier stroke out-weighs the 1px card border
 * and the canvas reads as lines with services attached rather than the other way round.
 */
export function edgeStrokeWidth(requestCount: number): number {
  return Math.min(1.8, 1 + Math.log10(Math.max(requestCount, 1)) * 0.22);
}

/** Hover/select neighborhood: thick enough to follow through crossings, not a ribbon. */
export const EDGE_HIGHLIGHT_WIDTH_BOOST = 0.8;

/** Screen-pixel bounds for a stroke: below 1 it breaks up on a HiDPI downscale, above 2.2 it blobs. */
export const EDGE_SCREEN_STROKE_MIN = 1;
export const EDGE_SCREEN_STROKE_MAX = 2.2;
/**
 * Floor for the strokes that are *allowed* to shrink with the zoom. It only bites far below the
 * fit zoom of a large graph, where a hairline would otherwise anti-alias itself away completely.
 */
export const EDGE_QUIET_SCREEN_STROKE_MIN = 0.5;
/** Dash pattern in screen pixels, compensated the same way as the width. */
const EDGE_DASH_ON = 6;
const EDGE_DASH_OFF = 4;
/** Zoom is rounded to this before it reaches the edge styles, so panning/zooming is not a restyle storm. */
export const EDGE_ZOOM_QUANTUM = 0.1;

export function quantizeZoom(zoom: number, quantum = EDGE_ZOOM_QUANTUM): number {
  if (!Number.isFinite(zoom) || zoom <= 0) return quantum;
  return Math.max(quantum, Math.round(zoom / quantum) * quantum);
}

export interface EdgeStrokeGeometry {
  strokeWidth: number;
  strokeDasharray: string;
}

/**
 * React Flow zooms by transforming the pane, so a constant `stroke-width` renders thinner the
 * further out you are — which is exactly why the same edge looked heavy on the detail topology
 * and thin on the global one. `vector-effect: non-scaling-stroke` does not help here (the
 * transform is a CSS transform on an ancestor div, outside the SVG's CTM), so the width is
 * divided by the zoom instead, making the *screen* width the constant.
 *
 * `screenConstantWidth: false` opts out of that compensation, which is the whole point of the
 * quiet band: a 30-node global graph fits at roughly half scale, so the cards halve while a
 * compensated stroke does not, and the canvas ends up reading as lines with services attached.
 * A quiet edge halves along with the cards instead. The dash pattern keeps its compensation
 * either way — dash length is rhythm, not weight, and letting it shrink too turns a thinning
 * hairline into a dotted smear.
 */
export function edgeStrokeGeometry(input: { screenWidth: number; zoom: number; screenConstantWidth?: boolean }): EdgeStrokeGeometry {
  const zoom = Number.isFinite(input.zoom) && input.zoom > 0 ? input.zoom : 1;
  const round = (value: number) => Math.round(value * 100) / 100;
  const strokeDasharray = `${round(EDGE_DASH_ON / zoom)} ${round(EDGE_DASH_OFF / zoom)}`;
  if (input.screenConstantWidth === false) {
    return { strokeWidth: round(Math.max(input.screenWidth, EDGE_QUIET_SCREEN_STROKE_MIN / zoom)), strokeDasharray };
  }
  const onScreen = Math.min(Math.max(input.screenWidth, EDGE_SCREEN_STROKE_MIN), EDGE_SCREEN_STROKE_MAX);
  return { strokeWidth: round(onScreen / zoom), strokeDasharray };
}

/**
 * Healthy edges stay green — never grey — and already carry alpha in the `--fc-green-*` ramp.
 * Layered contrast spends that ramp: quiet calls sit on the pale end so the structure is still
 * there, busy calls step up, and hover-dim drops one more step. Yellow and red keep `--fc-fill-*`.
 */
export const EDGE_HEALTHY_STROKE_QUIET = 'var(--fc-green-3)';
export const EDGE_HEALTHY_STROKE = 'var(--fc-green-5)';
export const EDGE_HEALTHY_STROKE_PRIMARY = 'var(--fc-green-7)';
export const EDGE_HEALTHY_STROKE_DIM = 'var(--fc-green-2)';

/** Default: weight follows volume. Uniform: every healthy edge uses the same solid step. */
export type EdgeContrastMode = 'layered' | 'uniform';

/**
 * Page-level initial contrast. Global topology has no focus service → layered.
 * Service-detail topology (`focusService` set) → uniform. No persist — only the first paint.
 */
export function defaultEdgeContrast(focusService?: string): EdgeContrastMode {
  return focusService ? 'uniform' : 'layered';
}

/**
 * Log-scaled 0–1 share of the busiest edge. Every edge stays drawn; this only feeds weight.
 * Linear rank would collapse a long tail of small calls against one hot path.
 */
export function edgeVolumeRank(requestCount: number, maxRequestCount: number): number {
  if (!Number.isFinite(requestCount) || requestCount <= 0) return 0;
  if (!Number.isFinite(maxRequestCount) || maxRequestCount <= 0) return 0;
  const capped = Math.min(requestCount, maxRequestCount);
  return Math.log10(capped + 1) / Math.log10(maxRequestCount + 1);
}

export const EDGE_VOLUME_MID_RANK = 0.4;
export const EDGE_VOLUME_PRIMARY_RANK = 0.7;

export function healthyLayeredStroke(rank: number): string {
  if (rank >= EDGE_VOLUME_PRIMARY_RANK) return EDGE_HEALTHY_STROKE_PRIMARY;
  if (rank >= EDGE_VOLUME_MID_RANK) return EDGE_HEALTHY_STROKE;
  return EDGE_HEALTHY_STROKE_QUIET;
}

/**
 * Arrowhead box, in `markerUnits="strokeWidth"` — React Flow's markers are multiples of the
 * stroke, not absolute pixels, so a head is roughly `size / 4` stroke widths long and shrinks on
 * its own as the stroke thins. Both graphs draw the open V (`MarkerType.Arrow`), which is an
 * outline rather than a filled wedge and so needs a wider box than a closed head to read at all;
 * the thin healthy band needs the widest, to buy back what its hairline stroke takes away.
 */
export const EDGE_MARKER_SIZE = 15;
export const EDGE_MARKER_SIZE_THIN = 22;

/**
 * Anomalies keep a constant screen width, but a thinner one. They only have to out-weigh the
 * healthy hairlines next to them, not the node cards.
 */
export const EDGE_ANOMALY_SCREEN_SCALE = 0.75;
/**
 * ...and the healthy band goes thinner still. Dropping the zoom compensation is most of the effect
 * on a graph fitted at half scale, but both topologies also sit at or near 1:1 — the global one
 * after the spacing solve, the detail one always — where an uncompensated stroke is back at its
 * full width. So the baseline itself has to come down for the lines to stay subordinate to the
 * cards at every zoom. This is also what thins the detail topology, where the zoom compensation
 * alone would have been a no-op: the scale factor and the skipped `EDGE_SCREEN_STROKE_MIN` clamp
 * apply at 1:1 just the same.
 */
export const EDGE_HEALTHY_SCALE_MIN = 0.32;
export const EDGE_HEALTHY_SCALE_MAX = 0.85;
export const EDGE_HEALTHY_SCALE_UNIFORM = 0.7;

export interface EdgeEmphasis {
  stroke: string;
  /** Anomalies hold their screen width; healthy edges thin out with the zoom. */
  screenConstantWidth: boolean;
  /** Multiplier on the volume-derived screen width. */
  screenWidthScale: number;
  markerSize: number;
}

export interface EdgeEmphasisInput {
  errorRate: number;
  dimmed: boolean;
  highlighted: boolean;
  requestCount?: number;
  maxRequestCount?: number;
  /** Defaults to layered: low-traffic greens whisper, busy greens read, anomalies stay loud. */
  contrast?: EdgeContrastMode;
}

/**
 * Colour, weight class and arrowhead size of one edge — the same rule on both topologies.
 *
 * Edges are not dropped. Layered contrast spends weight: a quiet healthy call is a hairline, a
 * busy one is a real stroke, and yellow/red stay a constant screen width even when their volume
 * is tiny. Uniform contrast flattens the healthy band so a large screen can treat every line as
 * equal. Hovering or selecting is a request to follow an edge, so it comes back at full weight.
 */
export function edgeEmphasis(input: EdgeEmphasisInput): EdgeEmphasis {
  const contrast = input.contrast ?? 'layered';
  const rank = edgeVolumeRank(input.requestCount ?? 0, input.maxRequestCount ?? 0);
  const banded = errorStroke(input.errorRate, edgeStrokeAlpha(input));
  if (input.highlighted) {
    return { stroke: banded, screenConstantWidth: true, screenWidthScale: 1, markerSize: EDGE_MARKER_SIZE };
  }
  if (!isHealthyEdge(input.errorRate)) {
    return { stroke: banded, screenConstantWidth: true, screenWidthScale: EDGE_ANOMALY_SCREEN_SCALE, markerSize: EDGE_MARKER_SIZE };
  }
  if (contrast === 'uniform') {
    return {
      stroke: input.dimmed ? EDGE_HEALTHY_STROKE_DIM : EDGE_HEALTHY_STROKE_PRIMARY,
      screenConstantWidth: false,
      screenWidthScale: EDGE_HEALTHY_SCALE_UNIFORM,
      markerSize: EDGE_MARKER_SIZE_THIN,
    };
  }
  const scale = EDGE_HEALTHY_SCALE_MIN + rank * (EDGE_HEALTHY_SCALE_MAX - EDGE_HEALTHY_SCALE_MIN);
  return {
    stroke: input.dimmed ? EDGE_HEALTHY_STROKE_DIM : healthyLayeredStroke(rank),
    screenConstantWidth: false,
    screenWidthScale: Math.round(scale * 100) / 100,
    markerSize: EDGE_MARKER_SIZE_THIN,
  };
}

/**
 * Base sizes of the node card's text, mirroring the Tailwind scale (`l1` / `xs` / `base`). They
 * live here rather than in a class because the card is inside the zoomed pane, so the *screen*
 * size is what needs a floor — see `nodeFontScale`.
 */
export const NODE_LABEL_FONT = 14;
/**
 * Safety net under the spacing solve (`CARD_MIN_FIT_SCALE`), which is what is supposed to keep the
 * label readable. It only bites on a graph too wide to reach that scale even with the vertical
 * gaps fully squeezed — ranksep is no longer given up for fit — where growing the text is the
 * last lever left that does not feed back into the layout.
 */
export const NODE_MIN_SCREEN_FONT = 10.5;
/**
 * Ceiling on the boost. The card width is the dominant term in the bounding box (see
 * `SERVICE_NODE_WIDTH`), so it cannot grow with the text: every point of boost buys screen pixels
 * by spending characters. 1.45 is where a large graph clears the "no longer a grey smudge"
 * threshold while a name like `rome-sec-quote` still truncates no worse than it already did.
 */
export const NODE_MAX_FONT_BOOST = 1.45;

/**
 * Screen-size floor for node text: at the fit zoom of a 30-node graph a 14px label lands near
 * 5.5px, which is where the cards stop being cards and the edges take over the canvas. Scaling
 * the text up in graph units is the only lever that does not feed back into the layout.
 */
export function nodeFontScale(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= 0) return 1;
  const needed = NODE_MIN_SCREEN_FONT / (NODE_LABEL_FONT * zoom);
  const scale = Math.min(Math.max(needed, 1), NODE_MAX_FONT_BOOST);
  return Math.round(scale * 100) / 100;
}

export function edgeHighlightZIndex(highlighted: boolean): number {
  return highlighted ? 2 : 0;
}

/** Opacity follows the same three bands as the colour, so a worse edge is also a firmer line. */
const EDGE_ALPHA: Record<StatusLevel, number> = { success: 0.78, warning: 0.92, error: 1 };

export function edgeStrokeAlpha(input: { dimmed: boolean; highlighted: boolean; errorRate?: number }): number {
  if (input.dimmed) return 0.12;
  if (input.highlighted) return 1;
  return EDGE_ALPHA[errorRateLevel(input.errorRate ?? 0)];
}

export interface GraphHighlight {
  nodes: Set<string>;
  edges: Set<string>;
}

/** Edges touching `center`, plus their endpoints. Used for hover / click neighborhood. */
export function incidentHighlight(center: string, edges: ReadonlyArray<PharosServiceEdge>): GraphHighlight {
  const nodes = new Set<string>([center]);
  const ids = new Set<string>();
  edges.forEach((edge) => {
    if (edge.client !== center && edge.server !== center) return;
    nodes.add(edge.client);
    nodes.add(edge.server);
    ids.add(edgeKey(edge.client, edge.server, edge.connectionType));
  });
  return { nodes, edges: ids };
}

export function endpointsHighlight(edge: PharosServiceEdge): GraphHighlight {
  return {
    nodes: new Set([edge.client, edge.server]),
    edges: new Set([edgeKey(edge.client, edge.server, edge.connectionType)]),
  };
}

/** Drawn edge with a stable id — the highlight resolver keys off this, not a reconstructed pair. */
export interface HighlightableEdge extends PharosServiceEdge {
  id: string;
}

export interface ResolveHighlightInput {
  edges: ReadonlyArray<HighlightableEdge>;
  hoveredNode?: string;
  hoveredEdge?: string;
  selectedNode?: string;
  /** Click-pinned RED chip. Outranks hover so zoom / pointer jitter cannot steal the highlight. */
  pinnedEdge?: string;
}

function highlightByEdgeId(edges: ReadonlyArray<HighlightableEdge>, id: string | undefined): GraphHighlight | null {
  if (!id) return null;
  const edge = edges.find((item) => item.id === id);
  return edge ? endpointsHighlight(edge) : null;
}

/**
 * One highlight owner at a time. A pinned edge keeps the RED chip and neighborhood until
 * explicitly released; node hover otherwise lights every incident edge.
 */
export function resolveHighlight(input: ResolveHighlightInput): GraphHighlight | null {
  const pinned = highlightByEdgeId(input.edges, input.pinnedEdge);
  if (pinned) return pinned;
  if (input.hoveredNode) return incidentHighlight(input.hoveredNode, input.edges);
  const hovered = highlightByEdgeId(input.edges, input.hoveredEdge);
  if (hovered) return hovered;
  if (input.selectedNode) return incidentHighlight(input.selectedNode, input.edges);
  return null;
}
