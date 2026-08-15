import _ from 'lodash';
import { UnifiedServiceOption, TraceSearchParams, TraceByIdParams, TracePageResult } from '../types';
import { buildDuration, graphqlRequest } from './skywalkingGraphql';
import { TraceResponse, TraceSpanData } from '@/pages/traceCpt/type';

interface SwService {
  id: string;
  name: string;
  /** Real agent-instrumented service (true) vs. conjectural/virtual service inferred from downstream calls, e.g. a DB/MQ node (false). */
  normal?: boolean;
}

/** SkyWalking service names follow `${group}::${shortName}` (Service Auto Grouping). Split for display; ungrouped services have no `::`. */
function splitServiceGroup(name: string): { group?: string; shortName: string } {
  const idx = name.indexOf('::');
  if (idx === -1) return { shortName: name };
  return { group: name.slice(0, idx), shortName: name.slice(idx + 2) };
}

interface SwEndpoint {
  id: string;
  name: string;
}

interface SwBasicTrace {
  segmentId?: string;
  endpointNames?: string[];
  duration?: number;
  start?: string;
  isError?: boolean;
  traceIds?: string[];
}

interface SwSpan {
  traceId: string;
  segmentId: string;
  spanId: number;
  parentSpanId: number;
  refs?: Array<{
    traceId: string;
    parentSegmentId: string;
    parentSpanId: number;
    type: string;
  }>;
  serviceCode: string;
  serviceInstanceName?: string;
  startTime: number;
  endTime: number;
  endpointName: string;
  type?: string;
  peer?: string;
  component?: string;
  isError?: boolean;
  layer?: string;
  tags?: Array<{ key: string; value: string }>;
  logs?: Array<{
    time: number;
    data?: Array<{ key: string; value: string }>;
  }>;
}

function toSpanId(segmentId: string, spanId: number) {
  return `${segmentId}.${spanId}`;
}

/** SW start/end are milliseconds → Jaeger-compatible microseconds */
function msToUs(ms: number) {
  return ms * 1000;
}

/**
 * Map SkyWalking spans directly to a Jaeger `TraceResponse`.
 * traceCpt's `transformTraceData` recomputes trace startTime/duration/services from spans,
 * so we only need to emit processes + spans here.
 */
function swSpansToJaegerResponse(traceId: string, spans: SwSpan[]): TraceResponse {
  const processes: TraceResponse['processes'] = {};
  const processIdByService: Record<string, string> = {};
  let processSeq = 0;

  const jaegerSpans: TraceSpanData[] = (spans || []).map((s) => {
    const serviceName = s.serviceCode || 'unknown';
    let processID = processIdByService[serviceName];
    if (!processID) {
      processID = `p${processSeq++}`;
      processIdByService[serviceName] = processID;
      processes[processID] = {
        serviceName,
        tags: s.serviceInstanceName ? [{ key: 'service.instance', value: s.serviceInstanceName }] : [],
      };
    }

    const spanTraceId = s.traceId || traceId;
    const references: NonNullable<TraceSpanData['references']> = [];
    if (s.parentSpanId >= 0) {
      references.push({ refType: 'CHILD_OF', spanID: toSpanId(s.segmentId, s.parentSpanId), traceID: spanTraceId });
    }
    (s.refs || []).forEach((ref) => {
      references.push({ refType: 'CHILD_OF', spanID: toSpanId(ref.parentSegmentId, ref.parentSpanId), traceID: ref.traceId || traceId });
    });

    const tags = [
      ...(s.tags || []).map((t) => ({ key: t.key, value: String(t.value) })),
      s.component ? { key: 'component', value: s.component } : null,
      s.peer ? { key: 'peer', value: s.peer } : null,
      s.layer ? { key: 'layer', value: s.layer } : null,
      s.type ? { key: 'span.type', value: s.type } : null,
      s.isError ? { key: 'error', value: 'true' } : null,
      // service.instance already surfaces via span.process.tags (see processes[processID] below); avoid duplicating it here.
    ].filter(Boolean) as Array<{ key: string; value: string }>;

    const startUs = msToUs(Number(s.startTime));
    const endUs = msToUs(Number(s.endTime));

    return {
      spanID: toSpanId(s.segmentId, s.spanId),
      traceID: spanTraceId,
      processID,
      operationName: s.endpointName || 'unknown',
      startTime: startUs,
      duration: Math.max(endUs - startUs, 0),
      logs: (s.logs || []).map((log) => ({
        timestamp: msToUs(Number(log.time)),
        fields: (log.data || []).map((d) => ({ key: d.key, value: String(d.value) })),
      })),
      tags,
      references,
      flags: 0,
      warnings: null,
    };
  });

  return {
    traceID: traceId,
    processes,
    spans: jaegerSpans,
  };
}

