import type { TraceKeyValuePair } from '@/pages/traceCpt/type';
import { resolveSpanKind, type SpanKindIcon } from './spanSemantics';
import { DB_SYSTEM_KEYS, tagValue } from './summaryFields';

/**
 * Short tokens for the list "类型" column. Display labels (WEB / SQL / …) live in locale
 * and are the same string in every language.
 *
 * Trace type is the semantics of the span that actually did the work — not the Java
 * method name of the root. List and waterfall share `resolveTraceKind` / `resolveFromOperation`.
 *
 * List `PharosTraceSummary.rootType` is filled by `resolveTraceKind` at contract mapping
 * (span tags, then protocol verbs). MQ needs `messaging.system` or a messaging `span.kind`.
 * Do not guess MQ from a bare `process` / `consume` name.
 */
export type TraceListType = 'web' | 'sql' | 'redis' | 'cache' | 'mq' | 'rpc' | 'nacos' | 'internal' | '';

export interface TraceKindSpan {
  tags?: TraceKeyValuePair[];
  operationName?: string;
  spanID?: string;
  startTime?: number;
  references?: Array<{ spanID: string }>;
}

const REDIS_SYSTEMS = new Set(['redis', 'keydb', 'valkey']);
const HTTP_METHODS = 'GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS';
const HTTP_WITH_PATH = new RegExp(`^(${HTTP_METHODS})\\s+/`, 'i');
const HTTP_PREFIX = new RegExp(`^HTTP\\s+(${HTTP_METHODS})\\b`, 'i');
const HTTP_SW_COLON = new RegExp(`^(${HTTP_METHODS}):/`, 'i');
const HTTP_SW_BRACE = new RegExp(`^\\{(${HTTP_METHODS})\\}/`, 'i');
/** Bare HTTP verbs, including GET. Redis GET-as-root is rare; user confirmed these are HTTP. */
const BARE_HTTP = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/i;
const SQL_PREFIX = /^(SELECT|INSERT|UPDATE|CREATE|ALTER|DROP|WITH|SHOW|EXPLAIN)\b/i;
/** `DELETE FROM t` / `DELETE t` → SQL; bare `DELETE` and `DELETE /path` are HTTP (checked first). */
const SQL_DELETE = /^DELETE\s+(FROM\b|[^\s/])/i;
const REDIS_COMMANDS = new Set([
  'PING',
  'INFO',
  'SET',
  'MSET',
  'SETEX',
  'SETNX',
  'GETSET',
  'HGET',
  'HSET',
  'HMGET',
  'HGETALL',
  'HDEL',
  'HEXISTS',
  'DEL',
  'UNLINK',
  'EXISTS',
  'EXPIRE',
  'TTL',
  'INCR',
  'DECR',
  'LPUSH',
  'RPUSH',
  'LPOP',
  'RPOP',
  'LRANGE',
  'SADD',
  'SMEMBERS',
  'ZADD',
  'ZRANGE',
  'PUBLISH',
  'SUBSCRIBE',
]);

/**
 * Generated / synthetic frames (Java lambda, CGLIB, JDK proxy, Kotlin lambda).
 * Structural patterns only — do not match product or Spring class names.
 */
const INTERNAL_FRAME = /\$\$Lambda(?:\$|\b)|\$\$[A-Za-z][\w]*\$\$|\$Proxy\d+|\$lambda\$/;

function listTypeFromKind(kind: SpanKindIcon, tags: TraceKeyValuePair[] | undefined): TraceListType {
  if (kind === 'nacos') return 'nacos';
  if (kind === 'web') return 'web';
  if (kind === 'db') return 'sql';
  if (kind === 'cache') {
    const system = tagValue(tags, DB_SYSTEM_KEYS).toLowerCase();
    if (REDIS_SYSTEMS.has(system)) return 'redis';
    return 'cache';
  }
  if (kind === 'messaging') return 'mq';
  if (kind === 'rpc') return 'rpc';
  return '';
}

export function listTypeToSpanKind(type: TraceListType): SpanKindIcon {
  if (type === 'web') return 'web';
  if (type === 'sql') return 'db';
  if (type === 'redis' || type === 'cache') return 'cache';
  if (type === 'mq') return 'messaging';
  if (type === 'rpc') return 'rpc';
  if (type === 'nacos') return 'nacos';
  return 'internal';
}

