import type { PharosServiceEdge } from '../contract';
import { edgeKey } from './promql';

export const TYPED_CONNECTIONS = ['database', 'messaging_system', 'virtual_node'] as const;

export function isTypedConnection(type: string): boolean {
  return type === 'database' || type === 'messaging_system' || type === 'virtual_node';
}

/** Product thresholds: green <1%, yellow <5%, red ≥5%. */
export function errorTone(rate: number): 'success' | 'warning' | 'error' {
  if (rate >= 0.05) return 'error';
  if (rate >= 0.01) return 'warning';
  return 'success';
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
 * bands (not washed-out grey). Thresholds stay product-defined: <1% / <5% / ≥5%.
 */
export function errorStroke(rate: number, alpha = 1): string {
  const rgb = rate >= 0.05 ? 'var(--fc-fill-error-rgb)' : rate >= 0.01 ? 'var(--fc-fill-warning-rgb)' : 'var(--fc-fill-success-rgb)';
  return `rgb(${rgb} / ${alpha})`;
}

/** Product threshold for "nothing to look at here": below it an edge is connective tissue. */
export const HEALTHY_ERROR_RATE = 0.01;

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
 * Healthy edges keep the green band — the graph read as a wall of lines because of their weight,
 * not their hue — but they take the pale, low-chroma step of the green ramp rather than the solid
 * one. `--fc-green-5` / `--fc-green-7` are alpha-over-canvas tokens, so they land pale on the
 * light theme and soft-but-visible on the dark one, and they already carry their own alpha: the
 * weight is in the colour, which is what lets the arrowhead (a plain `fill`) match the stroke.
 * Yellow and red keep the solid `--fc-fill-*` bands at full attention.
 */
export const EDGE_HEALTHY_STROKE = 'var(--fc-green-7)';
export const EDGE_HEALTHY_STROKE_DIM = 'var(--fc-green-5)';

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
export const EDGE_HEALTHY_SCREEN_SCALE = 0.7;

export interface EdgeEmphasis {
  stroke: string;
  /** Anomalies hold their screen width; healthy edges thin out with the zoom. */
  screenConstantWidth: boolean;
  /** Multiplier on the volume-derived screen width. */
  screenWidthScale: number;
  markerSize: number;
}

/**
 * Colour, weight class and arrowhead size of one edge — the same rule on both topologies.
 *
 * The three colour bands stay: the canvas read as "all lines" because of weight, not hue. So the
 * healthy band drops the zoom compensation and moves to the pale end of the green ramp, while
 * yellow and red keep both their solid colour and a constant screen width — one clear step heavier
 * than the hairlines around them, but still thin. Hovering or selecting is a request to follow an
 * edge, so it comes back at full weight and full colour.
 *
 * Nothing here is mode-dependent: the two topologies differ in how much canvas they have, not in
 * what an edge means, and a healthy edge that is a whisper on one graph cannot be the loudest thing
 * on the other. The on-screen widths still land slightly apart, because the detail graph sits at
 * 1:1 while the global one fits below it — that is the zoom, not a second rule.
 */
export function edgeEmphasis(input: { errorRate: number; dimmed: boolean; highlighted: boolean }): EdgeEmphasis {
  const banded = errorStroke(input.errorRate, edgeStrokeAlpha(input));
  if (input.highlighted) {
    return { stroke: banded, screenConstantWidth: true, screenWidthScale: 1, markerSize: EDGE_MARKER_SIZE };
  }
  if (!isHealthyEdge(input.errorRate)) {
    return { stroke: banded, screenConstantWidth: true, screenWidthScale: EDGE_ANOMALY_SCREEN_SCALE, markerSize: EDGE_MARKER_SIZE };
  }
  return {
    stroke: input.dimmed ? EDGE_HEALTHY_STROKE_DIM : EDGE_HEALTHY_STROKE,
    screenConstantWidth: false,
    screenWidthScale: EDGE_HEALTHY_SCREEN_SCALE,
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
 * label readable. It only bites on a graph too wide to reach that scale even with the gaps fully
 * squeezed — the cards alone overflow — where growing the text is the last lever left that does
 * not feed back into the layout.
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

export function edgeStrokeAlpha(input: { dimmed: boolean; highlighted: boolean; errorRate?: number }): number {
  if (input.dimmed) return 0.22;
  if (input.highlighted) return 1;
  const rate = input.errorRate ?? 0;
  if (rate >= 0.05) return 1;
  if (rate >= 0.01) return 0.92;
  return 0.78;
}

export interface GraphHighlight {
  nodes: Set<string>;
  edges: Set<string>;
}

/** Edges touching `center`, plus their endpoints. Used for hover / click neighborhood. */
export function incidentHighlight(center: string, edges: PharosServiceEdge[]): GraphHighlight {
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
