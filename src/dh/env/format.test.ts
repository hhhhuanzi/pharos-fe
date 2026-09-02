import { formatEnv } from './format';

describe('formatEnv', () => {
  it('renders an em dash when the series carries no environment label', () => {
    expect(formatEnv('prod')).toBe('prod');
    expect(formatEnv('  ')).toBe('—');
    expect(formatEnv()).toBe('—');
  });
});