export function isInternalFrame(operationName?: string): boolean {
  if (!operationName) return false;
  return INTERNAL_FRAME.test(operationName);
}

function typeFromTags(tags: TraceKeyValuePair[] | undefined): TraceListType {
  return listTypeFromKind(resolveSpanKind(tags), tags);
}

function findRootSpan<T extends TraceKindSpan>(spans: T[]): T | undefined {
  if (spans.length === 0) return undefined;
  const ids = new Set(spans.map((span) => span.spanID).filter((id): id is string => Boolean(id)));
  if (ids.size === 0) return spans[0];
  let root: T | undefined;
  spans.forEach((span) => {
    const hasInternalParent = (span.references || []).some((ref) => ids.has(ref.spanID));
    if (hasInternalParent) return;
    if (!root || (span.startTime ?? 0) < (root.startTime ?? 0)) root = span;
  });
  return root ?? spans[0];
}

/**
 * Protocol-verb heuristic when there are no semantic tags.
 * Used by Jaeger lightweight summaries (`rootOperationName` only) and as a waterfall fallback.
 *
 * HTTP verbs (including bare `GET`) → web; SQL verbs → sql; Redis commands (not GET) → redis.
 * Generated frames are not protocol verbs — they stay empty here (`resolveTraceKind` marks them Internal).
 * Bare `process` / `consume` are not MQ (those need messaging tags on the detail / get-by-id path).
 */
export function resolveFromOperation(operationName?: string): TraceListType {
  if (!operationName) return '';
  const name = operationName.trim();
  if (!name) return '';
  if (HTTP_WITH_PATH.test(name) || HTTP_PREFIX.test(name) || HTTP_SW_COLON.test(name) || HTTP_SW_BRACE.test(name)) return 'web';
  if (BARE_HTTP.test(name)) return 'web';
  if (SQL_PREFIX.test(name) || SQL_DELETE.test(name)) return 'sql';
  const command = name.split(/\s+/)[0].toUpperCase();
  if (REDIS_COMMANDS.has(command)) return 'redis';
  return '';
}

/** @deprecated Use `resolveFromOperation`. */
export const inferListTypeFromOperation = resolveFromOperation;

/**
 * Per-span kind for a waterfall row: tags first (same as `resolveSpanKind`), then protocol verbs.
 */
export function resolveDisplayedSpanKind(tags: TraceKeyValuePair[] | undefined, operationName?: string): SpanKindIcon {
  const fromTags = resolveSpanKind(tags);
  if (fromTags !== 'internal') return fromTags;
  return listTypeToSpanKind(resolveFromOperation(operationName));
}

/**
 * Trace-level type. Scans every span (not just root).
 *
 * 1. Tags on any span (root first, then others by start time) — db / redis / http / mq / rpc;
 *    Nacos is a URL / port / thread pattern; MQ is `messaging.system` / messaging span.kind.
 * 2. Root is only an internal frame (`$$Lambda` / generated) → children's type (tags already
 *    covered above; this step uses child operation verbs, or `internal` when the list has no children).
 * 3. Root operation protocol verbs (bare GET → WEB).
 */
export function resolveTraceKind(spans: TraceKindSpan[] | undefined): TraceListType {
  if (!spans || spans.length === 0) return '';
  const root = findRootSpan(spans) ?? spans[0];
  const rest = spans
    .filter((span) => span !== root)
    .slice()
    .sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));
  const ordered = [root, ...rest];

  for (const span of ordered) {
    const fromTags = typeFromTags(span.tags);
    if (fromTags) return fromTags;
  }

  if (isInternalFrame(root.operationName)) {
    for (const span of rest) {
      const fromOp = resolveFromOperation(span.operationName);
      if (fromOp) return fromOp;
    }
    return 'internal';
  }

  return resolveFromOperation(root.operationName);
}

/**
 * Single-span convenience (Jaeger summaries: empty tags + root operation name).
 * Full traces should call `resolveTraceKind(spans)` so children can contribute.
 */
export function resolveRootType(tags: TraceKeyValuePair[] | undefined, operationName?: string): TraceListType {
  return resolveTraceKind([{ tags, operationName: operationName || '' }]);
}
