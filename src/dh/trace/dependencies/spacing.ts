import { GRAPH_FIT_PADDING, NODE_LABEL_FONT } from './graphVisual';

export interface GraphSpacing {
  /** Horizontal gap between LR ranks. */
  ranksep: number;
  /** Vertical gap between cards of the same rank. */
  nodesep: number;
  /**
   * dagre's separation for the dummy nodes it puts in intermediate ranks to route an edge that
   * spans more than one rank. On a graph with sixty edges this, not `nodesep`, is most of the
   * bounding-box height, so it has to be part of the solve rather than a constant.
   */
  edgesep: number;
}

/** Below this the bezier bulge of neighbouring ranks starts to overlap and arrows lose room. */
export const MIN_RANKSEP = 36;
/**
 * Rank gap that the card-width solve is not allowed to spend (see `planNodeWidth`).
 *
 * An edge spends `BEZIER_MIN_DX` leaving one card and the same again entering the next, so below
 * twice that the two control points cross and the edge leaves the card travelling straight down.
 * That is what a graph looks like once wider cards have eaten the gaps: names fully spelled out,
 * columns touching, every edge a vertical line. Spelling a name out is a nice-to-have and the gap
 * it would cost is not, so the widening only gets what is left after this is set aside.
 */
export const WIDENING_RESERVED_RANKSEP = 48;
/** Above this a small graph stops reading as connected and drifts apart. */
export const MAX_RANKSEP = 180;
export const MIN_NODESEP = 20;
export const MAX_NODESEP = 80;
export const EDGESEP = 12;

/**
 * Floors used only while squeezing a graph that cannot otherwise be fitted at a readable card size
 * (the global topology). They are well below `MIN_*` on purpose: at a fit scale near 0.7 a 24px
 * rank gap is still 17px on screen and an 8px card gap is still 6px, so the gap was never the
 * thing that needed protecting — the card was. `TIGHT_RANKSEP` stops at `BEZIER_MIN_DX` so an edge
 * still has the horizontal room to leave one card and enter the next without bulging over either.
 */
export const TIGHT_RANKSEP = 24;
export const TIGHT_NODESEP = 8;
export const TIGHT_EDGESEP = 3;

/**
 * Edge corridors ride along with the card gaps: shrinking one and not the other would spend the
 * whole squeeze on the cards and leave the routing space that caused the overflow untouched.
 *
 * The ratio is fixed so that any `nodesep` at or above `MIN_NODESEP` lands back on `EDGESEP` — the
 * detail topology never goes below that floor, so its layout is provably the one it had before.
 */
export const EDGESEP_PER_NODESEP = EDGESEP / MIN_NODESEP;

export function edgeSepFor(nodesep: number): number {
  return clamp(nodesep * EDGESEP_PER_NODESEP, TIGHT_EDGESEP, EDGESEP);
}

/**
 * Minimum on-screen label size the opening fit has to leave, and the fit scale that implies.
 *
 * This inverts the solve. The gaps used to be the constraint and the card size the outcome, which
 * fitted a 30-node graph at ~0.4 — a 5.5px service name, readable only after pressing 1:1. The
 * card is the constraint now: whitespace is given up until the fit clears this scale, and the gaps
 * only keep what is left over.
 */
export const NODE_MIN_FIT_FONT = 11;
export const CARD_MIN_FIT_SCALE = NODE_MIN_FIT_FONT / NODE_LABEL_FONT;

/**
 * Squeeze passes allowed after the first placement. dagre's real bounding box is far larger than
 * "cards + gaps" (see `edgesep`), so the only reliable way to hit a fit scale is to place, measure
 * and squeeze again — each pass is pure math over a few dozen nodes.
 */
export const SPACING_SQUEEZE_PASSES = 4;
/**
 * Zoom the opening `fitView` should land on. Spacing is solved backwards from it: the layout is
 * allowed to grow only as far as the pane can still show at this scale, which is what makes a
 * 5-card detail graph airy and a 25-card global graph tight without a second set of constants.
 */
export const SPACING_TARGET_SCALE = 0.9;
/** Margin dagre adds around the bounding box; spacing has to leave room for it. */
export const GRAPH_MARGIN = 16;
/** Resize steps smaller than this do not relayout — otherwise a drag would thrash the graph. */
export const VIEWPORT_QUANTUM = 64;
/** Used when the pane has not been measured yet (also keeps the layout unit-testable). */
export const DEFAULT_VIEWPORT: Viewport = { width: 1440, height: 820 };

export interface Viewport {
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.round(value), min), max);
}

