import {
  CARD_MIN_FIT_SCALE,
  EDGESEP,
  MAX_NODESEP,
  MAX_RANKSEP,
  MIN_NODESEP,
  MIN_RANKSEP,
  TIGHT_EDGESEP,
  TIGHT_NODESEP,
  TIGHT_RANKSEP,
  planGraphSpacing,
  quantizeViewport,
  squeezeGraphSpacing,
  VIEWPORT_QUANTUM,
} from './spacing';

const CARD = { nodeWidth: 176, nodeHeight: 36 };
const PANE = { width: 1408, height: 868 };

describe('ranksep floor', () => {
  it('keeps the readable-arc corridor at 96px, including after squeeze', () => {
    expect(MIN_RANKSEP).toBe(96);
    expect(TIGHT_RANKSEP).toBe(MIN_RANKSEP);
  });
});

describe('planGraphSpacing', () => {
  it('spreads a small graph towards the maximum gap', () => {
    const spacing = planGraphSpacing({ container: PANE, rankCount: 3, maxNodesPerRank: 3, ...CARD });
    expect(spacing.ranksep).toBe(MAX_RANKSEP);
    expect(spacing.nodesep).toBe(MAX_NODESEP);
  });

  it('packs a large graph down to the minimum gap instead of overflowing quietly', () => {
    const spacing = planGraphSpacing({ container: PANE, rankCount: 8, maxNodesPerRank: 14, ...CARD });
    expect(spacing.ranksep).toBe(MIN_RANKSEP);
    expect(spacing.nodesep).toBe(MIN_NODESEP);
  });

  it('gives the same graph more room in a wider pane', () => {
    const narrow = planGraphSpacing({ container: { width: 1280, height: 800 }, rankCount: 5, maxNodesPerRank: 6, ...CARD });
    const wide = planGraphSpacing({ container: { width: 1920, height: 800 }, rankCount: 5, maxNodesPerRank: 6, ...CARD });
    expect(wide.ranksep).toBeGreaterThan(narrow.ranksep);
    expect(wide.nodesep).toBe(narrow.nodesep);
  });

  it('lands between the bounds for a mid-sized graph', () => {
    const spacing = planGraphSpacing({ container: PANE, rankCount: 4, maxNodesPerRank: 5, ...CARD });
    expect(spacing.ranksep).toBeGreaterThan(MIN_RANKSEP);
    expect(spacing.ranksep).toBeLessThan(MAX_RANKSEP);
  });

  it('never goes below the minimum, even in a tiny pane or with a broken measurement', () => {
    const tiny = planGraphSpacing({ container: { width: 200, height: 120 }, rankCount: 6, maxNodesPerRank: 8, ...CARD });
    expect(tiny.ranksep).toBe(MIN_RANKSEP);
    expect(tiny.nodesep).toBe(MIN_NODESEP);
    const broken = planGraphSpacing({ container: { width: 0, height: 0 }, rankCount: 4, maxNodesPerRank: 4, ...CARD });
    expect(broken.ranksep).toBe(MIN_RANKSEP);
    expect(broken.nodesep).toBe(MIN_NODESEP);
  });

  it('falls back to the maximum when there is nothing to space out', () => {
    const single = planGraphSpacing({ container: PANE, rankCount: 1, maxNodesPerRank: 1, ...CARD });
    expect(single.ranksep).toBe(MAX_RANKSEP);
    expect(single.nodesep).toBe(MAX_NODESEP);
  });

  it('grows the gap with the target scale, not with a hard-coded number', () => {
    const readable = planGraphSpacing({ container: PANE, rankCount: 6, maxNodesPerRank: 4, ...CARD, targetScale: 0.9 });
    const zoomedOut = planGraphSpacing({ container: PANE, rankCount: 6, maxNodesPerRank: 4, ...CARD, targetScale: 0.5 });
    expect(zoomedOut.ranksep).toBeGreaterThan(readable.ranksep);
  });
});

describe('squeezeGraphSpacing', () => {
  const base = { container: PANE, rankCount: 8, maxNodesPerRank: 14, ...CARD };
  const spacing = { ranksep: MIN_RANKSEP, nodesep: MIN_NODESEP, edgesep: EDGESEP };

  it('leaves a graph that already fits at a readable card size alone', () => {
    const next = squeezeGraphSpacing({ ...base, spacing, bounds: { width: 400, height: 300 } });
    expect(next).toEqual(spacing);
  });

  it('gives up whitespace past the comfortable floor when the card size is at stake', () => {
    const next = squeezeGraphSpacing({ ...base, spacing, bounds: { width: 3000, height: 2400 } });
    expect(next.ranksep).toBe(TIGHT_RANKSEP);
    expect(next.nodesep).toBe(TIGHT_NODESEP);
    // Edge corridors are most of the height on a dense graph, so they shrink along with the cards.
    expect(next.edgesep).toBeLessThan(EDGESEP);
    expect(next.edgesep).toBeGreaterThanOrEqual(TIGHT_EDGESEP);
  });

  it('squeezes proportionally rather than jumping straight to the floor', () => {
    // Overflows by a little: the gap should come down a little.
    const allowed = (PANE.height * 0.76) / CARD_MIN_FIT_SCALE;
    const next = squeezeGraphSpacing({
      ...base,
      spacing: { ranksep: MAX_RANKSEP, nodesep: MAX_NODESEP, edgesep: EDGESEP },
      bounds: { width: 400, height: allowed * 1.15 },
    });
    expect(next.nodesep).toBeLessThan(MAX_NODESEP);
    expect(next.nodesep).toBeGreaterThan(TIGHT_NODESEP);
    expect(next.ranksep).toBe(MAX_RANKSEP);
  });

  it('surrenders every gap when the cards alone overflow, instead of returning a useless number', () => {
    const next = squeezeGraphSpacing({ ...base, rankCount: 40, spacing, bounds: { width: 9000, height: 9000 } });
    expect(next.ranksep).toBe(TIGHT_RANKSEP);
  });

  it('will not close the horizontal corridor to buy a fit, even when the cards alone overflow', () => {
    const next = squeezeGraphSpacing({
      ...base,
      spacing: { ranksep: MIN_RANKSEP, nodesep: MAX_NODESEP, edgesep: EDGESEP },
      bounds: { width: 9000, height: 2400 },
    });
    expect(next.ranksep).toBe(TIGHT_RANKSEP);
    expect(next.ranksep).toBe(MIN_RANKSEP);
    expect(next.nodesep).toBeLessThan(MAX_NODESEP);
  });

  it('ignores a broken measurement rather than collapsing the layout', () => {
    const next = squeezeGraphSpacing({ ...base, spacing, bounds: { width: NaN, height: NaN } });
    expect(next.ranksep).toBe(MIN_RANKSEP);
    expect(next.nodesep).toBe(MIN_NODESEP);
  });
});

describe('quantizeViewport', () => {
  it('ignores sub-quantum resize noise so the layout cannot oscillate', () => {
    expect(quantizeViewport({ width: 1400, height: 860 })).toEqual(quantizeViewport({ width: 1412, height: 848 }));
    expect(quantizeViewport({ width: 1400, height: 860 }).width % VIEWPORT_QUANTUM).toBe(0);
  });

  it('does react once a resize crosses a quantum', () => {
    expect(quantizeViewport({ width: 1280, height: 800 })).not.toEqual(quantizeViewport({ width: 1920, height: 800 }));
  });

  it('never returns a zero-sized pane', () => {
    expect(quantizeViewport({ width: 0, height: 0 }).width).toBeGreaterThan(0);
  });
});
