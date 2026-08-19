import type { TraceKeyValuePair } from '@/pages/traceCpt/type';
import { DB_SYSTEM_KEYS, HTTP_METHOD_KEYS, HTTP_STATUS_KEYS, MESSAGING_SYSTEM_KEYS, RPC_SYSTEM_KEYS, tagValue } from './summaryFields';

/**
 * Visual kind for a waterfall row icon.
 * Jaeger `span-icons.ts` namespaces: db.* / http.* / messaging.* / rpc.* (lower index wins).
 * Cache is a db refinement so redis/memcached are not shown as a generic cylinder.
 * Nacos is an HTTP refinement (config/naming long-poll) so it is not shown as generic WEB.
 */
export type SpanKindIcon = 'web' | 'db' | 'cache' | 'messaging' | 'rpc' | 'nacos' | 'internal';

export type SpanPillTone = 'default' | 'error';

export interface SpanPill {
  key: 'http.method' | 'http.status_code' | 'db.system' | 'rpc.system' | 'messaging.system' | 'nacos';
  value: string;
  tone: SpanPillTone;
}

const CACHE_SYSTEMS = new Set(['redis', 'memcached', 'memcache', 'cache', 'keydb', 'valkey']);
const MESSAGING_SPAN_KINDS = new Set(['consumer', 'producer']);
const NACOS_URL_KEYS = ['url.full', 'http.url', 'http.target', 'url.path', 'http.path', 'url'] as const;

function hasNamespace(tags: TraceKeyValuePair[] | undefined, ns: string): boolean {
  if (!tags || tags.length === 0) return false;
  const prefix = `${ns}.`;
  return tags.some((tag) => typeof tag.key === 'string' && (tag.key === ns || tag.key.startsWith(prefix)));
}

function skyWalkingLayer(tags: TraceKeyValuePair[] | undefined): string {
  return tagValue(tags, ['layer']).trim().toUpperCase();
}

function hasHttpEvidence(tags: TraceKeyValuePair[] | undefined): boolean {
  return Boolean(hasNamespace(tags, 'http') || tagValue(tags, HTTP_METHOD_KEYS) || tagValue(tags, HTTP_STATUS_KEYS) || hasHttpUrl(tags));
}

/** `url.full` / `http.url` with an http(s) scheme — peer URL, not an operation-name whitelist. */
function hasHttpUrl(tags: TraceKeyValuePair[] | undefined): boolean {
  const url = tagValue(tags, NACOS_URL_KEYS);
  return /^https?:\/\//i.test(url);
}

