import type { Trace, TraceResponse, TraceSpan, TraceSpanData } from '@/pages/traceCpt/type';
import { traceResponseToSummary, traceToPharosDetail } from './contract';

function span(overrides: Partial<TraceSpanData> & Pick<TraceSpanData, 'spanID' | 'startTime' | 'duration'>): TraceSpanData {
  return {
    traceID: 'abc',
    processID: 'p0',
    operationName: 'op',
    logs: [],
    flags: 0,
    ...overrides,
  };
}

const processes = {
  p0: { serviceName: 'gateway', tags: [] },
  p1: { serviceName: 'order', tags: [] },
} satisfies TraceResponse['processes'];

describe('traceResponseToSummary', () => {
  it('derives root span, duration and per-service breakdown', () => {
    const res: TraceResponse = {
      traceID: 'ABC',
      processes,
      spans: [
        span({ spanID: 'child2', startTime: 1_200, duration: 500, processID: 'p1', references: [{ refType: 'CHILD_OF', spanID: 'root', traceID: 'abc' }] }),
        span({ spanID: 'root', startTime: 1_000, duration: 900, operationName: 'GET /orders' }),
        span({ spanID: 'child1', startTime: 1_100, duration: 200, processID: 'p1', references: [{ refType: 'CHILD_OF', spanID: 'root', traceID: 'abc' }] }),
      ],
    };

    const summary = traceResponseToSummary(res);

    expect(summary).toMatchObject({
      traceId: 'abc',
      rootService: 'gateway',
      rootOperation: 'GET /orders',
      rootInterface: 'GET /orders',
      rootType: 'web',
      startTimeUs: 1_000,
      durationUs: 900,
      spanCount: 3,
      errorSpanCount: 0,
      orphanSpanCount: 0,
    });
    // Sorted by span count desc, so the busiest service leads.
    expect(summary?.services).toEqual([
      { name: 'order', spanCount: 2, errorSpanCount: 0 },
      { name: 'gateway', spanCount: 1, errorSpanCount: 0 },
    ]);
  });

  it('counts error spans per trace and per service, ignoring falsy error tags', () => {
    const res: TraceResponse = {
      traceID: 'abc',
      processes,
      spans: [
        span({ spanID: 'root', startTime: 1_000, duration: 100 }),
        span({ spanID: 'ok', startTime: 1_010, duration: 10, processID: 'p1', tags: [{ key: 'error', value: false }] }),
        span({ spanID: 'bad', startTime: 1_020, duration: 10, processID: 'p1', tags: [{ key: 'error', value: true }] }),
      ],
    };

    const summary = traceResponseToSummary(res);

    expect(summary?.errorSpanCount).toBe(1);
    expect(summary?.services).toContainEqual({ name: 'order', spanCount: 2, errorSpanCount: 1 });
  });

  it('treats spans whose parent is missing as orphans and still finds a root', () => {
    const res: TraceResponse = {
      traceID: 'abc',
      processes,
      spans: [
        span({ spanID: 'a', startTime: 2_000, duration: 100, references: [{ refType: 'CHILD_OF', spanID: 'gone', traceID: 'abc' }] }),
        span({ spanID: 'b', startTime: 1_500, duration: 100, operationName: 'earliest', references: [{ refType: 'CHILD_OF', spanID: 'also-gone', traceID: 'abc' }] }),
      ],
    };

    const summary = traceResponseToSummary(res);

    expect(summary?.orphanSpanCount).toBe(2);
    expect(summary?.rootOperation).toBe('earliest');
  });

  // env is a *resource* attribute, so it rides on `processes[pid].tags`, not on the span tags.
  // Reading it off the span would silently leave the list's 环境 column empty.
  it('collects environments from process tags, deduplicated', () => {
    const envProcesses = {
      p0: { serviceName: 'gateway', tags: [{ key: 'deployment.environment.name', value: 'test' }] },
      p1: { serviceName: 'order', tags: [{ key: 'deployment.environment.name', value: 'test' }] },
    } satisfies TraceResponse['processes'];

    const summary = traceResponseToSummary({
      traceID: 'abc',
      processes: envProcesses,
      spans: [
        span({ spanID: 'root', startTime: 1_000, duration: 100 }),
        span({ spanID: 'child', startTime: 1_010, duration: 10, processID: 'p1', references: [{ refType: 'CHILD_OF', spanID: 'root', traceID: 'abc' }] }),
      ],
    });

    expect(summary?.envs).toEqual(['test']);
  });

  // Fallback branch: calls do not cross environments and the DB emits no spans of its own, so this
  // should not occur in practice — but when it does the list must be able to say so.
  it('keeps every environment in first-seen order when a trace spans more than one', () => {
    const envProcesses = {
      p0: { serviceName: 'gateway', tags: [{ key: 'deployment.environment.name', value: 'test' }] },
      p1: { serviceName: 'order', tags: [{ key: 'deployment.environment.name', value: 'pre' }] },
    } satisfies TraceResponse['processes'];

    const summary = traceResponseToSummary({
      traceID: 'abc',
      processes: envProcesses,
      spans: [
        span({ spanID: 'root', startTime: 1_000, duration: 100 }),
        span({ spanID: 'child', startTime: 1_010, duration: 10, processID: 'p1', references: [{ refType: 'CHILD_OF', spanID: 'root', traceID: 'abc' }] }),
      ],
    });

    expect(summary?.envs).toEqual(['test', 'pre']);
  });

  it('falls back to span tags when the process does not carry the environment attribute', () => {
    const summary = traceResponseToSummary({
      traceID: 'abc',
      processes,
      spans: [
        span({
          spanID: 'root',
          startTime: 1_000,
          duration: 100,
          tags: [{ key: 'deployment.environment.name', value: 'pre' }],
        }),
      ],
    });

    expect(summary?.envs).toEqual(['pre']);
  });

  // Most services have not been injected with the attribute yet; that must read as "no environment
  // information", not as an environment named "".
  it('reports an empty list when no process carries the environment attribute', () => {
    const summary = traceResponseToSummary({
      traceID: 'abc',
      processes,
      spans: [span({ spanID: 'root', startTime: 1_000, duration: 100 })],
    });

    expect(summary?.envs).toEqual([]);
  });

  it('returns null when the response carries no usable spans', () => {
    expect(traceResponseToSummary({ traceID: 'abc', processes, spans: [] })).toBeNull();
    expect(traceResponseToSummary({ traceID: 'abc', processes, spans: [span({ spanID: 'a', startTime: 0, duration: 10 })] })).toBeNull();
  });

  it('assembles rootInterface and rootType from root-span tags', () => {
    const http = traceResponseToSummary({
      traceID: 'abc',
      processes,
      spans: [
        span({
          spanID: 'root',
          startTime: 1_000,
          duration: 100,
          operationName: 'HTTP GET',
          tags: [
            { key: 'http.method', value: 'GET' },
            { key: 'http.route', value: '/orders' },
          ],
        }),
      ],
    });
    expect(http).toMatchObject({ rootInterface: 'GET /orders', rootType: 'web', rootOperation: 'HTTP GET' });

    const db = traceResponseToSummary({
      traceID: 'abc',
      processes,
      spans: [
        span({
          spanID: 'root',
          startTime: 1_000,
          duration: 100,
          operationName: 'Mysql/query',
          tags: [
            { key: 'db.system', value: 'mysql' },
            { key: 'db.statement', value: 'SELECT 1' },
          ],
        }),
      ],
    });
    expect(db).toMatchObject({ rootInterface: 'SELECT 1', rootType: 'sql', rootOperation: 'Mysql/query' });

    const clickhouse = traceResponseToSummary({
      traceID: 'abc',
      processes,
      spans: [
        span({
          spanID: 'root',
          startTime: 1_000,
          duration: 100,
          operationName: 'query',
          tags: [{ key: 'db.system', value: 'clickhouse' }],
        }),
      ],
    });
    expect(clickhouse).toMatchObject({ rootType: 'sql' });

    const nacos = traceResponseToSummary({
      traceID: 'abc',
      processes,
      spans: [
        span({
          spanID: 'root',
          startTime: 1_000,
          duration: 100,
          operationName: 'POST',
          tags: [
            { key: 'url.full', value: 'http://172.22.0.27:8848/nacos/v1/cs/configs/listener' },
            { key: 'http.request.method', value: 'POST' },
          ],
        }),
      ],
    });
    expect(nacos).toMatchObject({ rootType: 'nacos', rootOperation: 'POST' });

    const opaque = traceResponseToSummary({
      traceID: 'abc',
      processes,
      spans: [span({ spanID: 'root', startTime: 1_000, duration: 100, operationName: 'internal-op' })],
    });
    expect(opaque).toMatchObject({ rootType: '' });

    const rabbit = traceResponseToSummary({
      traceID: 'abc',
      processes,
      spans: [
        span({
          spanID: 'root',
          startTime: 1_000,
          duration: 100,
          operationName: 'process',
          tags: [
            { key: 'messaging.system', value: 'rabbitmq' },
            { key: 'messaging.operation', value: 'process' },
            { key: 'span.kind', value: 'consumer' },
          ],
        }),
      ],
    });
    expect(rabbit).toMatchObject({ rootType: 'mq', rootOperation: 'process' });

    const bareProcess = traceResponseToSummary({
      traceID: 'abc',
      processes,
      spans: [span({ spanID: 'root', startTime: 1_000, duration: 100, operationName: 'process' })],
    });
    expect(bareProcess).toMatchObject({ rootType: '' });
  });

  it('uses child-span tags when the root is only a generated frame', () => {
    const http = traceResponseToSummary({
      traceID: 'abc',
      processes,
      spans: [
        span({ spanID: 'root', startTime: 1_000, duration: 100, operationName: 'Scheduler$$Lambda.run' }),
        span({
          spanID: 'child',
          startTime: 1_010,
          duration: 80,
          operationName: 'POST',
          tags: [
            { key: 'http.request.method', value: 'POST' },
            { key: 'url.full', value: 'http://svc.internal/instances' },
            { key: 'http.response.status_code', value: 201 },
          ],
          references: [{ refType: 'CHILD_OF', spanID: 'root', traceID: 'abc' }],
        }),
      ],
    });
    expect(http).toMatchObject({ rootType: 'web', rootOperation: 'Scheduler$$Lambda.run' });

    const nacos = traceResponseToSummary({
      traceID: 'abc',
      processes,
      spans: [
        span({ spanID: 'root', startTime: 1_000, duration: 100, operationName: 'Watch$$Lambda.run' }),
        span({
          spanID: 'child',
          startTime: 1_010,
          duration: 80,
          operationName: 'GET',
          tags: [
            { key: 'url.full', value: 'http://172.22.0.27:8848/nacos/v1/ns/instance/list' },
            { key: 'http.request.method', value: 'GET' },
          ],
          references: [{ refType: 'CHILD_OF', spanID: 'root', traceID: 'abc' }],
        }),
      ],
    });
    expect(nacos).toMatchObject({ rootType: 'nacos', rootOperation: 'Watch$$Lambda.run' });
  });
});

