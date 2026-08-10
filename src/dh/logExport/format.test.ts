import { MAX_OUTPUT_CHARS, WARN_OUTPUT_CHARS } from './constants';
import { formatChars, formatCharsLimit } from './format';

describe('formatChars', () => {
  it('还什么都没生成时显示 0，不显示 1 KB', () => {
    expect(formatChars(0)).toBe('0 KB');
  });

  it('不足 1 KB 但已有内容时兜底显示 1 KB', () => {
    expect(formatChars(1)).toBe('1 KB');
    expect(formatChars(600)).toBe('1 KB');
  });

  it('不足 1 MB 时用 KB', () => {
    expect(formatChars(10 * 1024)).toBe('10 KB');
    expect(formatChars(1024 * 1024 - 1)).toBe('1024 KB');
  });

  it('达到 1 MB 后用带一位小数的 MB', () => {
    expect(formatChars(1024 * 1024)).toBe('1.0 MB');
    expect(formatChars(4.4 * 1024 * 1024)).toBe('4.4 MB');
  });
});

describe('formatCharsLimit', () => {
  it('阈值不带小数', () => {
    expect(formatCharsLimit(1024 * 1024)).toBe('1 MB');
  });

  /**
   * 这条是问题 2 的回归测试：进度里的体积上限必须由 MAX_OUTPUT_CHARS 算出来。
   * 以前 i18n 文案里写死了「300 MB」，改常量而文案不动，用户看到的就是假数字。
   */
  it('闸门常量渲染出的正是文案里承诺的 300 MB / 100 MB', () => {
    expect(formatCharsLimit(MAX_OUTPUT_CHARS)).toBe('300 MB');
    expect(formatCharsLimit(WARN_OUTPUT_CHARS)).toBe('100 MB');
  });
});