export async function getSkyWalkingServices(dataSourceId: number, startMs: number, endMs: number): Promise<UnifiedServiceOption[]> {
  const duration = buildDuration(startMs, endMs);
  let list: SwService[];
  try {
    const data = await graphqlRequest(
      dataSourceId,
      `
        query ($duration: Duration!) {
          getAllServices(duration: $duration) {
            id
            name
            normal
          }
        }
      `,
      { duration },
    );
    list = data?.getAllServices || [];
  } catch (e) {
    // Older OAP versions may not expose `normal` on Service; degrade to the minimal field set.
    const data = await graphqlRequest(
      dataSourceId,
      `
        query ($duration: Duration!) {
          getAllServices(duration: $duration) {
            id
            name
          }
        }
      `,
      { duration },
    );
    list = data?.getAllServices || [];
  }
  return list
    .filter((s) => s.normal !== false) // hide conjectural services (e.g. auto-detected DB/MQ nodes) from the picker; keep real instrumented services only
    .map((s) => {
      const { group, shortName } = splitServiceGroup(s.name);
      return { label: shortName, value: s.id, group };
    });
}

export async function getSkyWalkingOperations(dataSourceId: number, serviceId: string): Promise<string[]> {
  if (!serviceId) return [];
  const data = await graphqlRequest(
    dataSourceId,
    `
      query ($serviceId: ID!) {
        findEndpoint(serviceId: $serviceId, keyword: "", limit: 100) {
          id
          name
        }
      }
    `,
    { serviceId },
  );
  const list: SwEndpoint[] = data?.findEndpoint || [];
  return list.map((e) => e.name);
}

export async function getSkyWalkingInstances(dataSourceId: number, serviceId: string, startMs: number, endMs: number): Promise<UnifiedServiceOption[]> {
  if (!serviceId) return [];
  const duration = buildDuration(startMs, endMs);
  const data = await graphqlRequest(
    dataSourceId,
    `
      query ($duration: Duration!, $serviceId: ID!) {
        getServiceInstances(duration: $duration, serviceId: $serviceId) {
          id
          name
        }
      }
    `,
    { duration, serviceId },
  );
  const list: SwService[] = data?.getServiceInstances || [];
  // Instance `name` already contains the IP (SkyWalking convention: `${instanceUUID}@${ip}`); show as-is.
  return list.map((i) => ({ label: i.name, value: i.id }));
}

async function queryTraceRaw(dataSourceId: number, traceId: string): Promise<TraceResponse | null> {
  const data = await graphqlRequest(
    dataSourceId,
    `
      query ($traceId: ID!) {
        queryTrace(traceId: $traceId) {
          spans {
            traceId
            segmentId
            spanId
            parentSpanId
            refs {
              traceId
              parentSegmentId
              parentSpanId
              type
            }
            serviceCode
            serviceInstanceName
            startTime
            endTime
            endpointName
            type
            peer
            component
            isError
            layer
            tags {
              key
              value
            }
            logs {
              time
              data {
                key
                value
              }
            }
          }
        }
      }
    `,
    { traceId },
  );
  const spans: SwSpan[] = data?.queryTrace?.spans || [];
  if (!spans.length) return null;
  const tid = spans[0].traceId || traceId;
  return swSpansToJaegerResponse(tid, spans);
}

