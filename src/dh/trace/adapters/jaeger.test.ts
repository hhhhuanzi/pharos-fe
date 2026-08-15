import {
  getJaegerServices,
  getJaegerOperations,
  searchJaegerTraces,
  findJaegerTraceSummaries,
  getJaegerTraceById,
  getJaegerDependencies,
} from './jaeger';
import { transformTraceData } from '@/pages/traceCpt/utils';
import { TraceSearchParams, TraceByIdParams } from '../types';

jest.mock('@/utils/constant', () => ({ N9E_PATHNAME: 'n9e' }));
const mockRequest = jest.fn();
jest.mock('@/utils/request', () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockRequest(...args),
}));

describe('jaeger adapter (api_v3)', () => {
  beforeEach(() => {
    mockRequest.mockReset();
  });

  describe('getJaegerServices', () => {
    it('hits /api/v3/services and maps the response into options', async () => {
      mockRequest.mockResolvedValue({ services: ['svc-a', 'svc-b'] });
      const result = await getJaegerServices(1);
      expect(mockRequest).toHaveBeenCalledWith('/api/n9e/proxy/1/api/v3/services', { method: 'Get' });
      expect(result).toEqual([
        { label: 'svc-a', value: 'svc-a' },
        { label: 'svc-b', value: 'svc-b' },
      ]);
    });

    it('degrades to an empty list when the response has no services field', async () => {
      mockRequest.mockResolvedValue({});
      expect(await getJaegerServices(1)).toEqual([]);
    });
  });

  describe('getJaegerOperations', () => {
    it('hits /api/v3/operations with the service filter and returns operation names', async () => {
      mockRequest.mockResolvedValue({ operations: [{ name: 'GET /foo', spanKind: 'server' }, { name: 'GET /bar' }] });
      const result = await getJaegerOperations(1, 'svc-a');
      expect(mockRequest).toHaveBeenCalledWith('/api/n9e/proxy/1/api/v3/operations', { method: 'Get', params: { service: 'svc-a' } });
      expect(result).toEqual(['GET /foo', 'GET /bar']);
    });
  });

  describe('searchJaegerTraces', () => {
    const baseParams: TraceSearchParams = {
      data_source_id: 1,
      plugin_type: 'jaeger',
      service: 'svc-a',
      operation: 'GET /foo',
      start_time_min: 1731000000000,
      start_time_max: 1731000060000,
      duration_min: '10ms',
      duration_max: '2s',
      num_traces: 20,
      attributes: { 'http.status_code': '200' },
    };

    it('sends snake_case query.* params (RFC3339 time range) to /api/v3/traces', async () => {
      mockRequest.mockResolvedValue({ result: { resourceSpans: [] } });
      await searchJaegerTraces(baseParams);
      expect(mockRequest).toHaveBeenCalledWith(
        '/api/n9e/proxy/1/api/v3/traces',
        expect.objectContaining({
          method: 'Get',
          silence: true,
          params: {
            'query.service_name': 'svc-a',
            'query.operation_name': 'GET /foo',
            'query.start_time_min': new Date(1731000000000).toISOString(),
            'query.start_time_max': new Date(1731000060000).toISOString(),
            'query.duration_min': '10ms',
            'query.duration_max': '2s',
            'query.num_traces': '20',
            'query.attributes': JSON.stringify({ 'http.status_code': '200' }),
          },
        }),
      );
    });

    it('groups a combined FindTraces OTLP response into one TraceResponse per traceId', async () => {
      mockRequest.mockResolvedValue({
        result: {
          resourceSpans: [
            {
              resource: { attributes: [{ key: 'service.name', value: { stringValue: 'svc-a' } }] },
              scopeSpans: [
                {
                  spans: [
                    {
                      traceId: 'AAAA000000000000000000000000AA',
                      spanId: '1000000000000001',
                      name: 'root-a',
                      kind: 2,
                      startTimeUnixNano: '1700000000000000000',
                      endTimeUnixNano: '1700000000100000000',
                    },
                  ],
                },
              ],
            },
            {
              resource: { attributes: [{ key: 'service.name', value: { stringValue: 'svc-b' } }] },
              scopeSpans: [
                {
                  spans: [
                    {
                      traceId: 'BBBB000000000000000000000000BB',
                      spanId: '2000000000000002',
                      name: 'root-b',
                      kind: 2,
                      startTimeUnixNano: '1700000001000000000',
                      endTimeUnixNano: '1700000001200000000',
                    },
                  ],
                },
              ],
            },
          ],
        },
      });
      const result = await searchJaegerTraces(baseParams);
      expect(result).toHaveLength(2);
      expect(result.map((t) => t.traceID).sort()).toEqual(['aaaa000000000000000000000000aa', 'bbbb000000000000000000000000bb']);
      const traceA = result.find((t) => t.traceID === 'aaaa000000000000000000000000aa')!;
      expect(traceA.spans[0].operationName).toBe('root-a');
      expect(Object.values(traceA.processes)[0].serviceName).toBe('svc-a');
    });

    it('returns [] (not an error) when the gateway 404s with "No traces found"', async () => {
      mockRequest.mockRejectedValue({ status: 404, message: 'No traces found' });
      expect(await searchJaegerTraces(baseParams)).toEqual([]);
    });

    it('propagates non-404 errors', async () => {
      mockRequest.mockRejectedValue({ status: 500, message: 'boom' });
      await expect(searchJaegerTraces(baseParams)).rejects.toEqual({ status: 500, message: 'boom' });
    });
  });

  describe('getJaegerTraceById', () => {
    const params: TraceByIdParams = { data_source_id: 1, plugin_type: 'jaeger', traceID: 'aaaa000000000000000000000000aa' };

    it('converts parentSpanId into references[0] (CHILD_OF) and preserves microsecond timestamps', async () => {
      mockRequest.mockResolvedValue({
        result: {
          resourceSpans: [
            {
              resource: {
                attributes: [
                  { key: 'service.name', value: { stringValue: 'svc-a' } },
                  { key: 'host.name', value: { stringValue: 'host-1' } },
                ],
              },
              scopeSpans: [
                {
                  scope: { name: 'my-instrumentation', version: '1.0' },
                  spans: [
                    {
                      traceId: 'aaaa000000000000000000000000aa',
                      spanId: '1000000000000001',
                      name: 'root',
                      kind: 2,
                      startTimeUnixNano: '1700000000000000000',
                      endTimeUnixNano: '1700000000500000000',
                      attributes: [{ key: 'http.status_code', value: { intValue: '200' } }],
                    },
                    {
                      traceId: 'aaaa000000000000000000000000aa',
                      spanId: '1000000000000002',
                      parentSpanId: '1000000000000001',
                      name: 'child',
                      kind: 3,
                      startTimeUnixNano: '1700000000100000000',
                      endTimeUnixNano: '1700000000200000000',
                      status: { code: 2, message: 'boom' },
                      events: [
                        {
                          timeUnixNano: '1700000000150000000',
                          name: 'exception',
                          attributes: [{ key: 'exception.message', value: { stringValue: 'boom' } }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      });

      const [trace] = await getJaegerTraceById(params);
      expect(trace.traceID).toBe('aaaa000000000000000000000000aa');
      expect(Object.keys(trace.processes)).toHaveLength(1);
      const process = Object.values(trace.processes)[0];
      expect(process.serviceName).toBe('svc-a');
      expect(process.tags).toEqual(expect.arrayContaining([{ key: 'host.name', value: 'host-1' }]));

      const root = trace.spans.find((s) => s.spanID === '1000000000000001')!;
      const child = trace.spans.find((s) => s.spanID === '1000000000000002')!;

      // 1700000000000000000ns -> 1700000000000000us
      expect(root.startTime).toBe(1700000000000000);
      expect(root.duration).toBe(500000);
      expect(root.tags).toEqual(
        expect.arrayContaining([
          { key: 'span.kind', value: 'server' },
          { key: 'http.status_code', value: 200 },
        ]),
      );
      expect(root.references).toEqual([]);

      expect(child.references).toEqual([{ refType: 'CHILD_OF', spanID: '1000000000000001', traceID: 'aaaa000000000000000000000000aa' }]);
      expect(child.tags).toEqual(
        expect.arrayContaining([
          { key: 'span.kind', value: 'client' },
          { key: 'error', value: true },
          { key: 'otel.status_description', value: 'boom' },
          { key: 'otel.scope.name', value: 'my-instrumentation' },
        ]),
      );
      expect(child.logs).toEqual([
        {
          timestamp: 1700000000150000,
          fields: [
            { key: 'event', value: 'exception' },
            { key: 'exception.message', value: 'boom' },
          ],
        },
      ]);

      // Round-trip through the real traceCpt transform used by the waterfall view — must not throw
      // and must preserve the parent/child depth relationship.
      const transformed = transformTraceData(trace);
      expect(transformed?.spans.map((s) => s.spanID)).toEqual(['1000000000000001', '1000000000000002']);
      expect(transformed?.spans[1].depth).toBe(1);
      expect(transformed?.hasError).toBe(true);
    });

    it('returns [] when the trace is not found (404)', async () => {
      mockRequest.mockRejectedValue({ status: 404, message: 'trace not found' });
      expect(await getJaegerTraceById(params)).toEqual([]);
    });
  });

  describe('findJaegerTraceSummaries', () => {
    const baseParams: TraceSearchParams = {
      data_source_id: 1,
      plugin_type: 'jaeger',
      service: 'svc-a',
      start_time_min: 1731000000000,
      start_time_max: 1731000060000,
      num_traces: 50,
    };

    it('hits /api/v3/trace-summaries with search_depth and maps into Pharos summaries', async () => {
      mockRequest.mockResolvedValue({
        result: {
          summaries: [
            {
              traceId: 'AAAA000000000000000000000000AA',
              rootServiceName: 'gateway',
              rootOperationName: 'GET /orders',
              minStartTimeUnixNano: '1700000000000000000',
              maxEndTimeUnixNano: '1700000000500000000',
              spanCount: 3,
              errorSpanCount: 1,
              orphanSpanCount: 0,
              services: [
                { name: 'order', spanCount: 2, errorSpanCount: 1 },
                { name: 'gateway', spanCount: 1, errorSpanCount: 0 },
              ],
            },
          ],
        },
      });
      const result = await findJaegerTraceSummaries(baseParams);
      expect(mockRequest).toHaveBeenCalledWith(
        '/api/n9e/proxy/1/api/v3/trace-summaries',
        expect.objectContaining({
          method: 'Get',
          silence: true,
          params: expect.objectContaining({
            'query.service_name': 'svc-a',
            'query.search_depth': '50',
          }),
        }),
      );
      expect(result).toEqual([
        {
          traceId: 'aaaa000000000000000000000000aa',
          rootService: 'gateway',
          rootOperation: 'GET /orders',
          startTimeUs: 1700000000000000,
          durationUs: 500000,
          spanCount: 3,
          errorSpanCount: 1,
          orphanSpanCount: 0,
          services: [
            { name: 'order', spanCount: 2, errorSpanCount: 1 },
            { name: 'gateway', spanCount: 1, errorSpanCount: 0 },
          ],
        },
      ]);
    });

    it('returns [] when the endpoint exists but no traces match', async () => {
      mockRequest.mockRejectedValue({ status: 404, message: 'No traces found' });
      expect(await findJaegerTraceSummaries(baseParams)).toEqual([]);
    });

    it('returns null when the endpoint is missing so callers can fall back', async () => {
      mockRequest.mockRejectedValue({ status: 404, message: 'Not Found' });
      expect(await findJaegerTraceSummaries(baseParams)).toBeNull();
    });
  });

  describe('getJaegerDependencies', () => {
    it('keeps using the legacy /api/dependencies endpoint (no api_v3 equivalent is reliably available)', async () => {
      mockRequest.mockResolvedValue({ data: [{ parent: 'a', child: 'b', callCount: 3 }] });
      const result = await getJaegerDependencies(1);
      expect(mockRequest).toHaveBeenCalledWith(
        '/api/n9e/proxy/1/api/dependencies',
        expect.objectContaining({ method: 'Get', params: expect.objectContaining({ lookback: 86400000 }) }),
      );
      expect(result).toEqual([{ parent: 'a', child: 'b', callCount: 3 }]);
    });
  });
});
