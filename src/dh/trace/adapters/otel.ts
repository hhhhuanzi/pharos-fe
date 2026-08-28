/**
 * OpenTelemetry adapter placeholder.
 * Short-term: not implemented. Keep the surface so Trace UI can switch cate later
 * (e.g. Tempo / Jaeger-OTLP backends) without rewriting call sites.
 */
import { TraceByIdParams, TraceSearchParams, UnifiedServiceOption } from '../types';

function notReady(feature: string): never {
  throw new Error(`OpenTelemetry adapter is not implemented yet (${feature}). Use SkyWalking or Jaeger for now.`);
}

export async function getOtelServices(_dataSourceId: number): Promise<UnifiedServiceOption[]> {
  return notReady('getServices');
}

export async function getOtelOperations(_dataSourceId: number, _service: string): Promise<string[]> {
  return notReady('getOperations');
}

export async function searchOtelTraces(_params: TraceSearchParams) {
  return notReady('searchTraces');
}

/** Not wired into `getTraceByID`: trace detail requires a backend endpoint that does the team check. */
export async function getOtelTraceById(_params: TraceByIdParams) {
  return notReady('getTraceById');
}
