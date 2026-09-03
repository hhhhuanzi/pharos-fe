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
 * 全局探索页环境下拉的固定三档，与采集侧 `deployment.environment.name` 取值一致。
 * 不从服务目录动态枚举：那条路失败时下拉会只剩「全部」，而产品也不支持跨环境一次查。
 */
export const TRACE_ENV_OPTIONS = ['test', 'pre', 'prod'] as const;
export type TraceEnvOption = (typeof TRACE_ENV_OPTIONS)[number];

/** 现网主数据在 test；URL / initEnv 对不上三档时用这个，不要默认为空再查全环境。 */
export const TRACE_DEFAULT_ENV: TraceEnvOption = 'test';

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

export function isTraceEnvOption(env: string): env is TraceEnvOption {
  return (TRACE_ENV_OPTIONS as readonly string[]).includes(env);
}

/**
 * 全局探索页必须带一个环境。优先用 URL / `initEnv` 里能对上三档的值，否则 `test`。
 * 详情页锁定态不走这里，仍只读 `identity.env`。
 */
export function resolveExplorerEnv(env?: string): TraceEnvOption {
  const normalized = normalizeTraceEnv(env);
  return isTraceEnvOption(normalized) ? normalized : TRACE_DEFAULT_ENV;
}