export async function searchSkyWalkingTraces(params: TraceSearchParams): Promise<TraceResponse[]> {
  const duration = buildDuration(params.start_time_min, params.start_time_max);
  const pageSize = params.num_traces || 20;

  const condition: Record<string, unknown> = {
    queryDuration: duration,
    traceState: 'ALL',
    queryOrder: 'BY_START_TIME',
    paging: { pageNum: 1, pageSize },
  };

  if (params.service) {
    condition.serviceId = params.service;
  }
  if (params.instance) {
    condition.serviceInstanceId = params.instance;
  }
  if (params.operation) {
    // endpoint filter uses name lookup via queryBasicTraces tags when id unknown;
    // prefer leaving endpointId empty and filter client-side by endpointNames if needed
  }
  if (params.attributes && !_.isEmpty(params.attributes)) {
    condition.tags = Object.entries(params.attributes).map(([key, value]) => ({ key, value }));
  }

  const data = await graphqlRequest(
    params.data_source_id,
    `
      query ($condition: TraceQueryCondition!) {
        queryBasicTraces(condition: $condition) {
          traces {
            segmentId
            endpointNames
            duration
            start
            isError
            traceIds
          }
        }
      }
    `,
    { condition },
  );

  let briefs: SwBasicTrace[] = data?.queryBasicTraces?.traces || [];
  if (params.operation) {
    briefs = briefs.filter((b) => (b.endpointNames || []).includes(params.operation as string));
  }

  const uniqueTraceIds = _.uniq(briefs.flatMap((b) => b.traceIds || []).filter(Boolean)).slice(0, pageSize);

  const results = await Promise.all(
    uniqueTraceIds.map(async (traceId) => {
      try {
        return await queryTraceRaw(params.data_source_id, traceId);
      } catch {
        return null;
      }
    }),
  );

  return results.filter(Boolean) as TraceResponse[];
}

export async function getSkyWalkingTraceById(params: TraceByIdParams): Promise<TraceResponse[]> {
  const trace = await queryTraceRaw(params.data_source_id, params.traceID);
  return trace ? [trace] : [];
}

/** Build the `queryBasicTraces` condition shared by the lightweight list query. */
function buildBasicTraceCondition(params: TraceSearchParams, pageNum: number, pageSize: number): Record<string, unknown> {
  const condition: Record<string, unknown> = {
    queryDuration: buildDuration(params.start_time_min, params.start_time_max),
    traceState: 'ALL',
    queryOrder: 'BY_START_TIME',
    paging: { pageNum, pageSize },
  };
  if (params.service) {
    condition.serviceId = params.service;
  }
  if (params.instance) {
    condition.serviceInstanceId = params.instance;
  }
  if (params.attributes && !_.isEmpty(params.attributes)) {
    condition.tags = Object.entries(params.attributes).map(([key, value]) => ({ key, value }));
  }
  return condition;
}

/**
 * Paginated trace list with full spans. Two steps per page:
 *   1. `queryBasicTraces` returns the page's trace ids (cheap; also drives pagination / `hasMore` / order).
 *   2. For each de-duplicated trace id on the page, `queryTraceRaw` fetches the full span tree (concurrent).
 * The list row can then show span count + services (via traceCpt `transformTraceData`), just like Jaeger.
 * The per-page fan-out is bounded by `page_size` (default 20), so it never regresses to the old
 * "one-shot 2000 traces" behaviour.
 */
export async function searchSkyWalkingTracesPaged(params: TraceSearchParams): Promise<TracePageResult> {
  const pageSize = params.page_size || 20;
  const pageNum = params.page_num || 1;
  const condition = buildBasicTraceCondition(params, pageNum, pageSize);

  const data = await graphqlRequest(
    params.data_source_id,
    `
      query ($condition: TraceQueryCondition!) {
        queryBasicTraces(condition: $condition) {
          traces {
            segmentId
            endpointNames
            duration
            start
            isError
            traceIds
          }
        }
      }
    `,
    { condition },
  );

  const rawBriefs: SwBasicTrace[] = data?.queryBasicTraces?.traces || [];
  const briefs = params.operation ? rawBriefs.filter((b) => (b.endpointNames || []).includes(params.operation as string)) : rawBriefs;

  // Preserve the backend ordering while de-duplicating trace ids across segments.
  const traceIds = _.uniq(briefs.flatMap((b) => b.traceIds || []).filter(Boolean));

  const results = await Promise.all(
    traceIds.map(async (traceId) => {
      try {
        return await queryTraceRaw(params.data_source_id, traceId);
      } catch {
        // A single trace failing must not fail the whole page.
        return null;
      }
    }),
  );

  // A full raw page suggests more may exist; a short page means we've reached the end.
  // (Base this on the unfiltered page length, since the operation filter is applied client-side.)
  return { traces: results.filter(Boolean) as TraceResponse[], hasMore: rawBriefs.length >= pageSize };
}
