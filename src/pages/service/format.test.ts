import { formatEnv, formatErrorRate } from './format';

describe('formatEnv', () => {
  it('renders an em dash when the series carries no environment label', () => {
    expect(formatEnv('prod')).toBe('prod');
    expect(formatEnv('  ')).toBe('—');
    expect(formatEnv()).toBe('—');
  });
});

describe('formatErrorRate', () => {
  it('treats the value as a 0–1 ratio, not an already-scaled percent', () => {
    expect(formatErrorRate(0)).toBe('0.00%');
    expect(formatErrorRate(0.012)).toBe('1.20%');
    expect(formatErrorRate(0.1)).toBe('10.0%');
    expect(formatErrorRate(1)).toBe('100.0%');
  });

  it('does not survive a second * 100 — a 0–100 axis tick would read as 10000%', () => {
    expect(formatErrorRate(100)).toBe('10000.0%');
  });

  it('renders missing values as an em dash', () => {
    expect(formatErrorRate()).toBe('—');
    expect(formatErrorRate(Number.NaN)).toBe('—');
  });
});
