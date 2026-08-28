/**
 * Trace 读取的失败分类：决定页面给用户看哪条提示。
 *
 * - 403：`/dh/trace/:trace_id` 判定这条 trace 涉及的服务与我的团队没有交集；`/dh/trace-summaries`
 *   与 `/dh/trace-search` 判定 service 参数对我不可见。判权接口用 silence 请求，全局 errorHandler
 *   会把带 status 的原始错误对象透传给调用方。
 * - unsupported：该数据源类型的详情还没有接入判权，只能经 `/proxy` 直连读全量 span，所以这条
 *   路径直接关死而不是放行。
 * - service-required：列表与富化的判权就是「service 参数对我可见吗」，不带 service 的查询判不了
 *   权。这是 fail closed，不是放行全量。
 */

/** 用标记字段而不是 instanceof 判定：错误对象会穿过 umi-request 与多层转译，原型链不保证还在。 */
const UNSUPPORTED_MARKER = 'dh-trace-detail-unsupported';
const SERVICE_REQUIRED_MARKER = 'dh-trace-service-required';

export class TraceDetailUnsupportedError extends Error {
  readonly dhTraceError = UNSUPPORTED_MARKER;
  readonly pluginType: string;

  constructor(pluginType: string) {
    super(`Trace detail is not available for datasource type "${pluginType}"`);
    this.name = 'TraceDetailUnsupportedError';
    this.pluginType = pluginType;
  }
}

export class TraceServiceRequiredError extends Error {
  readonly dhTraceError = SERVICE_REQUIRED_MARKER;

  constructor() {
    super('Trace search requires a service: it is authorized by the service parameter');
    this.name = 'TraceServiceRequiredError';
  }
}

export function isTraceForbidden(error: unknown): boolean {
  if (error == null || typeof error !== 'object') return false;
  return (error as { status?: unknown }).status === 403;
}

export function isTraceUnsupported(error: unknown): boolean {
  if (error == null || typeof error !== 'object') return false;
  return (error as { dhTraceError?: unknown }).dhTraceError === UNSUPPORTED_MARKER;
}

export function isTraceServiceRequired(error: unknown): boolean {
  if (error == null || typeof error !== 'object') return false;
  return (error as { dhTraceError?: unknown }).dhTraceError === SERVICE_REQUIRED_MARKER;
}
