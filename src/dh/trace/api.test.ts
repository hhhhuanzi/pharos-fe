import type { TraceResponse, TraceSpanData } from '@/pages/traceCpt/type';
import { searchTraceSummaries } from './api';
import type { TraceSearchParams } from './types';
import * as jaeger from './adapters/jaeger';

jest.mock('./adapters/jaeger', () => ({
  searchJaegerTraces: jest.fn(),
  findJaegerTraceSummaries: jest.fn(),
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

describe('searchTraceSummaries (Pharos list API)', () => {
  beforeEach(() => {
    jest.mocked(jaeger.searchJaegerTraces).mockReset();
    jest.mocked(jaeger.findJaegerTraceSummaries).mockReset();
  });

  it('fills PharosTraceSummary.rootType from root span tags (messaging.system → mq)', async () => {
    const trace: TraceResponse = {
      traceID: 'abc',
      processes: { p0: { serviceName: 'rome-sec-index', tags: [] } },
      spans: [
        span({
          spanID: 'root',
          startTime: 1_000,
          duration: 100,
          operationName: 'process',
          tags: [
            { key: 'messaging.system', value: 'rabbitmq' },
            { key: 'span.kind', value: 'consumer' },
          ],
        }),
      ],
    };
    jest.mocked(jaeger.searchJaegerTraces).mockResolvedValue([trace]);

    const result = await searchTraceSummaries(baseParams);

    expect(jaeger.findJaegerTraceSummaries).not.toHaveBeenCalled();
    expect(result.summaries[0]).toMatchObject({
      rootType: 'mq',
      rootOperation: 'process',
      rootInterface: 'process',
    });
  });

  it('leaves rootType empty for bare process without tags (does not guess MQ)', async () => {
    const trace: TraceResponse = {
      traceID: 'abc',
      processes: { p0: { serviceName: 'rome-sec-index', tags: [] } },
      spans: [span({ spanID: 'root', startTime: 1_000, duration: 100, operationName: 'process' })],
    };
    jest.mocked(jaeger.searchJaegerTraces).mockResolvedValue([trace]);

    const result = await searchTraceSummaries(baseParams);

    expect(result.summaries[0]).toMatchObject({ rootType: '', rootOperation: 'process' });
  });
});
