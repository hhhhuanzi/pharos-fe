import { TRACE_ID_MAX_LENGTH, TRACE_ID_MIN_LENGTH, TRACE_ID_PLACEHOLDER_VALUES } from './constants';

/** 去掉大小写与 `_` `-` `.` 差异，让 trace_id / traceId / traceID / trace.id 归一到同一个 key */
function normalizeFieldName(name: string): string {
  return name.toLowerCase().replace(/[._-]/g, '');
}

/**
 * 字段名是否命中链路 ID。
 * 同时比较完整字段名与最后一段，前者覆盖 `trace.id`，后者覆盖 `attributes.trace_id` 这类带前缀的写法。
 */
export function isTraceIdField(name: string, candidates: string[]): boolean {
  if (!name) return false;
  const normalizedCandidates = candidates.map(normalizeFieldName);
  const segments = name.split('.');
  const lastSegment = segments[segments.length - 1];
  return normalizedCandidates.includes(normalizeFieldName(name)) || normalizedCandidates.includes(normalizeFieldName(lastSegment));
}

/** 返回可用于查询的链路 ID；字段缺失、为空、是占位值或长度异常时返回 null，调用方据此不渲染入口 */
export function normalizeTraceIdValue(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const traceId = String(value).trim();
  if (!traceId) return null;
  if (TRACE_ID_PLACEHOLDER_VALUES.includes(traceId.toLowerCase())) return null;
  if (/\s/.test(traceId)) return null;
  if (traceId.length < TRACE_ID_MIN_LENGTH || traceId.length > TRACE_ID_MAX_LENGTH) return null;
  // 全 0 是 OTel 里「没有有效 trace」的表示
  if (/^0+$/.test(traceId)) return null;
  return traceId;
}
