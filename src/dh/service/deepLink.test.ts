import '../fieldsSidebar/test/localStorageMock';
import { CONFIG_STORAGE_KEY } from '@/dh/logTrace/constants';

import { LOG_CLUSTER_FIELD, LOG_NAMESPACE_FIELD, LOG_SERVICE_FIELD } from './constants';
import { buildServiceLogDeepLink, buildServiceLogQuery, buildServiceTraceDeepLink, buildServiceTraceTags, escapeEsQueryValue, resolveServiceLogDeepLink } from './deepLink';

describe('escapeEsQueryValue', () => {
  it('escapes quotes and backslashes', () => {
    expect(escapeEsQueryValue('a"b\\c')).toBe('a\\"b\\\\c');
  });
});

describe('buildServiceLogQuery', () => {
  it('starts from kubernetes.container_name and ANDs cluster / namespace when present', () => {
    expect(buildServiceLogQuery({ service: 'order' })).toBe(`${LOG_SERVICE_FIELD}:"order"`);
    expect(buildServiceLogQuery({ service: 'order', cluster: 'prod', namespace: 'pay' })).toBe(
      `${LOG_SERVICE_FIELD}:"order" AND ${LOG_CLUSTER_FIELD}:"prod" AND ${LOG_NAMESPACE_FIELD}:"pay"`,
    );
  });
});

describe('buildServiceTraceTags', () => {
  it('uses OTel resource keys in logfmt, and stays empty without association', () => {
    expect(buildServiceTraceTags({})).toBe('');
    expect(buildServiceTraceTags({ cluster: 'prod', namespace: 'pay' })).toBe('k8s.cluster.name=prod k8s.namespace.name=pay');
  });
});

describe('buildServiceTraceDeepLink', () => {
  it('returns null without a service or Jaeger datasource', () => {
    expect(buildServiceTraceDeepLink({ service: 'order' })).toBeNull();
    expect(buildServiceTraceDeepLink({ ds: 5 })).toBeNull();
  });

  it('opens the existing explorer with service + jaeger ds, and tags when associated', () => {
    const url = buildServiceTraceDeepLink({ service: 'order', cluster: 'prod', namespace: 'pay', ds: 5 });
    const parsed = new URL(url!, 'http://local.test');
    expect(parsed.pathname).toBe('/trace/explorer');
    expect(parsed.searchParams.get('service')).toBe('order');
    expect(parsed.searchParams.get('datasourceValue')).toBe('5');
    expect(parsed.searchParams.get('pluginType')).toBe('jaeger');
    expect(parsed.searchParams.get('tags')).toBe('k8s.cluster.name=prod k8s.namespace.name=pay');
    expect(parsed.searchParams.get('traceId')).toBeNull();
  });
});

describe('buildServiceLogDeepLink', () => {
  it('reuses the log explorer query/search convention', () => {
    const url = buildServiceLogDeepLink({ service: 'order', namespace: 'pay' }, { datasourceId: 1, indexPattern: 1 });
    const parsed = new URL(url, 'http://local.test');
    expect(parsed.pathname).toBe('/log/explorer');
    expect(parsed.searchParams.get('data_source_name')).toBe('elasticsearch');
    expect(parsed.searchParams.get('data_source_id')).toBe('1');
    expect(parsed.searchParams.get('index_pattern')).toBe('1');
    expect(parsed.searchParams.get('query')).toBe(`${LOG_SERVICE_FIELD}:"order" AND ${LOG_NAMESPACE_FIELD}:"pay"`);
    expect(parsed.searchParams.get('__execute__')).toBe('true');
  });
});

describe('resolveServiceLogDeepLink', () => {
  afterEach(() => {
    localStorage.removeItem(CONFIG_STORAGE_KEY);
  });

  it('returns null when ES target is missing', () => {
    expect(resolveServiceLogDeepLink({ service: 'order' })).toBeNull();
  });

  it('returns a url when the existing log-trace config is set', () => {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify({ logDatasourceId: 1, logIndexPattern: 1 }));
    const url = resolveServiceLogDeepLink({ service: 'order' });
    expect(url).toContain('/log/explorer?');
    expect(url).toContain('data_source_id=1');
    expect(url).toContain('index_pattern=1');
    expect(url).toContain('kubernetes.container_name');
  });
});
