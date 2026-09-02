/**
 * 链路查询的环境维度口径，与后端 `pkg/dh/tracefetch/env.go` 一一对应。
 *
 * 分工：前端只把归一化后的 `env` 作为查询参数发给 `/dh/trace-summaries` / `/dh/trace-search`，
 * 由后端折成 `query.attributes`。属性名常量放在这里是为了让两侧口径可比对、可在测试里钉死 ——
 * 属性名写飘的后果是「静默返回 0 条」而不是报错，所以不能靠运行时发现。
 */

/**
 * 环境维度的 OTel resource 属性名。
 *
 * 用 semconv 1.27+ 的 `deployment.environment.name`，不是已废弃的 `deployment.environment`：
 * 上报侧注入的就是这个键（pharos-ops `k8s/otel-app/20-instrumentation.yaml`）。它是 resource 级
 * 属性，所以每个 span 都带。
 *
 * 键名里的点号是字面量：Jaeger 的 ES 存储没有开 `--es.tags-as-fields`，tag key 原样落库。
 *
 * 后端对应 `tracefetch.EnvAttributeKey`。
 */
export const TRACE_ENV_ATTRIBUTE_KEY = 'deployment.environment.name';

/**
 * 归一化环境取值：上报侧写的是小写（`test` / `pre` / `prod`），而 URL 参数里可能带空白或大小写
 * 差异，收窄查询前先对齐，避免「值看着对但查不到」。
 *
 * 后端对应 `tracefetch.NormalizeEnv`。
 */
export function normalizeTraceEnv(env?: string): string {
  return (env || '').trim().toLowerCase();
}

/** 环境过滤是否生效。空值走软降级：不加过滤条件，跨环境结果照常返回。 */
export function hasTraceEnvFilter(env?: string): boolean {
  return normalizeTraceEnv(env) !== '';
}
