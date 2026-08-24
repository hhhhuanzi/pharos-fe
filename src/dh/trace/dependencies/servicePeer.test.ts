import type { TraceResponse } from '@/pages/traceCpt/type';
import { aggregateServiceResources } from './servicePeer';

function tags(pairs: Record<string, string>) {
  return Object.entries(pairs).map(([key, value]) => ({ key, value }));
}

function trace(processTags: Record<string, string>, spanTags: Record<string, string> = {}): TraceResponse {
  return {
    traceID: 't1',
    processes: { p0: { serviceName: 'quote', tags: tags(processTags) } },
    spans: [
      {
        spanID: 's1',
        traceID: 't1',
        processID: 'p0',
        operationName: 'GET /q',
        startTime: 1,
        duration: 2,
        logs: [],
        flags: 0,
        tags: tags(spanTags),
      },
    ],
  };
}

describe('aggregateServiceResources', () => {
  it('curates process resource keys and skips empty fields', () => {
    const result = aggregateServiceResources([
      trace({
        'service.instance.id': 'quote-a',
        'deployment.environment.name': 'test',
        'k8s.pod.name': 'quote-0',
      }),
    ]);
    const byId = Object.fromEntries(result.map((row) => [row.id, row]));
    expect(byId.service_instance).toEqual({
      id: 'service_instance',
      values: ['quote-a'],
      sourceKeys: ['service.instance.id'],
    });
    expect(byId.environment.values).toEqual(['test']);
    expect(byId.pod.values).toEqual(['quote-0']);
    expect(byId.host).toBeUndefined();
    expect(byId.namespace).toBeUndefined();
  });
});
