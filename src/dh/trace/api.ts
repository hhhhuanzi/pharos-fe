import { TraceByIdParams, TracePluginType, TraceSearchParams, UnifiedServiceOption } from './types';
import * as jaeger from './adapters/jaeger';
import * as skywalking from './adapters/skywalking';
import * as otel from './adapters/otel';

export type { TracePluginType, TraceSearchParams, TraceByIdParams, UnifiedServiceOption };

/** Visible cate options in Trace explorer (OTel reserved for later). */
export const TRACING_PLUGIN_TYPES: Array<{ label: string; value: TracePluginType }> = [
  { label: 'Jaeger', value: 'jaeger' },
  { label: 'SkyWalking', value: 'skywalking' },
];

export async function getTraceServices(
  pluginType: TracePluginType,
  dataSourceId: number,
  range?: { start: number; end: number },
): Promise<UnifiedServiceOption[]> {
  if (pluginType === 'skywalking') {
    const end = range?.end ?? Date.now();
    const start = range?.start ?? end - 12 * 60 * 60 * 1000;
    // Select value already carries the SW service id, so no extra id field is needed.
    return skywalking.getSkyWalkingServices(dataSourceId, start, end);
  }
  if (pluginType === 'otel') {
    return otel.getOtelServices(dataSourceId);
  }
  return jaeger.getJaegerServices(dataSourceId);
}

export async function getTraceOperations(
  pluginType: TracePluginType,
  dataSourceId: number,
  service: string,
  range?: { start: number; end: number },
): Promise<string[]> {
  if (pluginType === 'skywalking') {
    // `service` is already the SW service id (Select value).
    return skywalking.getSkyWalkingOperations(dataSourceId, service);
  }
  if (pluginType === 'otel') {
    return otel.getOtelOperations(dataSourceId, service);
  }
  return jaeger.getJaegerOperations(dataSourceId, service);
}

/** Instance-level query is only meaningful where the backend can filter traces by instance (currently SkyWalking). Others return []. */
export async function getTraceInstances(
  pluginType: TracePluginType,
  dataSourceId: number,
  service: string,
  range?: { start: number; end: number },
): Promise<UnifiedServiceOption[]> {
  if (pluginType === 'skywalking' && service) {
    const end = range?.end ?? Date.now();
    const start = range?.start ?? end - 12 * 60 * 60 * 1000;
    return skywalking.getSkyWalkingInstances(dataSourceId, service, start, end);
  }
  return [];
}

export async function searchTraces(params: TraceSearchParams) {
  if (params.plugin_type === 'skywalking') {
    return skywalking.searchSkyWalkingTraces(params);
  }
  if (params.plugin_type === 'otel') {
    return otel.searchOtelTraces(params);
  }
  return jaeger.searchJaegerTraces(params);
}

export async function getTraceByID(params: TraceByIdParams) {
  if (params.plugin_type === 'skywalking') {
    return skywalking.getSkyWalkingTraceById(params);
  }
  if (params.plugin_type === 'otel') {
    return otel.getOtelTraceById(params);
  }
  return jaeger.getJaegerTraceById(params);
}

export async function getTraceDependencies(pluginType: TracePluginType, dataSourceId: number) {
  if (pluginType === 'jaeger') {
    return jaeger.getJaegerDependencies(dataSourceId);
  }
  return [];
}
