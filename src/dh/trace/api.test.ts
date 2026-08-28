import type { TraceResponse, TraceSpanData } from '@/pages/traceCpt/type';
import { getTraceByID, searchTraceSummaries } from './api';
import type { TraceByIdParams, TraceSearchParams } from './types';
import { isTraceServiceRequired, isTraceUnsupported } from './traceError';
import * as jaeger from './adapters/jaeger';
import * as skywalking from './adapters/skywalking';
import * as otel from './adapters/otel';

jest.mock('./adapters/jaeger', () => ({
  searchJaegerTraces: jest.fn(),
  findDhTraceSummaries: jest.fn(),
  getJaegerServices: jest.fn(),
  getJaegerOperations: jest.fn(),
  getJaegerTraceById: jest.fn(),
  getJaegerDependencies: jest.fn(),
}));
jest.mock('./adapters/skywalking', () => ({
  getSkyWalkingServices: jest.fn(),
  getSkyWalkingOperations: jest.fn(),
  getSkyWalkingInstances: jest.fn(),
  searchSkyWalkingTraces: jest.fn(),
  getSkyWalkingTraceById: jest.fn(),
  searchSkyWalkingTracesPaged: jest.fn(),
}));
jest.mock('./adapters/otel', () => ({
  getOtelServices: jest.fn(),
  getOtelOperations: jest.fn(),
  searchOtelTraces: jest.fn(),
  getOtelTraceById: jest.fn(),
}));

function span(overrides: Partial<TraceSpanData> & Pick<TraceSpanData, 'spanID' | 'startTime' | 'duration'>): TraceSpanData {
  return {
    traceID: 'abc',
    processID: 'p0',
    operationName: 'op',
    logs: [],
    flags: 0,
    warnings: null,
    ...overrides,
  };
}

const baseParams: TraceSearchParams = {
  data_source_id: 5,
  plugin_type: 'jaeger',
  service: 'rome-sec-index',
  start_time_min: 1731000000000,
  start_time_max: 1731000060000,
  num_traces: 20,
};

const summaryRow = {
  traceId: 'abc',
  rootService: 'rome-sec-index',
  rootOperation: 'process',
  rootInterface: 'process',
  rootType: 'mq',
  startTimeUs: 1_000,
  durationUs: 100,
  spanCount: 1,
  errorSpanCount: 0,
  orphanSpanCount: 0,
  services: [{ name: 'rome-sec-index', spanCount: 1, errorSpanCount: 0 }],
} as const;

describe('searchTraceSummaries (Pharos list API)', () => {
  beforeEach(() => {
    jest.mocked(jaeger.searchJaegerTraces).mockReset();
    jest.mocked(jaeger.findDhTraceSummaries).mockReset();
    jest.mocked(skywalking.searchSkyWalkingTracesPaged).mockReset();
  });

  it('serves Jaeger rows from the authorized backend endpoint, not from a client-side fold', async () => {
    jest.mocked(jaeger.findDhTraceSummaries).mockResolvedValue({ summaries: [{ ...summaryRow }], truncated: true });

    const result = await searchTraceSummaries(baseParams);

    expect(jaeger.findDhTraceSummaries).toHaveBeenCalledWith({ ...baseParams, num_traces: 20 });
    // Full spans must never reach the browser for the list.
    expect(jaeger.searchJaegerTraces).not.toHaveBeenCalled();
    expect(result).toEqual({ summaries: [{ ...summaryRow }], source: 'summaries', truncated: true });
  });

  it('applies the default list limit when the form did not set one', async () => {
    jest.mocked(jaeger.findDhTraceSummaries).mockResolvedValue({ summaries: [], truncated: false });

    await searchTraceSummaries({ ...baseParams, num_traces: undefined });

    expect(jaeger.findDhTraceSummaries).toHaveBeenCalledWith({ ...baseParams, num_traces: 100 });
  });

  it('fails closed without a service instead of asking for every team\u2019s traces', async () => {
    const error = await searchTraceSummaries({ ...baseParams, service: '' }).then(
      () => null,
      (e) => e,
    );

    expect(isTraceServiceRequired(error)).toBe(true);
    expect(jaeger.findDhTraceSummaries).not.toHaveBeenCalled();
  });

  it('keeps SkyWalking on its own paged list query', async () => {
    const trace: TraceResponse = {
      traceID: 'abc',
      processes: { p0: { serviceName: 'rome-sec-index', tags: [] } },
      spans: [span({ spanID: 'root', startTime: 1_000, duration: 100, operationName: 'process' })],
    };
    jest.mocked(skywalking.searchSkyWalkingTracesPaged).mockResolvedValue({ traces: [trace], hasMore: false });

    const result = await searchTraceSummaries({ ...baseParams, plugin_type: 'skywalking' });

    expect(skywalking.searchSkyWalkingTracesPaged).toHaveBeenCalled();
    expect(jaeger.findDhTraceSummaries).not.toHaveBeenCalled();
    expect(result.source).toBe('full-traces');
    expect(result.summaries[0]).toMatchObject({ rootType: '', rootOperation: 'process' });
  });
});

describe('getTraceByID', () => {
  const params = (plugin_type: TraceByIdParams['plugin_type']): TraceByIdParams => ({
    data_source_id: 1,
    plugin_type,
    traceID: 'aaaa000000000000000000000000aa',
  });

  beforeEach(() => {
    jest.mocked(jaeger.getJaegerTraceById).mockReset();
    jest.mocked(skywalking.getSkyWalkingTraceById).mockReset();
    jest.mocked(otel.getOtelTraceById).mockReset();
  });

  it('serves Jaeger through the authorized adapter', async () => {
    jest.mocked(jaeger.getJaegerTraceById).mockResolvedValue([]);
    await expect(getTraceByID(params('jaeger'))).resolves.toEqual([]);
    expect(jaeger.getJaegerTraceById).toHaveBeenCalledWith(params('jaeger'));
  });

  it.each(['skywalking', 'otel'] as const)('fails closed for %s instead of reading through the proxy', async (pluginType) => {
    const error = await getTraceByID(params(pluginType)).then(
      () => null,
      (e) => e,
    );

    expect(isTraceUnsupported(error)).toBe(true);
    expect(error.pluginType).toBe(pluginType);
    expect(skywalking.getSkyWalkingTraceById).not.toHaveBeenCalled();
    expect(otel.getOtelTraceById).not.toHaveBeenCalled();
    expect(jaeger.getJaegerTraceById).not.toHaveBeenCalled();
  });
});
