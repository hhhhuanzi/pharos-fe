import type { TraceKeyValuePair, TraceSpanData } from '@/pages/traceCpt/type';

/** HTTP method tags (OTel semconv + older Jaeger). */
const HTTP_METHOD_KEYS = ['http.method', 'http.request.method'] as const;
/** Path / URL tags. Prefer route/path over a full URL. */
const HTTP_PATH_KEYS = ['http.route', 'http.target', 'url.path', 'http.path', 'url', 'http.url', 'url.full'] as const;
const HTTP_HINT_KEYS = ['http.scheme', 'http.status_code', 'http.response.status_code'] as const;
/** OTel `db.system` / older Jaeger+SkyWalking `db.type`. */
const DB_SYSTEM_KEYS = ['db.system', 'db.type'] as const;
const SQL_KEYS = ['db.statement', 'db.query.text', 'sql'] as const;

function tagValue(tags: TraceKeyValuePair[] | undefined, keys: readonly string[]): string {
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
 * SkyWalking `layer` is a protocol class (HTTP / Database / Cache / MQ / RPCFramework).
 * Map only the values that correspond to the short labels the table shows; unknown layers
 * stay as the raw lowercased field so we do not invent a type.
 */
function mapSkyWalkingLayer(layer: string): string {
  const normalized = layer.trim().toUpperCase();
  if (normalized === 'HTTP') return 'web';
  if (normalized === 'DATABASE') return 'database';
  if (normalized === 'CACHE') return 'cache';
  if (normalized === 'MQ') return 'mq';
  if (normalized === 'RPCFRAMEWORK' || normalized === 'RPC') return 'rpc';
  if (normalized === 'UNKNOWN' || normalized === 'UNRECOGNIZED' || normalized === '') return '';
  return layer.trim().toLowerCase();
}

/**
 * Short type label for the list row, taken from the root span only.
 * Priority: `db.system`/`db.type` → HTTP evidence (incl. SkyWalking `layer=HTTP`) → `component` → other layers.
 * `span.kind` is not a protocol (server/client) and is never used. Empty when nothing reliable exists.
 */
export function resolveRootType(tags: TraceKeyValuePair[] | undefined): string {
  const dbSystem = tagValue(tags, DB_SYSTEM_KEYS);
  if (dbSystem) return dbSystem.toLowerCase();

  const method = tagValue(tags, HTTP_METHOD_KEYS);
  const path = tagValue(tags, HTTP_PATH_KEYS);
  const httpHint = tagValue(tags, HTTP_HINT_KEYS);
  const layer = tagValue(tags, ['layer']);
  if (method || path || httpHint || layer.trim().toUpperCase() === 'HTTP') return 'web';

  const component = tagValue(tags, ['component']);
  if (component) return component.toLowerCase();

  if (layer) {
    const mapped = mapSkyWalkingLayer(layer);
    if (mapped) return mapped;
  }

  return '';
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
