import { estimateLabelWidth, fitLabel, NODE_LABEL_CHROME, NODE_WIDTH_MAX, NODE_WIDTH_MIN, planNodeWidth, splitLabelTail } from './nodeWidth';
import { planGraphSpacing, WIDENING_RESERVED_RANKSEP } from './spacing';

const PANE = { width: 1216, height: 704 } as const;
/** The wide-and-flat shape where the widening used to drain the rank gaps. */
const WIDE_PANE = { width: 1408, height: 448 } as const;

describe('estimateLabelWidth', () => {
  it('tracks the measured width of a rendered service name', () => {
    // `turms-business-service` measures 166px in the card at 14px/500.
    const width = estimateLabelWidth('turms-business-service');
    expect(width).toBeGreaterThanOrEqual(166);
    expect(width).toBeLessThanOrEqual(190);
  });

  it('counts CJK as full width', () => {
    expect(estimateLabelWidth('订单服务')).toBeGreaterThan(estimateLabelWidth('order'));
  });
});

describe('planNodeWidth', () => {
  it('keeps the floor when every name already fits', () => {
    const width = planNodeWidth({ labels: ['redis', 'mysql', 'rome-sec-admin'], rankCount: 3, container: PANE });
    expect(width).toBe(NODE_WIDTH_MIN);
  });

  it('widens a 1-hop graph enough to spell out its longest name', () => {
    const labels = ['rome-sec-admin', 'rome-sec-monitoring-alert', 'mysql', 'user'];
    const width = planNodeWidth({ labels, rankCount: 3, container: PANE });
    expect(width).toBeGreaterThan(NODE_WIDTH_MIN);
    expect(width).toBeLessThanOrEqual(NODE_WIDTH_MAX);
    expect(width).toBeGreaterThanOrEqual(estimateLabelWidth('rome-sec-monitoring-alert'));
  });

  it('refuses to widen a graph too many ranks wide to afford it', () => {
    const labels = ['rome-sec-adapter-link-data', 'rome-sec-monitoring-alert', 'turms-business-service'];
    const width = planNodeWidth({ labels, rankCount: 7, container: PANE });
    expect(width).toBe(NODE_WIDTH_MIN);
  });

  it('never exceeds the cap, however long the name', () => {
    const width = planNodeWidth({ labels: ['a'.repeat(120)], rankCount: 1, container: PANE });
    expect(width).toBe(NODE_WIDTH_MAX);
  });

  it('falls back to the floor for a pane that has no width yet', () => {
    const width = planNodeWidth({ labels: ['rome-sec-monitoring-alert'], rankCount: 3, container: { width: 0, height: 0 } });
    expect(width).toBe(NODE_WIDTH_MIN);
  });

  // The regression this file exists to prevent: the widening used to be budgeted against the
  // worst case the layout tolerates, so it took the whitespace too and the columns ended up
  // touching. Whatever it takes now, the gap solve still has a full rank gap to hand out.
  it('leaves the rank gaps standing at every graph size a pane can hold', () => {
    const labels = ['rome-sec-adapter-link-data', 'rome-sec-monitoring-alert', 'turms-business-service', 'redis'];
    [PANE, WIDE_PANE, { width: 1920, height: 1024 }].forEach((container) => {
      for (let rankCount = 2; rankCount <= 8; rankCount += 1) {
        const nodeWidth = planNodeWidth({ labels, rankCount, container });
        const spacing = planGraphSpacing({ container, rankCount, maxNodesPerRank: 1, nodeWidth, nodeHeight: 36 });
        if (nodeWidth === NODE_WIDTH_MIN) continue;
        expect(spacing.ranksep).toBeGreaterThanOrEqual(WIDENING_RESERVED_RANKSEP);
      }
    });
  });

  it('gives up the growth rather than the gap once the ranks stop fitting', () => {
    const labels = ['rome-sec-adapter-link-data', 'rome-sec-monitoring-alert'];
    // Six ranks is the shape of the global topology, which is exactly where the columns collapsed.
    expect(planNodeWidth({ labels, rankCount: 6, container: WIDE_PANE })).toBe(NODE_WIDTH_MIN);
    // ...while the same names in the same pane still spell out across three.
    expect(planNodeWidth({ labels, rankCount: 3, container: WIDE_PANE })).toBeGreaterThan(NODE_WIDTH_MIN);
  });

  it('grows a mid-sized graph part of the way instead of all or nothing', () => {
    const labels = ['rome-sec-adapter-link-data'];
    const width = planNodeWidth({ labels, rankCount: 5, container: WIDE_PANE });
    expect(width).toBeGreaterThan(NODE_WIDTH_MIN);
    expect(width).toBeLessThan(estimateLabelWidth(labels[0]) + NODE_LABEL_CHROME);
  });
});

describe('fitLabel', () => {
  const floorRoom = NODE_WIDTH_MIN - NODE_LABEL_CHROME;

  it('leaves a name that fits untouched', () => {
    expect(fitLabel('rome-sec-admin', floorRoom)).toBe('rome-sec-admin');
  });

  it('moves the ellipsis off the tail on a card too narrow for the name', () => {
    const fitted = fitLabel('rome-sec-kline-realtime', floorRoom);
    expect(fitted).not.toBe('rome-sec-kline-realtime');
    expect(fitted).toContain('…');
    expect(fitted.endsWith('-realtime')).toBe(true);
    expect(estimateLabelWidth(fitted)).toBeLessThanOrEqual(floorRoom);
  });

  it('keeps sibling services distinguishable where a tail cut would not', () => {
    expect(fitLabel('rome-sec-kline-realtime', floorRoom)).not.toBe(fitLabel('rome-sec-kline-history', floorRoom));
  });

  it('spells the name out once the card is wide enough for it', () => {
    const width = planNodeWidth({ labels: ['rome-sec-monitoring-alert'], rankCount: 3, container: PANE });
    expect(fitLabel('rome-sec-monitoring-alert', width - NODE_LABEL_CHROME)).toBe('rome-sec-monitoring-alert');
  });

  it('leaves a single-segment name to the CSS tail truncation', () => {
    expect(fitLabel('averylongsinglewordservicename', floorRoom)).toBe('averylongsinglewordservicename');
  });

  it('follows the font boost a zoomed-out graph applies', () => {
    const plain = fitLabel('rome-sec-kline-realtime', floorRoom, 14);
    const boosted = fitLabel('rome-sec-kline-realtime', floorRoom, 14 * 1.45);
    expect(boosted.length).toBeLessThan(plain.length);
  });
});

describe('splitLabelTail', () => {
  it('protects the segment that tells sibling services apart', () => {
    expect(splitLabelTail('rome-sec-kline-realtime')).toEqual({ head: 'rome-sec-kline', tail: '-realtime' });
    expect(splitLabelTail('rome-sec-kline-history')).toEqual({ head: 'rome-sec-kline', tail: '-history' });
  });

  it('leaves a name with no separator alone', () => {
    expect(splitLabelTail('mongodb')).toEqual({ head: 'mongodb', tail: '' });
  });

  it('leaves a name whose last segment would eat the card alone', () => {
    expect(splitLabelTail('svc-averyverylongtrailingsegment')).toEqual({ head: 'svc-averyverylongtrailingsegment', tail: '' });
  });

  it('does not split when nothing would be left in front of the ellipsis', () => {
    expect(splitLabelTail('a-b')).toEqual({ head: 'a-b', tail: '' });
  });
});
