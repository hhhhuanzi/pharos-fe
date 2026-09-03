import { hasTraceEnvFilter, isTraceEnvOption, normalizeTraceEnv, resolveExplorerEnv, TRACE_DEFAULT_ENV, TRACE_ENV_ATTRIBUTE_KEY, TRACE_ENV_OPTIONS } from './env';

describe('TRACE_ENV_ATTRIBUTE_KEY', () => {
  // 属性名写飘的后果是「静默返回 0 条」而不是报错（上游对未知参数和对不上的值都不报错），所以
  // 钉死在测试里。后端对应 `tracefetch.EnvAttributeKey`，两侧必须一致。
  it('is the semconv 1.27+ name, not the deprecated one', () => {
    expect(TRACE_ENV_ATTRIBUTE_KEY).toBe('deployment.environment.name');
  });

  // ES 没开 --es.tags-as-fields，tag key 原样落库，转义写法查不到。
  it('keeps literal dots', () => {
    expect(TRACE_ENV_ATTRIBUTE_KEY).not.toContain('@');
  });
});

describe('TRACE_ENV_OPTIONS', () => {
  it('is the three collected values, lowercase, with no all-environments sentinel', () => {
    expect(TRACE_ENV_OPTIONS).toEqual(['test', 'pre', 'prod']);
    expect(TRACE_DEFAULT_ENV).toBe('test');
  });
});

describe('normalizeTraceEnv', () => {
  it('trims and lowercases so a URL-cased value still matches the reported one', () => {
    expect(normalizeTraceEnv('test')).toBe('test');
    expect(normalizeTraceEnv('  pre  ')).toBe('pre');
    expect(normalizeTraceEnv('PROD')).toBe('prod');
    expect(normalizeTraceEnv(' Pre\t')).toBe('pre');
  });

  it('treats missing and whitespace-only values as unspecified', () => {
    expect(normalizeTraceEnv()).toBe('');
    expect(normalizeTraceEnv('')).toBe('');
    expect(normalizeTraceEnv('   ')).toBe('');
  });

  it('is idempotent', () => {
    ([' Test ', 'prod', '', '  '] as const).forEach((input) => {
      const once = normalizeTraceEnv(input);
      expect(normalizeTraceEnv(once)).toBe(once);
    });
  });
});

describe('hasTraceEnvFilter', () => {
  // 空值是软降级（不加过滤条件），不是「过滤空环境」——后者会把链路 tab 变成空白。
  it('is false for missing or blank values', () => {
    expect(hasTraceEnvFilter()).toBe(false);
    expect(hasTraceEnvFilter('')).toBe(false);
    expect(hasTraceEnvFilter('   ')).toBe(false);
  });

  it('is true once a real environment is given', () => {
    expect(hasTraceEnvFilter('test')).toBe(true);
    expect(hasTraceEnvFilter('  PROD ')).toBe(true);
  });
});

describe('isTraceEnvOption', () => {
  it('accepts only the three collected values', () => {
    expect(isTraceEnvOption('test')).toBe(true);
    expect(isTraceEnvOption('pre')).toBe(true);
    expect(isTraceEnvOption('prod')).toBe(true);
    expect(isTraceEnvOption('dev')).toBe(false);
    expect(isTraceEnvOption('')).toBe(false);
  });
});

describe('resolveExplorerEnv', () => {
  it('keeps a known option after normalize', () => {
    expect(resolveExplorerEnv('pre')).toBe('pre');
    expect(resolveExplorerEnv('  PROD ')).toBe('prod');
    expect(resolveExplorerEnv('Test')).toBe('test');
  });

  it('falls back to test when missing or unknown, never to empty / all-environments', () => {
    expect(resolveExplorerEnv()).toBe('test');
    expect(resolveExplorerEnv('')).toBe('test');
    expect(resolveExplorerEnv('   ')).toBe('test');
    expect(resolveExplorerEnv('staging')).toBe('test');
    expect(resolveExplorerEnv('dev')).toBe('test');
  });
});
