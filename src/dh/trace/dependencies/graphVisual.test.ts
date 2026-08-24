import type { PharosServiceEdge } from '../contract';
import { edgeKey } from './promql';
import {
  EDGE_HIGHLIGHT_WIDTH_BOOST,
  edgeEmphasis,
  edgeErrorLabelVisible,
  edgeHighlightZIndex,
  edgeStrokeAlpha,
  edgeStrokeGeometry,
  edgeStrokeWidth,
  endpointsHighlight,
  errorStroke,
  filterOneHopEdges,
  formatErrorRatePercent,
  formatQps,
  graphBounds,
  graphTranslateExtent,
  isHealthyEdge,
  nodeFontScale,
  EDGE_MARKER_SIZE,
  EDGE_MARKER_SIZE_THIN,
  EDGE_QUIET_SCREEN_STROKE_MIN,
  EDGE_SCREEN_STROKE_MAX,
  EDGE_SCREEN_STROKE_MIN,
  GRAPH_ACTUAL_ZOOM,
  GRAPH_MAX_ZOOM,
  GRAPH_MIN_ZOOM,
  NODE_LABEL_FONT,
  NODE_MAX_FONT_BOOST,
  NODE_MIN_SCREEN_FONT,
  graphFitViewOptions,
  incidentHighlight,
  isTypedConnection,
  planGraphViewport,
  quantizeZoom,
} from './graphVisual';
import { SERVICE_NODE_WIDTH, layoutServiceGraph } from './layout';

function edge(client: string, server: string, connectionType = '', errorRate = 0, requestCount = 1): PharosServiceEdge {
  return { client, server, connectionType, requestCount, failedCount: 0, errorRate };
}

