import '../fieldsSidebar/test/localStorageMock';
import { CONFIG_STORAGE_KEY } from './constants';
import { getLogExplorerTarget, getLogTraceConfig } from './config';
import { buildLogDeepLink, buildLogTimeWindow, buildTraceDeepLink, isLogJumpEnabled, parseTraceDeepLink, resolveLogDeepLink } from './deepLink';

describe('isLogJumpEnabled', () => {
  it('enables only jaeger', () => {
    expect(isLogJumpEnabled('jaeger')).toBe(true);
    expect(isLogJumpEnabled('skywalking')).toBe(false);
    expect(isLogJumpEnabled('otel')).toBe(false);
    expect(isLogJumpEnabled(undefined)).toBe(false);
  });
});

describe('buildLogTimeWindow', () => {
  it('converts microseconds and adds the default ±3min buffer', () => {
    const window = buildLogTimeWindow(1_700_000_000_000_000, 2_000_000);
    expect(window.startMs).toBe(1_700_000_000_000 - 3 * 60 * 1000);
    expect(window.endMs).toBe(1_700_000_002_000 + 3 * 60 * 1000);
  });

  it('does not go below epoch', () => {
    const window = buildLogTimeWindow(1_000, 500);
    expect(window.startMs).toBe(0);
    expect(window.endMs).toBeGreaterThan(window.startMs);
  });
});

describe('buildLogDeepLink', () => {
  it('builds the log explorer URL without a trace datasource id', () => {
    const url = buildLogDeepLink({
      traceId: 'abc123',
      startMs: 1000,
      endMs: 2000,
      datasourceId: 7,
      indexPattern: 3,
    });
    const parsed = new URL(url, 'http://local.test');
    expect(parsed.pathname).toBe('/log/explorer');
    expect(parsed.searchParams.get('data_source_name')).toBe('elasticsearch');
    expect(parsed.searchParams.get('data_source_id')).toBe('7');
    expect(parsed.searchParams.get('index_pattern')).toBe('3');
    expect(parsed.searchParams.get('query')).toBe('trace_id:"abc123"');
    expect(parsed.searchParams.get('start')).toBe('1000');
    expect(parsed.searchParams.get('end')).toBe('2000');
    expect(parsed.searchParams.get('__execute__')).toBe('true');
    expect(parsed.searchParams.get('datasourceValue')).toBeNull();
    expect(parsed.searchParams.get('pluginType')).toBeNull();
    expect(parsed.searchParams.get('service')).toBeNull();
  });

  it('falls back to raw index when no index pattern is set', () => {
    const url = buildLogDeepLink({
      traceId: 'abc123',
      startMs: 1,
      endMs: 2,
      datasourceId: 7,
      index: 'app-logs-*',
    });
    const parsed = new URL(url, 'http://local.test');
    expect(parsed.searchParams.get('index')).toBe('app-logs-*');
    expect(parsed.searchParams.get('index_pattern')).toBeNull();
  });
});

describe('buildTraceDeepLink', () => {
  it('keeps the existing log → trace protocol', () => {
    expect(buildTraceDeepLink({ traceId: 'abc', datasourceId: 9, pluginType: 'jaeger' })).toBe('/trace/explorer?traceId=abc&datasourceValue=9&pluginType=jaeger');
  });
});

describe('parseTraceDeepLink', () => {
  it('still opens a trace by id', () => {
    expect(parseTraceDeepLink('?traceId=abc&datasourceValue=5&pluginType=jaeger')).toEqual({
      traceId: 'abc',
      service: undefined,
      tags: undefined,
      datasourceId: 5,
      pluginType: 'jaeger',
    });
  });

  it('accepts a service filter without a trace id', () => {
    expect(parseTraceDeepLink('?service=order&datasourceValue=5&pluginType=jaeger&tags=k8s.cluster.name%3Dprod')).toEqual({
      traceId: undefined,
      service: 'order',
      tags: 'k8s.cluster.name=prod',
      datasourceId: 5,
      pluginType: 'jaeger',
    });
  });

  it('ignores a query with neither traceId nor service', () => {
    expect(parseTraceDeepLink('?datasourceValue=5&pluginType=jaeger')).toEqual({});
  });
});

describe('resolveLogDeepLink', () => {
  afterEach(() => {
    localStorage.removeItem(CONFIG_STORAGE_KEY);
  });

  it('returns null when ES target is missing', () => {
    expect(resolveLogDeepLink({ traceId: 'abc', startUs: 1_000_000, durationUs: 1 })).toBeNull();
    expect(getLogExplorerTarget(getLogTraceConfig())).toBeNull();
  });

  it('returns a url when config has datasource + index pattern', () => {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify({ logDatasourceId: 4, logIndexPattern: 8 }));
    const url = resolveLogDeepLink({ traceId: 'deadbeef', startUs: 2_000_000, durationUs: 1_000 });
    expect(url).toContain('/log/explorer?');
    expect(url).toContain('data_source_id=4');
    expect(url).toContain('index_pattern=8');
    expect(url).toContain('deadbeef');
  });

  it('uses raw index when only logIndex is set', () => {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify({ logDatasourceId: 4, logIndex: 'app-logs-*' }));
    const url = resolveLogDeepLink({ traceId: 'deadbeef', startUs: 2_000_000, durationUs: 1_000 });
    expect(url).toContain('index=app-logs-*');
    expect(url).not.toContain('index_pattern=');
  });
});

describe('getLogExplorerTarget', () => {
  it('prefers index pattern over raw index', () => {
    expect(getLogExplorerTarget({ traceIdFields: ['trace_id'], logDatasourceId: 1, logIndexPattern: 9, logIndex: 'app-logs-*' })).toEqual({
      datasourceId: 1,
      indexPattern: 9,
      index: undefined,
    });
  });
});
