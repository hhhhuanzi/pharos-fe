import { GRAPH_FIT_PADDING, NODE_LABEL_FONT } from './graphVisual';
import { GRAPH_MARGIN, SPACING_TARGET_SCALE, WIDENING_RESERVED_RANKSEP, type Viewport } from './spacing';

/**
 * Card width is the dominant term in the bounding box (a 7-rank graph pays every extra pixel seven
 * times over and opens at a lower fit zoom), so it is solved per graph rather than fixed: 176 is
 * the point where a global topology still fits a normal pane at a readable label size, and a 1-hop
 * detail graph three ranks wide has room to spare. Cards stay equal width *within* one graph —
 * dagre lays out in columns, so per-node widths would leave every rank ragged.
 */
export const NODE_WIDTH_MIN = 176;
/** Enough for a 26-character name, past which a card stops reading as a chip. */
export const NODE_WIDTH_MAX = 240;
/** Everything in the card that is not the label: horizontal padding, the glyph and its gap. */
export const NODE_LABEL_CHROME = 36;

/**
 * Per-glyph advance as a fraction of the font size. Measured against the rendered cards, where a
 * lowercase-and-hyphen service name at 14px/500 lands near 0.54em; 0.56 keeps a few percent of
 * slack so a name that fits the estimate also fits the card. CJK is full-width.
 */
const NARROW_EM = 0.56;
const WIDE_EM = 1;
/** Start of the CJK/full-width planes. */
const WIDE_CODEPOINT = 0x2e7f;

export function estimateLabelWidth(text: string, fontSize: number = NODE_LABEL_FONT): number {
  let em = 0;
  for (const char of text) {
    em += (char.codePointAt(0) ?? 0) > WIDE_CODEPOINT ? WIDE_EM : NARROW_EM;
  }
  return Math.ceil(em * fontSize);
}

/**
 * Widest card this graph can afford: the width every name would need, capped by the horizontal
 * space that is genuinely spare.
 *
 * "Spare" is measured against the budget the gap solve itself works to — the pane at
 * `SPACING_TARGET_SCALE`, minus a `WIDENING_RESERVED_RANKSEP` gap per column boundary — and not
 * against the worst case the layout is merely willing to tolerate (`CARD_MIN_FIT_SCALE` with the
 * squeeze floors). Budgeting for the worst case is what regressed the global topology: the cards
 * claimed every pixel down to the tolerated minimum, `squeezeGraphSpacing` then had to buy the
 * overflow back from the only negotiable term, and the columns ended up touching at the squeeze
 * floor with every edge a vertical line.
 *
 * Reserving the gap here rather than repairing it afterwards is what makes that unrepresentable.
 * The reservation is exactly `planGraphSpacing`'s own arithmetic, so a card grown to `affordable`
 * leaves that function a rank gap of `WIDENING_RESERVED_RANKSEP` (more, when the names wanted less
 * than they could have had), and the resulting box still fits inside what the squeeze pass allows —
 * so the squeeze never fires on account of the widening. A graph that cannot afford any growth
 * keeps the floor and moves its ellipsis to the middle, which is the intended degradation.
 */
export function planNodeWidth(input: { labels: string[]; rankCount: number; container: Viewport }): number {
  const { labels, container } = input;
  const wanted = labels.reduce((max, label) => Math.max(max, estimateLabelWidth(label) + NODE_LABEL_CHROME), NODE_WIDTH_MIN);
  if (wanted <= NODE_WIDTH_MIN) return NODE_WIDTH_MIN;
  const ranks = Math.max(1, Math.round(input.rankCount));
  const usable = (container.width * (1 - GRAPH_FIT_PADDING * 2)) / SPACING_TARGET_SCALE;
  const affordable = (usable - (ranks - 1) * WIDENING_RESERVED_RANKSEP - GRAPH_MARGIN * 2) / ranks;
  const width = Math.min(wanted, affordable, NODE_WIDTH_MAX);
  if (!Number.isFinite(width)) return NODE_WIDTH_MIN;
  return Math.max(NODE_WIDTH_MIN, Math.round(width));
}

export interface LabelParts {
  /** Truncates when the card is too narrow. */
  head: string;
  /** Never truncates; empty when the name has no separator worth splitting on. */
  tail: string;
}

/** Longest suffix worth protecting, and the shortest head still worth showing before the ellipsis. */
const TAIL_MAX_CHARS = 11;
const HEAD_MIN_CHARS = 3;
const SEPARATORS = ['-', '_', '.'];

/**
 * Split a service name so the ellipsis lands in the middle instead of at the end.
 *
 * Names in one deployment share long prefixes (`rome-sec-kline-realtime` vs
 * `rome-sec-kline-history`), so a tail ellipsis cuts exactly the part that tells them apart.
 * Rendering the last segment as its own non-shrinking span keeps it visible without measuring
 * text — the head only shows an ellipsis once it really overflows, so a card wide enough for the
 * whole name still renders it unchanged.
 */
export function splitLabelTail(label: string): LabelParts {
  const index = SEPARATORS.reduce((max, separator) => Math.max(max, label.lastIndexOf(separator)), -1);
  if (index < HEAD_MIN_CHARS) return { head: label, tail: '' };
  const tail = label.slice(index);
  if (tail.length < 2 || tail.length > TAIL_MAX_CHARS) return { head: label, tail: '' };
  return { head: label.slice(0, index), tail };
}

const ELLIPSIS = '…';

/**
 * The label as it should be rendered in a card `available` pixels wide.
 *
 * Cutting here rather than leaving it to `text-overflow` is what keeps the ellipsis flush against
 * the tail: CSS truncates on whole glyphs and keeps the leftover sliver of the box, which shows up
 * as a gap once something follows it. Names that keep their tail-truncation (no separator) are
 * returned untouched for CSS to handle, and the caller keeps `truncate` on as a safety net for
 * when the estimate runs under the real advance.
 */
export function fitLabel(label: string, available: number, fontSize: number = NODE_LABEL_FONT): string {
  if (available <= 0 || estimateLabelWidth(label, fontSize) <= available) return label;
  const { head, tail } = splitLabelTail(label);
  if (!tail) return label;
  const room = available - estimateLabelWidth(`${ELLIPSIS}${tail}`, fontSize);
  if (room <= 0) return label;
  let cut = head;
  while (cut.length > 1 && estimateLabelWidth(cut, fontSize) > room) cut = cut.slice(0, -1);
  return `${cut}${ELLIPSIS}${tail}`;
}
