import { LAYOUT } from './constants';
import type { NotifyFlowColumns, NotifyFlowFilterContent, NotifyFlowKvChip } from './types';

export function estimateTextWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    width += char.charCodeAt(0) > 255 ? LAYOUT.charWidthCjk : LAYOUT.charWidthAscii;
  }
  return width;
}

export function estimateTextLines(text: string, maxWidth: number): number {
  if (maxWidth <= 0) return 1;
  const width = estimateTextWidth(text);
  return Math.max(1, Math.ceil(width / maxWidth));
}

export function estimateChipWidth(text: string, maxWidth: number): number {
  return Math.min(maxWidth, LAYOUT.chipPadX + estimateTextWidth(text));
}

export function formatKvChipText(chip: NotifyFlowKvChip): string {
  return chip.value ? `${chip.key} ${chip.op} ${chip.value}` : `${chip.key} ${chip.op}`;
}

export function estimateKvChipWidth(chip: NotifyFlowKvChip, maxWidth: number): number {
  const inner = estimateTextWidth(chip.key) + LAYOUT.chipInnerGap + estimateTextWidth(chip.op) + LAYOUT.chipInnerGap + estimateTextWidth(chip.value);
  return Math.min(maxWidth, LAYOUT.chipPadX + inner);
}

export function countChipRows(chips: string[], maxWidth: number): number {
  if (chips.length === 0) return 0;
  let rows = 1;
  let x = 0;
  for (const chip of chips) {
    const width = estimateChipWidth(chip, maxWidth);
    if (x === 0) {
      x = width;
      continue;
    }
    if (x + LAYOUT.chipGap + width > maxWidth) {
      rows += 1;
      x = width;
    } else {
      x += LAYOUT.chipGap + width;
    }
  }
  return rows;
}

/** 条件 chip 之间夹「且」，换行按 chip+连接词一起估，避免估高偏小。 */
export function countKvChipRows(chips: NotifyFlowKvChip[], maxWidth: number): number {
  if (chips.length === 0) return 0;
  let rows = 1;
  let x = 0;
  chips.forEach((chip, index) => {
    const width = estimateKvChipWidth(chip, maxWidth);
    const unit = index === 0 ? width : LAYOUT.andWidth + LAYOUT.chipGap + width;
    if (x === 0) {
      x = unit;
      return;
    }
    if (x + LAYOUT.chipGap + unit > maxWidth) {
      rows += 1;
      x = unit;
    } else {
      x += LAYOUT.chipGap + unit;
    }
  });
  return rows;
}

export function chipRowWidth(chips: string[], maxWidth: number): number {
  if (chips.length === 0) return 0;
  let widest = 0;
  let x = 0;
  for (const chip of chips) {
    const width = estimateChipWidth(chip, maxWidth);
    if (x === 0) {
      x = width;
      widest = Math.max(widest, x);
      continue;
    }
    if (x + LAYOUT.chipGap + width > maxWidth) {
      x = width;
    } else {
      x += LAYOUT.chipGap + width;
    }
    widest = Math.max(widest, x);
  }
  return widest;
}

export function kvChipRowWidth(chips: NotifyFlowKvChip[], maxWidth: number): number {
  if (chips.length === 0) return 0;
  let widest = 0;
  let x = 0;
  chips.forEach((chip, index) => {
    const width = estimateKvChipWidth(chip, maxWidth);
    const unit = index === 0 ? width : LAYOUT.andWidth + LAYOUT.chipGap + width;
    if (x === 0) {
      x = unit;
      widest = x;
      return;
    }
    if (x + LAYOUT.chipGap + unit > maxWidth) {
      x = unit;
    } else {
      x += LAYOUT.chipGap + unit;
    }
    widest = Math.max(widest, x);
  });
  return widest;
}

export function chipBlockHeight(rows: number): number {
  if (rows <= 0) return 0;
  return rows * LAYOUT.chipLineHeight + Math.max(rows - 1, 0) * LAYOUT.chipGap;
}

export function filterInnerWidth(filterWidth: number): number {
  return filterWidth - LAYOUT.cardPadding;
}

export function filterValueWidth(filterWidth: number): number {
  return Math.max(1, filterInnerWidth(filterWidth) - LAYOUT.filterLabelWidth - LAYOUT.filterLabelGap);
}

export function titleBlockHeight(): number {
  return LAYOUT.titleHeight + LAYOUT.titleGap;
}

export function visibleFilterRows(content: NotifyFlowFilterContent): Array<{ kind: 'severity' | 'times' | 'chips' }> {
  if (content.unrestricted) return [];
  const rows: Array<{ kind: 'severity' | 'times' | 'chips' }> = [];
  if (content.severity) rows.push({ kind: 'severity' });
  if (content.times.length > 0) rows.push({ kind: 'times' });
  if (content.chips.length > 0) rows.push({ kind: 'chips' });
  return rows;
}

