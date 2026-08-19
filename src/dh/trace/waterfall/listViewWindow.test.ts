import Positions from '@/pages/traceCpt/Detail/Timeline/ListView/Positions';
import { acceptMeasuredHeight, getListViewWindow, resolveDrawnRange } from './listViewWindow';

const ROW = 28;
const SPANS = 3000;

function fakeEl(top: number, clientHeight: number) {
  return {
    getBoundingClientRect: () => ({ top, left: 0, right: 0, bottom: top + clientHeight, width: 0, height: clientHeight, x: 0, y: top, toJSON() {} }),
    clientHeight,
  };
}

function positionsFor(rowHeight: number, count: number) {
  const pos = new Positions(200);
  pos.profileData(count);
  pos.calcHeights(count - 1, () => rowHeight);
  return pos;
}

describe('getListViewWindow', () => {
  it('uses wrapper-local y so a nested overflow parent maps scroll to the list', () => {
    const parent = fakeEl(80, 640);
    const wrapperAtTop = fakeEl(280, SPANS * ROW);
    const atTop = getListViewWindow(wrapperAtTop, parent);
    expect(atTop.viewHeight).toBe(640);
    expect(atTop.scrollTop).toBe(80 - 280);

    const wrapperScrolled = fakeEl(80 - 50_000, SPANS * ROW);
    const mid = getListViewWindow(wrapperScrolled, parent);
    expect(mid.scrollTop).toBe(50_000);
  });
});

describe('acceptMeasuredHeight', () => {
  it('rejects 0 / NaN so off-screen rows cannot collapse the offset map', () => {
    expect(acceptMeasuredHeight(0)).toBeNull();
    expect(acceptMeasuredHeight(Number.NaN)).toBeNull();
    expect(acceptMeasuredHeight(28)).toBe(28);
  });
});

describe('resolveDrawnRange + Positions visible window', () => {
  const pos = positionsFor(ROW, SPANS);
  const heightGetter = () => ROW;

  it('keeps overscan around the viewport so scrolling 3000 rows never opens a blank gap', () => {
    const viewHeight = 8 * ROW;
    const scrollTop = 1800 * ROW;
    const startIndex = pos.findFloorIndex(scrollTop, heightGetter);
    const endIndex = pos.findFloorIndex(scrollTop + viewHeight, heightGetter);
    expect(startIndex).toBe(1800);
    expect(endIndex).toBe(1808);

    const drawn = resolveDrawnRange({
      hasWrapper: true,
      viewHeight,
      startIndex,
      endIndex,
      startIndexDrawn: 0,
      endIndexDrawn: 40,
      viewBuffer: 20,
      viewBufferMin: 10,
      dataLength: SPANS,
      initialDraw: 40,
    });
    expect(drawn.start).toBe(1780);
    expect(drawn.end).toBe(1828);
    expect(drawn.start).toBeLessThanOrEqual(startIndex);
    expect(drawn.end).toBeGreaterThanOrEqual(endIndex);
  });

  it('fills the first screen with initialDraw before the wrapper has a height', () => {
    expect(
      resolveDrawnRange({
        hasWrapper: false,
        viewHeight: -1,
        startIndex: 0,
        endIndex: 0,
        startIndexDrawn: 2 ** 20,
        endIndexDrawn: -(2 ** 20),
        viewBuffer: 20,
        viewBufferMin: 10,
        dataLength: SPANS,
        initialDraw: 40,
      }),
    ).toEqual({ start: 0, end: 39 });
  });
});
