import { LOG_EXPLORER_PATH, TRACE_EXPLORER_PATH } from '@/dh/logTrace/constants';

export const SERVICE_PAGE_PATH = '/service';

/** Jaeger process / OTel resource keys used when jumping to traces as logfmt tags. */
export const TRACE_CLUSTER_TAG = 'k8s.cluster.name';
export const TRACE_NAMESPACE_TAG = 'k8s.namespace.name';

/**
 * Fluent Bit kubernetes filter fields actually ingested into ES (see PLAN-log-index-layout /
 * DESIGN-log-trace-correlation). `service.name` is an OTel resource key and is not on the log
 * documents; service dimension is `kubernetes.container_name` (= service name).
 */
export const LOG_SERVICE_FIELD = 'kubernetes.container_name';
export const LOG_CLUSTER_FIELD = 'cluster';
export const LOG_NAMESPACE_FIELD = 'kubernetes.namespace_name';

export { LOG_EXPLORER_PATH, TRACE_EXPLORER_PATH };

/**
 * Prometheus label aliases for cluster / namespace / environment on spanmetrics series.
 * OTel → Prom exporters usually turn dots into underscores.
 *
 * The OTel dimension names come first because the bare `cluster` / `namespace` on these series are
 * the scraping Prometheus's own labels (`k8s-devops` / `opentelemetry`), not the service's. No
 * `server_`-prefixed key is listed: those only exist on `traces_service_graph_*`, which node-level
 * RED no longer reads.
 */
export const CLUSTER_LABEL_KEYS = ['k8s_cluster_name', 'k8s_cluster', 'cluster', 'k8s.cluster.name'] as const;
export const NAMESPACE_LABEL_KEYS = ['k8s_namespace_name', 'k8s_namespace', 'namespace', 'k8s.namespace.name'] as const;

/** `deployment.environment.name` is a declared spanmetrics connector dimension, so RED rows carry it. */
export const ENV_LABEL_KEYS = ['deployment_environment_name', 'deployment_environment', 'deployment.environment.name'] as const;

/**
 * `sum by (...)` needs one concrete label name. Grouping by a label the series does not have
 * yields an empty value instead of an error, so adding it is safe on setups without it.
 */
export const ENV_GROUP_LABEL = 'deployment_environment_name';

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
