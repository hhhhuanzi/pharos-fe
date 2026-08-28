import {
  LOG_CELL_LINE_HEIGHT_PX,
  LOG_CELL_MAX_LINES,
  LOG_CELL_MIN_HEIGHT_PX,
  LOG_CELL_PADDING_Y_PX,
  LOG_CELL_VIEW_ALL_HEIGHT_PX,
  LOG_CELL_WRAP_CHARS,
  countVisualLines,
  estimateClampedRowHeight,
  fieldValueToText,
  shouldShowViewAll,
} from './clampedField';

describe('fieldValueToText', () => {
  it('stringifies objects and arrays', () => {
    expect(fieldValueToText({ a: 1 })).toBe('{"a":1}');
    expect(fieldValueToText(['x'])).toBe('["x"]');
  });

  it('keeps primitives', () => {
    expect(fieldValueToText('hello')).toBe('hello');
    expect(fieldValueToText(12)).toBe('12');
    expect(fieldValueToText(null)).toBe('');
  });
});

describe('countVisualLines', () => {
  it('counts hard wraps', () => {
    expect(countVisualLines('a\nb\nc')).toBe(3);
  });

  it('wraps a long single line', () => {
    const text = 'x'.repeat(LOG_CELL_WRAP_CHARS * 3);
    expect(countVisualLines(text)).toBe(3);
  });
});

describe('shouldShowViewAll / estimateClampedRowHeight', () => {
  it('hides view-all for short text', () => {
    expect(shouldShowViewAll('short')).toBe(false);
    expect(estimateClampedRowHeight({ log: 'short' }, ['log'])).toBe(LOG_CELL_MIN_HEIGHT_PX);
  });

  it('clamps row height to 10 lines plus view-all', () => {
    const log = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n');
    expect(shouldShowViewAll(log)).toBe(true);
    expect(estimateClampedRowHeight({ log }, ['log'])).toBe(
      LOG_CELL_PADDING_Y_PX + LOG_CELL_MAX_LINES * LOG_CELL_LINE_HEIGHT_PX + LOG_CELL_VIEW_ALL_HEIGHT_PX,
    );
  });

  it('uses the tallest displayed field', () => {
    const log = Array.from({ length: 4 }, (_, i) => `line ${i}`).join('\n');
    expect(estimateClampedRowHeight({ level: 'INFO', log }, ['level', 'log'])).toBe(
      LOG_CELL_PADDING_Y_PX + 4 * LOG_CELL_LINE_HEIGHT_PX,
    );
  });
});
