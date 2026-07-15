/**
 * Shared trace query types. Adapters (skywalking / otel / jaeger) map backend
 * responses directly into the Jaeger `TraceResponse` consumed by traceCpt UI.
 */

export type TracePluginType = 'jaeger' | 'skywalking' | 'otel';

export interface UnifiedKeyValue {
  key: string;
  value: string;
}

export interface UnifiedServiceOption {
  /** Display name */
  label: string;
  /** Value used in subsequent queries (Jaeger: name; SkyWalking: service id) */
  value: string;
}

export interface TraceSearchParams {
  data_source_id: number;
  plugin_type: TracePluginType;
  service: string;
  operation?: string;
  start_time_min: number;
  start_time_max: number;
  attributes?: Record<string, string> | null;
  duration_max?: string;
  duration_min?: string;
  num_traces?: number;
}

export interface TraceByIdParams {
  data_source_id: number;
  plugin_type: TracePluginType;
  traceID: string;
}