/**
 * Snap the measured pane to a coarse grid.
 *
 * Spacing depends on the pane, and the layout can itself nudge the pane (scrollbars, chrome), so
 * feeding raw pixels back into dagre risks a relayout loop. Only crossing a quantum counts as a
 * real resize.
 */
export function quantizeViewport(viewport: Viewport, quantum = VIEWPORT_QUANTUM): Viewport {
  return {
    width: Math.max(quantum, Math.round(viewport.width / quantum) * quantum),
    height: Math.max(quantum, Math.round(viewport.height / quantum) * quantum),
  };
}

/**
 * Solve gaps from the pane instead of hard-coding them.
 *
 * The pane and the card are fixed, so the only free variable is the whitespace between cards:
 * spread whatever the pane can still show at `targetScale` across the gaps, then clamp so a tiny
 * graph does not scatter and a huge one does not collapse into a blob. A graph that cannot fit
 * even at `MIN_*` simply opens below the target scale — the zoom controls and MiniMap cover that.
 */
export function planGraphSpacing(input: {
  container: Viewport;
  rankCount: number;
  maxNodesPerRank: number;
  nodeWidth: number;
  nodeHeight: number;
  targetScale?: number;
}): GraphSpacing {
  const { container, rankCount, maxNodesPerRank, nodeWidth, nodeHeight } = input;
  const targetScale = input.targetScale && input.targetScale > 0 ? input.targetScale : SPACING_TARGET_SCALE;
  const usable = (size: number) => size * (1 - GRAPH_FIT_PADDING * 2) / targetScale - GRAPH_MARGIN * 2;
  const gap = (available: number, count: number, cardSize: number, min: number, max: number) => {
    const gaps = count - 1;
    if (gaps <= 0) return max;
    return clamp((available - count * cardSize) / gaps, min, max);
  };
  const nodesep = gap(usable(container.height), maxNodesPerRank, nodeHeight, MIN_NODESEP, MAX_NODESEP);
  return {
    ranksep: gap(usable(container.width), rankCount, nodeWidth, MIN_RANKSEP, MAX_RANKSEP),
    nodesep,
    edgesep: edgeSepFor(nodesep),
  };
}

export interface SqueezeSpacingInput {
  spacing: GraphSpacing;
  /** Bounding box the last dagre pass actually produced. */
  bounds: Viewport;
  container: Viewport;
  rankCount: number;
  maxNodesPerRank: number;
  nodeWidth: number;
  nodeHeight: number;
  minFitScale?: number;
}

/**
 * Scale each gap by the share of its whitespace that still fits.
 *
 * Only whitespace is negotiable, so the cards and dagre's margin come off both the box we got and
 * the box we are allowed, and the gap keeps the ratio between the two remainders. That is exact
 * horizontally — a rank really is cards plus gaps — and an under-estimate vertically, which is why
 * this runs a few times. A gap that already fits is returned unchanged, so the caller's loop stops
 * on the first pass that succeeds rather than squeezing past the point of need.
 */
export function squeezeGraphSpacing(input: SqueezeSpacingInput): GraphSpacing {
  const scale = input.minFitScale && input.minFitScale > 0 ? input.minFitScale : CARD_MIN_FIT_SCALE;
  const allowed = (size: number) => (size * (1 - GRAPH_FIT_PADDING * 2)) / scale;
  const cards = (count: number, cardSize: number) => count * cardSize + GRAPH_MARGIN * 2;
  const nodesep = squeezeGap({
    gap: input.spacing.nodesep,
    actual: input.bounds.height,
    allowed: allowed(input.container.height),
    cards: cards(input.maxNodesPerRank, input.nodeHeight),
    min: TIGHT_NODESEP,
    max: MAX_NODESEP,
  });
  return {
    ranksep: squeezeGap({
      gap: input.spacing.ranksep,
      actual: input.bounds.width,
      allowed: allowed(input.container.width),
      cards: cards(input.rankCount, input.nodeWidth),
      min: TIGHT_RANKSEP,
      max: MAX_RANKSEP,
    }),
    nodesep,
    edgesep: edgeSepFor(nodesep),
  };
}

function squeezeGap(input: { gap: number; actual: number; allowed: number; cards: number; min: number; max: number }): number {
  const { gap, actual, allowed, cards, min, max } = input;
  if (!Number.isFinite(actual) || !Number.isFinite(allowed) || actual <= allowed) return gap;
  const actualSlack = actual - cards;
  const allowedSlack = allowed - cards;
  // The cards alone already overflow: no gap is small enough to help, so give up all of it.
  if (actualSlack <= 0 || allowedSlack <= 0) return min;
  return clamp(gap * (allowedSlack / actualSlack), min, max);
}