describe('graphVisual', () => {
  it('keeps product error-rate thresholds and token RGB (not hex)', () => {
    expect(errorStroke(0)).toContain('--fc-fill-success-rgb');
    expect(errorStroke(0.009)).toContain('--fc-fill-success-rgb');
    expect(errorStroke(0.01)).toContain('--fc-fill-warning-rgb');
    expect(errorStroke(0.049)).toContain('--fc-fill-warning-rgb');
    expect(errorStroke(0.05)).toContain('--fc-fill-error-rgb');
    expect(errorStroke(0, 0.78)).toMatch(/\/ 0\.78\)$/);
  });

  it('keeps volume readable as a thin line, never a ribbon', () => {
    expect(edgeStrokeWidth(1)).toBeLessThanOrEqual(1.1);
    expect(edgeStrokeWidth(100)).toBeGreaterThan(edgeStrokeWidth(1));
    expect(edgeStrokeWidth(1e6)).toBe(1.8);
  });

  it('holds the on-screen stroke constant across zoom levels', () => {
    const atFit = edgeStrokeGeometry({ screenWidth: 1.4, zoom: 0.7 });
    const atActual = edgeStrokeGeometry({ screenWidth: 1.4, zoom: 1 });
    expect(atFit.strokeWidth * 0.7).toBeCloseTo(atActual.strokeWidth * 1, 2);
    // Dashes are compensated too, otherwise a zoomed-out edge reads as a fainter line.
    expect(atFit.strokeDasharray).toBe('8.57 5.71');
    expect(atActual.strokeDasharray).toBe('6 4');
  });

  it('clamps the on-screen stroke so edges neither vanish nor blob together', () => {
    expect(edgeStrokeGeometry({ screenWidth: 0.2, zoom: 1 }).strokeWidth).toBe(EDGE_SCREEN_STROKE_MIN);
    expect(edgeStrokeGeometry({ screenWidth: 9, zoom: 1 }).strokeWidth).toBe(EDGE_SCREEN_STROKE_MAX);
    // Even the widest highlighted edge stays inside the screen band once compensated.
    const widest = edgeStrokeGeometry({ screenWidth: edgeStrokeWidth(1e6) + EDGE_HIGHLIGHT_WIDTH_BOOST, zoom: 0.4 });
    expect(widest.strokeWidth * 0.4).toBeLessThanOrEqual(EDGE_SCREEN_STROKE_MAX);
  });

  it('survives a degenerate zoom instead of dividing by zero', () => {
    expect(edgeStrokeGeometry({ screenWidth: 1.4, zoom: 0 }).strokeWidth).toBe(1.4);
    expect(quantizeZoom(0)).toBeGreaterThan(0);
    expect(quantizeZoom(0.73)).toBeCloseTo(0.7, 5);
    expect(quantizeZoom(0.76)).toBeCloseTo(0.8, 5);
  });

  it('lets the user zoom far out by hand while the opening fit stays capped at 1:1', () => {
    expect(GRAPH_MIN_ZOOM).toBeLessThanOrEqual(0.2);
    expect(graphFitViewOptions().minZoom).toBe(GRAPH_MIN_ZOOM);
    expect(graphFitViewOptions().maxZoom).toBe(1);
    expect(GRAPH_MAX_ZOOM).toBeGreaterThan(1);
    expect(GRAPH_ACTUAL_ZOOM).toBe(1);
  });

  it('lets a healthy edge thin out with the zoom instead of holding a constant screen width', () => {
    const geometry = edgeStrokeGeometry({ screenWidth: 1.4, zoom: 0.4, screenConstantWidth: false });
    expect(geometry.strokeWidth).toBe(1.4);
    expect(geometry.strokeWidth * 0.4).toBeCloseTo(0.56, 2);
    // Dash length is rhythm, not weight: it stays compensated so a thinning line does not smear.
    expect(geometry.strokeDasharray).toBe(edgeStrokeGeometry({ screenWidth: 1.4, zoom: 0.4 }).strokeDasharray);
  });

  it('keeps the thinnest edges from anti-aliasing themselves away when zoomed far out', () => {
    const geometry = edgeStrokeGeometry({ screenWidth: 1, zoom: 0.2, screenConstantWidth: false });
    expect(geometry.strokeWidth * 0.2).toBeCloseTo(EDGE_QUIET_SCREEN_STROKE_MIN, 2);
  });

  it('keeps the healthy band green — a pale green, never a grey', () => {
    const idle = edgeEmphasis({ errorRate: 0, dimmed: false, highlighted: false });
    const dimmed = edgeEmphasis({ errorRate: 0, dimmed: true, highlighted: false });
    expect(idle.stroke).toContain('--fc-green-');
    expect(dimmed.stroke).toContain('--fc-green-');
    expect(dimmed.stroke).not.toBe(idle.stroke);
    // Following an edge is worth the full band colour, so hover restores the solid green.
    const hovered = edgeEmphasis({ errorRate: 0, dimmed: false, highlighted: true });
    expect(hovered.stroke).toContain('--fc-fill-success-rgb');
  });

  it('leaves yellow and red on the solid bands', () => {
    [0.02, 0.09].forEach((rate) => {
      const emphasis = edgeEmphasis({ errorRate: rate, dimmed: false, highlighted: false });
      expect(emphasis.stroke).toBe(errorStroke(rate, edgeStrokeAlpha({ dimmed: false, highlighted: false, errorRate: rate })));
    });
  });

  it('sizes the arrowhead by weight class', () => {
    // Both graphs draw the same open V (see `Graph.tsx`), so the box only tracks stroke weight:
    // one size for every solid-weight edge, a wider one for the hairline healthy band.
    const anomaly = edgeEmphasis({ errorRate: 0.09, dimmed: false, highlighted: false });
    const hovered = edgeEmphasis({ errorRate: 0, dimmed: false, highlighted: true });
    const hairline = edgeEmphasis({ errorRate: 0, dimmed: false, highlighted: false });
    expect(anomaly.markerSize).toBe(EDGE_MARKER_SIZE);
    expect(hovered.markerSize).toBe(EDGE_MARKER_SIZE);
    expect(hairline.markerSize).toBe(EDGE_MARKER_SIZE_THIN);
    expect(hairline.markerSize).toBeGreaterThan(anomaly.markerSize);
  });

  it('thins healthy edges and keeps anomalies screen-constant', () => {
    const healthy = edgeEmphasis({ errorRate: 0, dimmed: false, highlighted: false });
    const warning = edgeEmphasis({ errorRate: 0.02, dimmed: false, highlighted: false });
    const error = edgeEmphasis({ errorRate: 0.09, dimmed: false, highlighted: false });
    expect(healthy.screenConstantWidth).toBe(false);
    expect(warning.screenConstantWidth).toBe(true);
    expect(error.screenConstantWidth).toBe(true);
    // Anomalies stay one step heavier than the hairlines around them, but thinner than they were.
    expect(warning.screenWidthScale).toBeLessThan(1);
    expect(warning.screenWidthScale).toBeGreaterThan(0.5);
    // Arrowheads are in stroke-width units, so the thin band needs a bigger box to stay visible.
    expect(healthy.markerSize).toBe(EDGE_MARKER_SIZE_THIN);
    expect(warning.markerSize).toBe(EDGE_MARKER_SIZE);
    // Healthy is the thinnest band at any zoom, not just when the graph is fitted small.
    expect(healthy.screenWidthScale).toBeLessThan(warning.screenWidthScale);
  });

  it('thins the healthy band at 1:1, where dropping the zoom compensation alone would not', () => {
    // The detail topology never leaves 1:1, so it thins only because of the scale factor and the
    // `EDGE_SCREEN_STROKE_MIN` clamp the quiet band skips — not because of the compensation.
    const busiest = edgeStrokeWidth(1e6);
    const healthy = edgeEmphasis({ errorRate: 0, dimmed: false, highlighted: false });
    const quiet = edgeStrokeGeometry({ screenWidth: busiest * healthy.screenWidthScale, zoom: 1, screenConstantWidth: healthy.screenConstantWidth });
    const previous = edgeStrokeGeometry({ screenWidth: busiest, zoom: 1, screenConstantWidth: true });
    expect(quiet.strokeWidth).toBeLessThan(previous.strokeWidth);
    expect(quiet.strokeWidth).toBeLessThan(1.3);
  });

  it('restores full weight to a hovered healthy edge so it can be followed', () => {
    const hovered = edgeEmphasis({ errorRate: 0, dimmed: false, highlighted: true });
    expect(hovered.screenConstantWidth).toBe(true);
    expect(hovered.screenWidthScale).toBe(1);
  });

  it('floors node label size on screen without letting the boost eat the whole card', () => {
    expect(nodeFontScale(1)).toBe(1);
    expect(nodeFontScale(0.8)).toBe(1);
    // At the fit zoom of a large graph the label would land near 5.5px; the floor lifts it.
    expect(NODE_LABEL_FONT * nodeFontScale(0.4) * 0.4).toBeGreaterThan(7.5);
    expect(NODE_LABEL_FONT * nodeFontScale(0.62) * 0.62).toBeCloseTo(NODE_MIN_SCREEN_FONT, 1);
    expect(nodeFontScale(0.1)).toBe(NODE_MAX_FONT_BOOST);
    expect(nodeFontScale(0)).toBe(1);
  });

  it('uses the product healthy threshold, not a separate one', () => {
    expect(isHealthyEdge(0.009)).toBe(true);
    expect(isHealthyEdge(0.01)).toBe(false);
  });

  it('boosts hovered/selected edges enough to follow through crossings', () => {
    expect(EDGE_HIGHLIGHT_WIDTH_BOOST).toBeGreaterThan(0.5);
    expect(edgeHighlightZIndex(true)).toBeGreaterThan(edgeHighlightZIndex(false));
  });

  it('keeps idle greens readable and error edges fully opaque', () => {
    expect(edgeStrokeAlpha({ dimmed: false, highlighted: false, errorRate: 0 })).toBe(0.78);
    expect(edgeStrokeAlpha({ dimmed: false, highlighted: false, errorRate: 0.02 })).toBe(0.92);
    expect(edgeStrokeAlpha({ dimmed: false, highlighted: false, errorRate: 0.05 })).toBe(1);
    expect(edgeStrokeAlpha({ dimmed: false, highlighted: true })).toBe(1);
    expect(edgeStrokeAlpha({ dimmed: true, highlighted: false })).toBe(0.22);
  });

  it('formats a short error-rate label', () => {
    expect(formatErrorRatePercent(0)).toBe('0%');
    expect(formatErrorRatePercent(0.0042)).toBe('0.42%');
    expect(formatErrorRatePercent(0.012)).toBe('1.2%');
    expect(formatErrorRatePercent(0.15)).toBe('15%');
  });

  it('formats QPS as window-mean requestCount / range, not a peak', () => {
    expect(formatQps(2570, 10)).toBe('257');
    expect(formatQps(19.1, 10)).toBe('1.9');
    expect(formatQps(0.42, 10)).toBe('0.04');
  });

  it('hides 0% chips until hover or select, and always shows non-zero', () => {
    expect(edgeErrorLabelVisible({ errorRate: 0, expanded: false, dimmed: false })).toBe(false);
    expect(edgeErrorLabelVisible({ errorRate: 0, expanded: true, dimmed: false })).toBe(true);
    expect(edgeErrorLabelVisible({ errorRate: 0.01, expanded: false, dimmed: false })).toBe(true);
    expect(edgeErrorLabelVisible({ errorRate: 0.01, expanded: false, dimmed: true })).toBe(false);
  });

  it('treats OTel connection types as typed', () => {
    expect(isTypedConnection('database')).toBe(true);
    expect(isTypedConnection('messaging_system')).toBe(true);
    expect(isTypedConnection('virtual_node')).toBe(true);
    expect(isTypedConnection('')).toBe(false);
  });

  it('highlights only incident edges of a node, not edges between neighbors', () => {
    const edges = [edge('a', 'b'), edge('a', 'c'), edge('b', 'c')];
    const hi = incidentHighlight('a', edges);
    expect([...hi.nodes].sort()).toEqual(['a', 'b', 'c']);
    expect(hi.edges.has(edgeKey('a', 'b', ''))).toBe(true);
    expect(hi.edges.has(edgeKey('b', 'c', ''))).toBe(false);
  });

  it('highlights a single edge by endpoints', () => {
    const hi = endpointsHighlight(edge('a', 'b', 'database'));
    expect([...hi.nodes].sort()).toEqual(['a', 'b']);
    expect([...hi.edges]).toEqual([edgeKey('a', 'b', 'database')]);
  });

  it('opens centred on the bounding box, capped at 1:1', () => {
    const plan = planGraphViewport({
      nodes: [
        { id: 'a', x: 0, y: 0, width: 208, height: 40 },
        { id: 'b', x: 500, y: 200, width: 208, height: 40 },
      ],
      paneWidth: 1180,
      paneHeight: 620,
    });
    expect(plan?.zoom).toBe(1);
    expect(plan?.center).toEqual({ x: 354, y: 120 });
  });

  it('keeps a huge graph whole and centred instead of cropping it around a hub', () => {
    const nodes = [
      { id: 'a', x: 0, y: 0, width: 208, height: 40 },
      { id: 'hub', x: 3000, y: 400, width: 208, height: 40 },
      { id: 'z', x: 6000, y: 900, width: 208, height: 40 },
    ];
    const plan = planGraphViewport({ nodes, paneWidth: 1180, paneHeight: 620 });
    // Small, but the whole graph is on screen and the centre is the bounding box's, not a node's.
    expect(plan?.zoom).toBeLessThan(0.5);
    expect(plan?.center).toEqual({ x: 3104, y: 470 });
  });

  it('returns no plan without nodes or without a measured pane', () => {
    expect(planGraphViewport({ nodes: [], paneWidth: 1180, paneHeight: 620 })).toBeNull();
    expect(planGraphViewport({ nodes: [{ id: 'a', x: 0, y: 0, width: 208, height: 40 }], paneWidth: 0, paneHeight: 0 })).toBeNull();
    expect(graphBounds([])).toBeNull();
  });

  it('bounds panning to the graph plus a pane of slack', () => {
    const nodes = [
      { id: 'a', x: 0, y: 0, width: 200, height: 40 },
      { id: 'b', x: 1000, y: 600, width: 200, height: 40 },
    ];
    const extent = graphTranslateExtent({ nodes, paneWidth: 1200, paneHeight: 600 });
    expect(extent).toEqual([
      [-600, -300],
      [1800, 940],
    ]);
    // A tiny pane still leaves usable slack rather than pinning the graph in place.
    const tiny = graphTranslateExtent({ nodes, paneWidth: 200, paneHeight: 100 });
    expect(tiny?.[0]).toEqual([-240, -240]);
    expect(graphTranslateExtent({ nodes: [], paneWidth: 1200, paneHeight: 600 })).toBeUndefined();
  });

  it('lays a 7-rank topology out tightly enough to fit a normal pane whole', () => {
    const chain = ['user', 'gateway', 'index', 'quote', 'kline', 'report', 'clickhouse'];
    const edges = chain.slice(1).map((server, i) => edge(chain[i], server, '', 0, 100));
    const pane = { width: 1520, height: 760 };
    const nodes = layoutServiceGraph(edges, undefined, undefined, pane).map((node) => ({
      id: node.id,
      x: node.x,
      y: node.y,
      width: SERVICE_NODE_WIDTH,
      height: node.height,
    }));
    const width = Math.max(...nodes.map((node) => node.x + node.width)) - Math.min(...nodes.map((node) => node.x));
    expect(width).toBeLessThan(1600);
    const plan = planGraphViewport({ nodes, paneWidth: pane.width, paneHeight: pane.height });
    expect(plan?.zoom).toBeGreaterThan(0.7);
  });

  it('filters detail topology to 1-hop and drops neighbors of neighbors', () => {
    const edges = [edge('web', 'auth'), edge('auth', 'pay'), edge('web', 'redis', 'virtual_node'), edge('other', 'pay')];
    const oneHop = filterOneHopEdges(edges, 'web');
    expect(oneHop.map((item) => `${item.client}->${item.server}`).sort()).toEqual(['web->auth', 'web->redis']);
  });
});