export function estimateFilterPreferredWidth(content: NotifyFlowFilterContent): number {
  if (content.unrestricted) {
    return LAYOUT.cardPadding + estimateTextWidth(content.unrestrictedText ?? '');
  }
  const valueBudget = LAYOUT.filterMaxWidth - LAYOUT.cardPadding - LAYOUT.filterLabelWidth - LAYOUT.filterLabelGap;
  let valueWidth = 0;
  if (content.severity) {
    valueWidth = Math.max(valueWidth, estimateChipWidth(content.severity, valueBudget));
  }
  if (content.times.length > 0) {
    valueWidth = Math.max(valueWidth, chipRowWidth(content.times, valueBudget));
  }
  if (content.chips.length > 0) {
    valueWidth = Math.max(valueWidth, kvChipRowWidth(content.chips, valueBudget));
  }
  return LAYOUT.cardPadding + LAYOUT.filterLabelWidth + LAYOUT.filterLabelGap + valueWidth;
}

export function estimateFilterColumnWidth(contents: NotifyFlowFilterContent[]): number {
  const preferred = contents.reduce((widest, content) => Math.max(widest, estimateFilterPreferredWidth(content)), LAYOUT.filterMinWidth);
  return Math.min(LAYOUT.filterMaxWidth, Math.max(LAYOUT.filterMinWidth, preferred));
}

export function estimateFilterCardHeight(content: NotifyFlowFilterContent, filterWidth: number): number {
  const inner = filterInnerWidth(filterWidth);
  if (content.unrestricted) {
    return LAYOUT.cardPadding + estimateTextLines(content.unrestrictedText ?? '', inner) * LAYOUT.lineHeight;
  }
  const valueWidth = filterValueWidth(filterWidth);
  const blocks: number[] = [];
  if (content.severity) {
    blocks.push(chipBlockHeight(countChipRows([content.severity], valueWidth)));
  }
  if (content.times.length > 0) {
    blocks.push(chipBlockHeight(countChipRows(content.times, valueWidth)));
  }
  if (content.chips.length > 0) {
    blocks.push(chipBlockHeight(countKvChipRows(content.chips, valueWidth)));
  }
  if (blocks.length === 0) {
    return LAYOUT.cardPadding + LAYOUT.lineHeight;
  }
  return LAYOUT.cardPadding + blocks.reduce((sum, item) => sum + item, 0) + Math.max(blocks.length - 1, 0) * LAYOUT.innerRowGap;
}

export function estimateChannelCardHeight(hasParams: boolean): number {
  return LAYOUT.cardPadding + LAYOUT.lineHeight + (hasParams ? LAYOUT.lineHeight + LAYOUT.paramsGap : 0);
}

export function estimateTemplateCardHeight(): number {
  return LAYOUT.cardPadding + LAYOUT.lineHeight;
}

export function columnLayout(filterWidth: number): NotifyFlowColumns {
  const filterX = LAYOUT.sourceX + LAYOUT.sourceSlotWidth;
  const channelX = filterX + filterWidth + LAYOUT.columnGap;
  return {
    sourceX: LAYOUT.sourceX,
    filterX,
    filterWidth,
    channelX,
    channelWidth: LAYOUT.channelWidth,
    templateX: channelX + LAYOUT.channelWidth + LAYOUT.columnGap,
    templateWidth: LAYOUT.templateWidth,
  };
}

export interface ChainLayout {
  ys: number[];
  sourceY: number;
  contentHeight: number;
}

export function layoutChainYs(rowHeights: number[]): ChainLayout {
  if (rowHeights.length === 0) {
    return { ys: [], sourceY: LAYOUT.paddingY, contentHeight: LAYOUT.canvasMinHeight };
  }
  const titleBlock = titleBlockHeight();
  const ys: number[] = [];
  let cursor: number = LAYOUT.paddingY;
  for (const rowHeight of rowHeights) {
    const cardTop = cursor + titleBlock;
    ys.push(cardTop + rowHeight / 2);
    cursor = cardTop + rowHeight + LAYOUT.rowGap;
  }
  const lastHeight = rowHeights[rowHeights.length - 1];
  const lastBottom = ys[ys.length - 1] + lastHeight / 2;
  return {
    ys,
    sourceY: (ys[0] + ys[ys.length - 1]) / 2,
    contentHeight: lastBottom + LAYOUT.paddingY,
  };
}

export function rowCardHeight(filterHeight: number, channelHeight: number, templateHeight: number): number {
  return Math.max(filterHeight, channelHeight, templateHeight);
}