function hasNacosInPath(pathname: string): boolean {
  const path = pathname.toLowerCase();
  return path.includes('/nacos/') || /\/nacos(?:[/?#]|$)/.test(path);
}

/** On host:8848, Nacos OpenAPI may omit the `/nacos` context path. */
function isNacosPathOnDefaultPort(pathname: string): boolean {
  return hasNacosInPath(pathname) || /^\/v1\/(cs|ns|auth)(?:\/|$)/i.test(pathname);
}

function isNacosUrl(raw: string): boolean {
  const text = raw.trim();
  if (!text) return false;
  const lower = text.toLowerCase();
  if (hasNacosInPath(lower)) return true;

  if (/^https?:\/\//i.test(text)) {
    try {
      const url = new URL(text);
      const port = url.port || (url.protocol === 'https:' ? '443' : '80');
      if (port === '8848' && isNacosPathOnDefaultPort(url.pathname)) return true;
    } catch {
      return /:8848\b/.test(lower) && lower.includes('nacos');
    }
  }
  return /:8848\b/.test(lower) && lower.includes('nacos');
}

/**
 * Nacos client spans (config long-poll, naming, …). Checked before generic HTTP so
 * `http.request.method` + `url.full=…/nacos/…` is not labelled WEB.
 */
export function isNacosSpan(tags: TraceKeyValuePair[] | undefined): boolean {
  if (!tags || tags.length === 0) return false;
  const url = tagValue(tags, NACOS_URL_KEYS);
  if (url && isNacosUrl(url)) return true;
  if (/nacos/i.test(tagValue(tags, ['thread.name']))) return true;
  if (tagValue(tags, ['server.port']) === '8848' && hasHttpEvidence(tags)) return true;
  return false;
}

/**
 * OTel messaging span. `messaging.system` with a value is enough (rabbitmq / kafka / …).
 * `span.kind` consumer/producer only counts when a `messaging.*` tag is also present.
 * Do not infer MQ from a bare operation name (`process` / `consume`) — that lives in listType.
 */
export function isMessagingSpan(tags: TraceKeyValuePair[] | undefined): boolean {
  if (!tags || tags.length === 0) return false;
  if (tagValue(tags, MESSAGING_SYSTEM_KEYS)) return true;
  if (skyWalkingLayer(tags) === 'MQ') return true;
  const kind = tagValue(tags, ['span.kind']).toLowerCase();
  return MESSAGING_SPAN_KINDS.has(kind) && hasNamespace(tags, 'messaging');
}

/**
 * Icon kind for one span. Idempotent; does not mutate `tags`.
 * Priority: cache (db.system / layer) → db → nacos → http → messaging → rpc → internal.
 */
export function resolveSpanKind(tags: TraceKeyValuePair[] | undefined): SpanKindIcon {
  const dbSystem = tagValue(tags, DB_SYSTEM_KEYS).toLowerCase();
  if (dbSystem && CACHE_SYSTEMS.has(dbSystem)) return 'cache';

  const layer = skyWalkingLayer(tags);
  if (layer === 'CACHE') return 'cache';

  if (hasNamespace(tags, 'db') || layer === 'DATABASE') return 'db';
  if (isNacosSpan(tags)) return 'nacos';
  if (hasNamespace(tags, 'http') || layer === 'HTTP') return 'web';
  if (isMessagingSpan(tags)) return 'messaging';
  if (hasNamespace(tags, 'rpc') || layer === 'RPC' || layer === 'RPCFRAMEWORK') return 'rpc';

  if (tagValue(tags, HTTP_METHOD_KEYS) || tagValue(tags, HTTP_STATUS_KEYS) || hasHttpUrl(tags)) return 'web';

  return 'internal';
}

function statusTone(raw: string): SpanPillTone {
  const code = Number(raw);
  if (Number.isFinite(code) && code >= 400) return 'error';
  return 'default';
}

/**
 * Row pills (Jaeger `spanPills.ts` sources). Empty values are omitted — no placeholder pills.
 * Order: method → status → db.system → messaging.system → rpc.system → nacos.
 * Idempotent; does not mutate `tags`.
 */
export function resolveSpanPills(tags: TraceKeyValuePair[] | undefined): SpanPill[] {
  const pills: SpanPill[] = [];

  const method = tagValue(tags, HTTP_METHOD_KEYS);
  if (method) pills.push({ key: 'http.method', value: method, tone: 'default' });

  const status = tagValue(tags, HTTP_STATUS_KEYS);
  if (status) pills.push({ key: 'http.status_code', value: status, tone: statusTone(status) });

  const dbSystem = tagValue(tags, DB_SYSTEM_KEYS);
  if (dbSystem) pills.push({ key: 'db.system', value: dbSystem, tone: 'default' });

  const messagingSystem = tagValue(tags, MESSAGING_SYSTEM_KEYS);
  if (messagingSystem) pills.push({ key: 'messaging.system', value: messagingSystem, tone: 'default' });

  const rpcSystem = tagValue(tags, RPC_SYSTEM_KEYS);
  if (rpcSystem) pills.push({ key: 'rpc.system', value: rpcSystem, tone: 'default' });

  if (isNacosSpan(tags)) pills.push({ key: 'nacos', value: 'Nacos', tone: 'default' });

  return pills;
}