function detailSpan(
  overrides: Partial<TraceSpan> & Pick<TraceSpan, 'spanID' | 'startTime' | 'duration' | 'depth'> & { processID: 'p0' | 'p1' },
): TraceSpan {
  const processID = overrides.processID;
  return {
    traceID: 'abc',
    operationName: 'op',
    logs: [],
    flags: 0,
    hasChildren: false,
    childSpanCount: 0,
    process: processes[processID],
    relativeStartTime: 0,
    tags: [],
    references: [],
    warnings: [],
    subsidiarilyReferencedBy: [],
    ...overrides,
  };
}

describe('traceToPharosDetail', () => {
  it('flattens parentSpanId and service from the waterfall Trace', () => {
    const trace: Trace = {
      traceID: 'abc',
      processes,
      startTime: 1_000,
      endTime: 1_900,
      duration: 900,
      traceName: 'gateway: GET /orders',
      services: [
        { name: 'gateway', numberOfSpans: 1 },
        { name: 'order', numberOfSpans: 1 },
      ],
      spans: [
        detailSpan({
          spanID: 'root',
          startTime: 1_000,
          duration: 900,
          depth: 0,
          processID: 'p0',
          operationName: 'GET /orders',
          childSpanCount: 1,
          hasChildren: true,
        }),
        detailSpan({
          spanID: 'child',
          startTime: 1_100,
          duration: 200,
          depth: 1,
          processID: 'p1',
          operationName: 'list',
          tags: [{ key: 'error', value: true }],
          references: [{ refType: 'CHILD_OF', spanID: 'root', traceID: 'abc' }],
        }),
      ],
    };

    expect(traceToPharosDetail(trace)).toEqual({
      traceId: 'abc',
      startTimeUs: 1_000,
      durationUs: 900,
      spans: [
        {
          spanId: 'root',
          parentSpanId: null,
          service: 'gateway',
          operation: 'GET /orders',
          startTimeUs: 1_000,
          durationUs: 900,
          error: false,
          depth: 0,
          childCount: 1,
        },
        {
          spanId: 'child',
          parentSpanId: 'root',
          service: 'order',
          operation: 'list',
          startTimeUs: 1_100,
          durationUs: 200,
          error: true,
          depth: 1,
          childCount: 0,
        },
      ],
    });
  });
});
