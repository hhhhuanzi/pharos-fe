import { LOG_EXPLORER_PATH, TRACE_EXPLORER_PATH } from '@/dh/logTrace/constants';

export const SERVICE_PAGE_PATH = '/service';

/** Jaeger process / OTel resource keys used when jumping to traces as logfmt tags. */
export const TRACE_CLUSTER_TAG = 'k8s.cluster.name';
export const TRACE_NAMESPACE_TAG = 'k8s.namespace.name';

/**
 * ES query_string fields for service → logs. `service.name` matches the OTel resource
 * attribute already used in the log fields sidebar tests; k8s keys follow the same convention.
 * Not CMDB — if the index uses different names the query will simply return empty.
 */
export const LOG_SERVICE_FIELD = 'service.name';
export const LOG_CLUSTER_FIELD = 'k8s.cluster.name';
export const LOG_NAMESPACE_FIELD = 'k8s.namespace.name';

export { LOG_EXPLORER_PATH, TRACE_EXPLORER_PATH };

/**
 * Prometheus label aliases for cluster / namespace on `traces_service_graph_*`.
 * OTel → Prom exporters usually turn dots into underscores.
 */
export const CLUSTER_LABEL_KEYS = ['k8s_cluster_name', 'k8s_cluster', 'cluster', 'k8s.cluster.name'] as const;
export const NAMESPACE_LABEL_KEYS = ['k8s_namespace_name', 'k8s_namespace', 'namespace', 'k8s.namespace.name'] as const;

/**
 * Language labels that already appear on traces / Prom (OTel resource → Prom underscores).
 * Do not invent a store; missing labels stay empty.
 */
export const LANGUAGE_LABEL_KEYS = [
  'telemetry_sdk_language',
  'telemetry.sdk.language',
  'telemetry_sdk_language_name',
  'process_runtime_name',
  'process.runtime.name',
  'language',
] as const;

export const TOP_N_OPTIONS = [5, 10, 20] as const;
export const DEFAULT_TOP_N = 10;
