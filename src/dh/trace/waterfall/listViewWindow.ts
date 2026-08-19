/**
 * Visible-window helpers for Jaeger ListView.
 *
 * Pharos puts the waterfall inside PageLayout's `overflow-y: auto` pane, so
 * `window.scrollY` stays 0 while the user scrolls. ListView must read the
 * nearest overflow parent, not the document.
 */

export interface ListViewWindow {
  /** Visible top of the list, in wrapper-local y (may be negative if the list starts below the viewport). */
  scrollTop: number;
  viewHeight: number;
}

export interface DrawnRange {
  start: number;
  end: number;
}

export function getScrollParent(el: HTMLElement | null | undefined): HTMLElement {
  const root = typeof document !== 'undefined' ? document.documentElement : (el as HTMLElement);
  if (!el || typeof window === 'undefined') {
    return root;
  }
  let parent = el.parentElement;
  while (parent && parent !== document.body && parent !== document.documentElement) {
    const overflowY = window.getComputedStyle(parent).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') {
      return parent;
    }
    parent = parent.parentElement;
  }
  return root;
}

export function getListViewWindow(wrapper: Pick<HTMLElement, 'getBoundingClientRect'>, scrollParent: Pick<HTMLElement, 'getBoundingClientRect' | 'clientHeight'>): ListViewWindow {
  const parentRect = scrollParent.getBoundingClientRect();
  const wrapperRect = wrapper.getBoundingClientRect();
  const isDocumentRoot = typeof document !== 'undefined' && (scrollParent === document.documentElement || scrollParent === document.body);
  const viewHeight = isDocumentRoot ? window.innerHeight : scrollParent.clientHeight;
  return {
    scrollTop: parentRect.top - wrapperRect.top,
    viewHeight,
  };
}

/** Drop 0 / NaN measurements so they cannot collapse later rows to a blank gap. */
export function acceptMeasuredHeight(observed: number): number | null {
  if (typeof observed !== 'number' || observed <= 0 || observed !== observed) {
    return null;
  }
  return observed;
}

export function resolveDrawnRange(opts: {
  hasWrapper: boolean;
  viewHeight: number;
  startIndex: number;
  endIndex: number;
  startIndexDrawn: number;
  endIndexDrawn: number;
  viewBuffer: number;
  viewBufferMin: number;
  dataLength: number;
  initialDraw: number;
}): DrawnRange {
  const { hasWrapper, viewHeight, startIndex, endIndex, startIndexDrawn, endIndexDrawn, viewBuffer, viewBufferMin, dataLength, initialDraw } = opts;
  if (dataLength <= 0) {
    return { start: 0, end: -1 };
  }
  if (!hasWrapper || viewHeight <= 0) {
    return { start: 0, end: Math.min(initialDraw, dataLength) - 1 };
  }
  const maxStart = viewBufferMin > startIndex ? 0 : startIndex - viewBufferMin;
  const minEnd = viewBufferMin < dataLength - endIndex ? endIndex + viewBufferMin : dataLength - 1;
  if (maxStart < startIndexDrawn || minEnd > endIndexDrawn) {
    const start = viewBuffer > startIndex ? 0 : startIndex - viewBuffer;
    return { start, end: Math.min(endIndex + viewBuffer, dataLength - 1) };
  }
  return {
    start: startIndexDrawn,
    end: Math.min(endIndexDrawn, dataLength - 1),
  };
}
