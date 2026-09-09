import { LAYOUT } from './constants';
import {
  columnLayout,
  countChipRows,
  countKvChipRows,
  estimateFilterCardHeight,
  estimateFilterColumnWidth,
  filterInnerWidth,
  layoutChainYs,
  titleBlockHeight,
  visibleFilterRows,
} from './layout';
import type { NotifyFlowFilterContent, NotifyFlowKvChip } from './types';

const unrestricted: NotifyFlowFilterContent = {
  unrestricted: true,
  unrestrictedText: '不限 · 匹配全部事件',
  times: [],
  chips: [],
};

function kv(key: string, value: string): NotifyFlowKvChip {
  return { key, op: '==', value };
}

function tallContent(chipCount: number): NotifyFlowFilterContent {
  return {
    times: ['00:00–00:00'],
    chips: Array.from({ length: chipCount }, (_, index) => kv('ident', `host-${index}`)),
  };
}

describe('countChipRows / countKvChipRows', () => {
  it('空数组 0 行；单条 1 行', () => {
    const inner = filterInnerWidth(LAYOUT.filterMaxWidth);
    expect(countChipRows([], inner)).toBe(0);
    expect(countChipRows(['app == api'], inner)).toBe(1);
    expect(countKvChipRows([], inner)).toBe(0);
    expect(countKvChipRows([kv('app', 'api')], inner)).toBe(1);
  });

  it('6 条短条件带「且」后仍会流式换行，行数少于 6', () => {
    const chips = [kv('app', 'api'), kv('env', 'prod'), kv('layer', 'wl'), kv('ident', 'h1'), kv('cluster', 'c1'), kv('region', 'cn')];
    const rows = countKvChipRows(chips, filterInnerWidth(LAYOUT.filterMaxWidth));
    expect(rows).toBeGreaterThanOrEqual(1);
    expect(rows).toBeLessThan(6);
  });
});

describe('visibleFilterRows', () => {
  it('默认不限没有两栏行；空类别整行省略', () => {
    expect(visibleFilterRows(unrestricted)).toEqual([]);
    expect(visibleFilterRows({ times: ['00:00–00:00'], chips: [] }).map((row) => row.kind)).toEqual(['times']);
    expect(visibleFilterRows({ severity: 'S1', times: [], chips: [kv('app', 'api')] }).map((row) => row.kind)).toEqual(['severity', 'chips']);
  });
});

describe('estimateFilterColumnWidth', () => {
  it('全是不限时收到 min；条件多时撑开且不超过 max', () => {
    expect(estimateFilterColumnWidth([unrestricted, unrestricted])).toBe(LAYOUT.filterMinWidth);
    const fat = estimateFilterColumnWidth([unrestricted, tallContent(8)]);
    expect(fat).toBeGreaterThan(LAYOUT.filterMinWidth);
    expect(fat).toBeLessThanOrEqual(LAYOUT.filterMaxWidth);
  });
});

describe('columnLayout', () => {
  it('列 x 随筛选列宽重算，不写死旧坐标', () => {
    const narrow = columnLayout(LAYOUT.filterMinWidth);
    const wide = columnLayout(LAYOUT.filterMaxWidth);
    expect(narrow.filterX).toBe(LAYOUT.sourceX + LAYOUT.sourceSlotWidth);
    expect(wide.channelX).toBe(wide.filterX + wide.filterWidth + LAYOUT.columnGap);
    expect(wide.templateX).toBe(wide.channelX + LAYOUT.channelWidth + LAYOUT.columnGap);
    expect(wide.channelX).toBeGreaterThan(narrow.channelX);
  });
});

describe('layoutChainYs', () => {
  it('空链只有起始高度；非空时 source 落在首尾中点', () => {
    expect(layoutChainYs([])).toEqual({ ys: [], sourceY: LAYOUT.paddingY, contentHeight: LAYOUT.canvasMinHeight });
    const laid = layoutChainYs([80, 80]);
    expect(laid.sourceY).toBe((laid.ys[0] + laid.ys[1]) / 2);
    expect(laid.contentHeight).toBeGreaterThan(laid.ys[1]);
  });

  it('标题占位计入行距，高卡片不压住下一张标题', () => {
    const compactH = estimateFilterCardHeight(unrestricted, LAYOUT.filterMinWidth);
    const tallH = estimateFilterCardHeight(tallContent(6), LAYOUT.filterMaxWidth);
    expect(tallH).toBeGreaterThan(compactH);

    const laid = layoutChainYs([tallH, compactH]);
    const prevBottom = laid.ys[0] + tallH / 2;
    const nextTitleTop = laid.ys[1] - compactH / 2 - titleBlockHeight();
    expect(nextTitleTop - prevBottom).toBe(LAYOUT.rowGap);
    expect(laid.ys[0] - tallH / 2 - titleBlockHeight()).toBe(LAYOUT.paddingY);
    expect(laid.ys[1] - laid.ys[0]).not.toBe(144);
  });
});
