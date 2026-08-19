import type { TraceKeyValuePair, TraceSpanData } from '@/pages/traceCpt/type';

/** HTTP method tags (OTel semconv + older Jaeger). */
export const HTTP_METHOD_KEYS = ['http.method', 'http.request.method'] as const;
/** Path / URL tags. Prefer route/path over a full URL. */
const HTTP_PATH_KEYS = ['http.route', 'http.target', 'url.path', 'http.path', 'url', 'http.url', 'url.full'] as const;
export const HTTP_STATUS_KEYS = ['http.status_code', 'http.response.status_code'] as const;
/** OTel `db.system` / older Jaeger+SkyWalking `db.type`. */
export const DB_SYSTEM_KEYS = ['db.system', 'db.type'] as const;
export const RPC_SYSTEM_KEYS = ['rpc.system'] as const;
/** OTel `messaging.system` (rabbitmq / kafka / …). */
export const MESSAGING_SYSTEM_KEYS = ['messaging.system'] as const;
const SQL_KEYS = ['db.statement', 'db.query.text', 'sql'] as const;

/** First non-empty tag among `keys`. Idempotent; does not mutate `tags`. */
export function tagValue(tags: TraceKeyValuePair[] | undefined, keys: readonly string[]): string {
  if (!tags || tags.length === 0) return '';
  for (const key of keys) {
    const hit = tags.find((tag) => tag.key === key);
    if (hit == null || hit.value == null || hit.value === '') continue;
    const text = String(hit.value).trim();
    if (text) return text;
  }
  return '';
}

function extractPath(raw: string): string {
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      return `${url.pathname}${url.search}`;
    } catch {
      return raw;
    }
  }
  return raw;
}

/**
 * List "接口名称": method + path, plus SQL when present. Falls back to `operationName`
 * when none of those tags exist (Jaeger summaries only have the operation name).
 */
export function resolveRootInterface(span: Pick<TraceSpanData, 'operationName' | 'tags'> | undefined): string {
  if (!span) return '';
  const method = tagValue(span.tags, HTTP_METHOD_KEYS);
  const rawPath = tagValue(span.tags, HTTP_PATH_KEYS);
  const path = rawPath ? extractPath(rawPath) : '';
  const sql = tagValue(span.tags, SQL_KEYS);
  const methodPath = [method, path].filter(Boolean).join(' ');

  if (methodPath && sql) return `${methodPath} ${sql}`;
  if (methodPath) return methodPath;
  if (sql) return sql;
  return span.operationName || '';
}
