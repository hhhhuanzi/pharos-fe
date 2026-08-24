import type { PharosServiceEdge } from '../contract';
import type { CuratedPeerFieldId, VirtualPeerAggregate } from './virtualPeer';
import { classifyNodeKind, nodeConnectionHint, type GraphNodeKind } from './layout';
import { mixedPeerSubtitle, uniquePeerFamily } from './peerAmbiguity';
import { unanimousSystemFromPorts } from './wellKnownPorts';

/** Visual family for the topology node glyph. `user` is the only person icon. */
export type PeerGlyph = 'service' | 'user' | 'db' | 'redis' | 'mq' | 'unknown';

export interface PeerTypeInfo {
  /** Canonical system token shown on virtual node cards (`clickhouse`, `redis`, `rabbitmq`, …). */
  label: string;
  glyph: PeerGlyph;
  /** Canonical system (`clickhouse`, `postgresql`, `redis`, `kafka`, …). Empty when unknown. */
  system: string;
  /** True when the graph name is a JDBC/SQL fallback (`other_sql`) rather than a real product. */
  generic: boolean;
}

const GENERIC_SQL_NAMES = new Set(['other_sql', 'sql']);

/** JDBC / SQL family — used to match `other_sql` spans that actually carry a concrete `db.system`. */
const SQL_FAMILY = new Set([
  'other_sql',
  'sql',
  'clickhouse',
  'mysql',
  'mariadb',
  'postgres',
  'postgresql',
  'oracle',
  'mssql',
  'h2',
  'hsqldb',
  'derby',
  'sqlite',
  'cockroachdb',
  'trino',
  'hive',
  'doris',
  'starrocks',
  'tidb',
  'oceanbase',
]);

const CACHE_SYSTEMS = new Set(['redis', 'keydb', 'valkey', 'memcached', 'memcache']);
const SEARCH_SYSTEMS = new Set(['elasticsearch', 'opensearch']);
const MONGO_SYSTEMS = new Set(['mongo', 'mongodb']);
const MESSAGING_SYSTEMS = new Set(['kafka', 'rabbitmq', 'rocketmq', 'pulsar', 'nats', 'activemq', 'jms', 'mqtt']);
const REDIS_DB_INDEX_KEY = 'db.redis.database_index';
/** Real destination / vhost / queue tags only — never invent a placeholder row. */
const MESSAGING_SUBTITLE_KEYS = [
  'messaging.destination.name',
  'messaging.destination',
  'messaging.rabbitmq.destination.vhost',
  'rabbitmq.vhost',
  'messaging.rabbitmq.destination.name',
  'messaging.rabbitmq.destination.routing_key',
  'rabbitmq.queue',
  'rabbitmq.routing_key',
  'amqp.queue',
  'amqp.exchange',
  'amqp.destination',
] as const;

const DISPLAY_LABEL: Record<string, string> = {
  mysql: 'mysql',
  mariadb: 'mysql',
  postgres: 'pgsql',
  postgresql: 'pgsql',
  clickhouse: 'ck',
  doris: 'doris',
  elasticsearch: 'es',
  opensearch: 'es',
  redis: 'redis',
  keydb: 'redis',
  valkey: 'redis',
  memcached: 'memcached',
  memcache: 'memcached',
  mongo: 'mongo',
  mongodb: 'mongo',
  kafka: 'kafka',
  rabbitmq: 'rabbitmq',
  rocketmq: 'rocketmq',
  pulsar: 'pulsar',
  nats: 'nats',
  mqtt: 'mqtt',
  activemq: 'activemq',
  oracle: 'oracle',
  mssql: 'mssql',
  zookeeper: 'zookeeper',
  cassandra: 'cassandra',
  etcd: 'etcd',
};

export function isGenericVirtualName(name: string): boolean {
  const token = name.trim().toLowerCase();
  return token === 'unknown' || isGenericSqlNodeName(token);
}

export function isGenericSqlNodeName(name: string): boolean {
  return GENERIC_SQL_NAMES.has(name.trim().toLowerCase());
}

export function isSqlFamilySystem(system: string): boolean {
  return SQL_FAMILY.has(system.trim().toLowerCase());
}

export function isMessagingSystemName(name: string): boolean {
  return MESSAGING_SYSTEMS.has(normalizePeerSystem(name));
}

export function normalizePeerSystem(raw: string): string {
  const system = raw.trim().toLowerCase();
  if (system === 'postgres') return 'postgresql';
  if (system === 'mariadb') return 'mysql';
  if (system === 'mongo') return 'mongodb';
  if (system === 'opensearch') return 'elasticsearch';
  if (system === 'keydb' || system === 'valkey') return 'redis';
  if (system === 'memcache') return 'memcached';
  if (system === 'sqlserver' || system === 'sql_server') return 'mssql';
  if (system === 'sql') return 'other_sql';
  return system;
}

export function displayPeerLabel(system: string): string {
  const normalized = normalizePeerSystem(system);
  if (!normalized) return '';
  return DISPLAY_LABEL[normalized] || DISPLAY_LABEL[system.trim().toLowerCase()] || normalized;
}

export function glyphForSystem(system: string): PeerGlyph {
  const normalized = normalizePeerSystem(system);
  if (!normalized) return 'unknown';
  if (CACHE_SYSTEMS.has(normalized) || CACHE_SYSTEMS.has(system.toLowerCase())) return 'redis';
  if (MESSAGING_SYSTEMS.has(normalized)) return 'mq';
  if (SEARCH_SYSTEMS.has(normalized) || SEARCH_SYSTEMS.has(system.toLowerCase()) || MONGO_SYSTEMS.has(normalized)) return 'db';
  if (isSqlFamilySystem(normalized) && normalized !== 'other_sql') return 'db';
  if (normalized === 'other_sql') return 'db';
  if (normalized === 'user') return 'user';
  return 'db';
}

function typeFromToken(token: string, fallbackGlyph: PeerGlyph, generic: boolean): PeerTypeInfo {
  const system = normalizePeerSystem(token);
  const label = displayPeerLabel(system) || token;
  let glyph = glyphForSystem(system);
  if (glyph === 'unknown' && fallbackGlyph !== 'unknown') glyph = fallbackGlyph;
  if (!system) glyph = fallbackGlyph;
  return { label, glyph, system, generic };
}

/**
 * Best-effort type from the graph node id / connection_type, before traces return.
 * Never uses the person icon except for synthetic `user`.
 */
export function peerTypeFromName(id: string, connectionHint: string): PeerTypeInfo {
  const name = id.trim().toLowerCase();
  if (name === 'user') return { label: id, glyph: 'user', system: 'user', generic: false };
  if (name === 'unknown') return { label: id, glyph: 'unknown', system: '', generic: false };
  if (isGenericSqlNodeName(name)) return { label: id, glyph: 'db', system: 'other_sql', generic: true };
  if (CACHE_SYSTEMS.has(name)) return typeFromToken(name, 'redis', false);
  if (MESSAGING_SYSTEMS.has(name)) return typeFromToken(name, 'mq', false);
  if (SEARCH_SYSTEMS.has(name) || MONGO_SYSTEMS.has(name) || isSqlFamilySystem(name)) {
    return typeFromToken(name, 'db', false);
  }
  if (connectionHint === 'database') return { label: id, glyph: 'db', system: '', generic: false };
  if (connectionHint === 'messaging_system') return { label: id, glyph: 'mq', system: '', generic: false };
  if (connectionHint === 'virtual_node') return { label: id, glyph: 'unknown', system: '', generic: false };
  return { label: id, glyph: 'service', system: '', generic: false };
}

export function inferPeerGlyph(id: string, kind: GraphNodeKind, connectionHint: string): PeerGlyph {
  if (kind !== 'virtual') return 'service';
  return peerTypeFromName(id, connectionHint).glyph;
}

function curatedValues(meta: Pick<VirtualPeerAggregate, 'curated'> | undefined, field: CuratedPeerFieldId): string[] {
  return meta?.curated.find((row) => row.id === field)?.values || [];
}

/** Prefer a concrete product over JDBC `other_sql`. */
export function dominantPeerSystem(meta: Pick<VirtualPeerAggregate, 'curated'> | undefined): string {
  const systems = curatedValues(meta, 'db_system').map((value) => normalizePeerSystem(value)).filter(Boolean);
  const concrete = systems.find((system) => system !== 'other_sql');
  return concrete || systems[0] || '';
}

export function messagingSystemFromMeta(meta: Pick<VirtualPeerAggregate, 'extraRows'> | undefined): string {
  const row = meta?.extraRows?.find((item) => item.key === 'messaging.system');
  const value = row?.values?.[0];
  return value ? normalizePeerSystem(value) : '';
}

export type VirtualGraphMeta = Pick<VirtualPeerAggregate, 'curated' | 'matchedSpans' | 'extraRows'> &
  Partial<Pick<VirtualPeerAggregate, 'instances'>>;

export interface NodeCaption {
  title: string;
  subtitle: string;
}

export function formatRedisDatabase(raw: string): string {
  const text = raw.trim();
  if (!text) return '';
  const prefixed = text.match(/^db(\d+)$/i);
  if (prefixed) return `db${prefixed[1]}`;
  if (/^\d+$/.test(text)) return `db${text}`;
  return '';
}

function isProductNodeName(id: string): boolean {
  const fromName = peerTypeFromName(id, '');
  return Boolean(fromName.system && fromName.system !== 'other_sql') || fromName.system === 'user';
}

function extraRowValues(meta: VirtualGraphMeta | undefined, key: string): string[] {
  return meta?.extraRows?.find((row) => row.key === key)?.values || [];
}

/**
 * Redis logical DB from traces only (`db.redis.database_index` or a numeric `db.name`).
 * Client spans often omit both; never invent `db0`.
 */
function redisIndexValues(meta: VirtualGraphMeta | undefined): string[] {
  const fromKey = extraRowValues(meta, REDIS_DB_INDEX_KEY);
  const fromName = curatedValues(meta, 'db_name');
  const unique = new Set<string>();
  [...fromKey, ...fromName].forEach((value) => {
    const formatted = formatRedisDatabase(value);
    if (formatted) unique.add(formatted);
  });
  return [...unique].sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)));
}

function messagingSubtitleValues(meta: VirtualGraphMeta | undefined): string[] {
  const unique = new Set<string>();
  const ordered: string[] = [];
  MESSAGING_SUBTITLE_KEYS.forEach((key) => {
    extraRowValues(meta, key).forEach((value) => {
      const text = value.trim();
      if (!text || unique.has(text)) return;
      unique.add(text);
      ordered.push(text);
    });
  });
  return ordered;
}

export function schemaSubtitle(id: string, system: string, meta: VirtualGraphMeta | undefined): string {
  const normalized = normalizePeerSystem(system);
  if (normalized === 'user') return '';
  if (CACHE_SYSTEMS.has(normalized)) return redisIndexValues(meta).join('/');
  if (MESSAGING_SYSTEMS.has(normalized)) return messagingSubtitleValues(meta).join(' · ');
  const names = curatedValues(meta, 'db_name');
  if (names.length > 0) return names.join('/');
  if (isSqlFamilySystem(normalized) && normalized !== 'other_sql' && !isGenericVirtualName(id) && !isProductNodeName(id)) return id;
  return '';
}

/**
 * Named nodes: db.system > messaging.system > well-known ports > graph name.
 * Generic `unknown` / `other_sql`: only `uniquePeerFamily` — mixed buckets stay unnamed.
 */
export function resolvePeerSystem(id: string, connectionHint: string, meta: VirtualGraphMeta | undefined): string {
  const fromName = peerTypeFromName(id, connectionHint);
  if (fromName.system === 'user') return 'user';
  if (isGenericVirtualName(id)) return uniquePeerFamily(meta) || fromName.system;
  const db = dominantPeerSystem(meta);
  if (db && db !== 'other_sql') return db;
  const messaging = messagingSystemFromMeta(meta);
  if (messaging) return messaging;
  const fromPorts = unanimousSystemFromPorts(meta?.instances || []);
  if (fromPorts) return fromPorts;
  return fromName.system;
}

export function virtualNodeCaption(id: string, connectionHint: string, meta: VirtualGraphMeta | undefined): NodeCaption {
  const fromName = peerTypeFromName(id, connectionHint);
  if (fromName.system === 'user') return { title: id, subtitle: '' };
  const system = resolvePeerSystem(id, connectionHint, meta);
  const title = system && system !== 'other_sql' ? system : id;
  const subtitle =
    isGenericVirtualName(id) && (!system || system === 'other_sql') ? mixedPeerSubtitle(meta) : schemaSubtitle(id, system, meta);
  return { title, subtitle: subtitle && subtitle !== title ? subtitle : '' };
}

export interface VirtualGraphEnrichment {
  edges: PharosServiceEdge[];
  labels: Record<string, string>;
  subtitles: Record<string, string>;
  glyphs: Record<string, PeerGlyph>;
}

function nodeIds(edges: PharosServiceEdge[]): string[] {
  const names = new Set<string>();
  edges.forEach((edge) => {
    names.add(edge.client);
    names.add(edge.server);
  });
  return [...names];
}

function databaseVirtualIds(edges: PharosServiceEdge[]): string[] {
  return nodeIds(edges).filter((id) => classifyNodeKind(id, edges) === 'virtual' && nodeConnectionHint(id, edges) === 'database');
}

function sharesClient(a: string, b: string, edges: PharosServiceEdge[]): boolean {
  const clientsA = new Set(edges.filter((edge) => edge.server === a).map((edge) => edge.client));
  return edges.some((edge) => edge.server === b && clientsA.has(edge.client));
}

function preferredConnectionType(a: string, b: string): string {
  const rank = (type: string) => {
    if (type === 'database') return 3;
    if (type === 'messaging_system') return 2;
    if (type === '') return 1;
    return 0;
  };
  return rank(a) >= rank(b) ? a : b;
}

function mergeEdgePair(a: PharosServiceEdge, b: PharosServiceEdge): PharosServiceEdge {
  const requestCount = a.requestCount + b.requestCount;
  const failedCount = a.failedCount + b.failedCount;
  let p95Seconds: number | undefined;
  if (a.p95Seconds != null && b.p95Seconds != null && requestCount > 0) {
    p95Seconds = (a.p95Seconds * a.requestCount + b.p95Seconds * b.requestCount) / requestCount;
  } else {
    p95Seconds = a.p95Seconds ?? b.p95Seconds;
  }
  return {
    client: a.client,
    server: a.server,
    connectionType: preferredConnectionType(a.connectionType, b.connectionType),
    requestCount,
    failedCount,
    errorRate: requestCount > 0 ? failedCount / requestCount : 0,
    p95Seconds,
  };
}

export function remapGraphNodes(edges: PharosServiceEdge[], remap: Record<string, string>): PharosServiceEdge[] {
  const rewritten = edges.map((edge) => ({
    ...edge,
    client: remap[edge.client] || edge.client,
    server: remap[edge.server] || edge.server,
  }));
  const merged = new Map<string, PharosServiceEdge>();
  rewritten.forEach((edge) => {
    if (edge.client === edge.server) return;
    const key = `${edge.client}\0${edge.server}`;
    const prev = merged.get(key);
    merged.set(key, prev ? mergeEdgePair(prev, edge) : edge);
  });
  return [...merged.values()];
}

function sameSystem(a: string, b: string): boolean {
  if (!a || !b) return false;
  return normalizePeerSystem(a) === normalizePeerSystem(b);
}

/**
 * Use traces (`db.system` / `db.name`) to rename generic SQL nodes and merge them
 * into an existing named database node when they are the same backend.
 */
export function enrichVirtualGraph(edges: PharosServiceEdge[], metas: Map<string, VirtualGraphMeta>): VirtualGraphEnrichment {
  const ids = nodeIds(edges);
  const labels: Record<string, string> = {};
  const subtitles: Record<string, string> = {};
  const glyphs: Record<string, PeerGlyph> = {};
  const remap: Record<string, string> = {};

  ids.forEach((id) => {
    const kind = classifyNodeKind(id, edges);
    const hint = kind === 'virtual' ? nodeConnectionHint(id, edges) : '';
    const fromName = peerTypeFromName(id, hint);
    const meta = metas.get(id);
    const system = resolvePeerSystem(id, hint, meta);
    glyphs[id] = kind === 'virtual' ? (system ? glyphForSystem(system) : fromName.glyph) : 'service';

    if (kind !== 'virtual') {
      labels[id] = id;
      return;
    }
    const caption = virtualNodeCaption(id, hint, meta);
    labels[id] = caption.title;
    if (caption.subtitle) subtitles[id] = caption.subtitle;
  });

  if (metas.size === 0) {
    return { edges, labels, subtitles, glyphs };
  }

  ids.forEach((id) => {
    if (!isGenericSqlNodeName(id)) return;
    if (!metas.has(id)) return;
    const meta = metas.get(id);
    const system = dominantPeerSystem(meta);
    const dbNames = curatedValues(meta, 'db_name');
    const namedHit = dbNames.find((name) => ids.some((other) => other.toLowerCase() === name.toLowerCase() && other !== id));
    if (system && system !== 'other_sql' && namedHit) {
      const target = ids.find((other) => other.toLowerCase() === namedHit.toLowerCase()) || namedHit;
      const targetSystem = dominantPeerSystem(metas.get(target));
      if (!targetSystem || sameSystem(targetSystem, system)) {
        remap[id] = target;
      }
      return;
    }
    const matched = meta?.matchedSpans?.length || 0;
    if (matched > 0 && system && system !== 'other_sql') return;
    const dbSiblings = databaseVirtualIds(edges).filter((other) => other !== id && sharesClient(id, other, edges) && !isGenericSqlNodeName(other));
    const sqlSiblings = dbSiblings.filter((other) => {
      const otherSystem = dominantPeerSystem(metas.get(other));
      const hint = nodeConnectionHint(other, edges);
      return hint === 'database' || (otherSystem && otherSystem !== 'other_sql' && glyphForSystem(otherSystem) === 'db');
    });
    if (sqlSiblings.length === 1) {
      const target = sqlSiblings[0];
      const targetSystem = dominantPeerSystem(metas.get(target));
      if (!system || system === 'other_sql' || !targetSystem || sameSystem(system, targetSystem)) {
        remap[id] = target;
      }
    }
  });

  const nextEdges = Object.keys(remap).length > 0 ? remapGraphNodes(edges, remap) : edges;
  Object.keys(remap).forEach((from) => {
    delete labels[from];
    delete subtitles[from];
    delete glyphs[from];
  });
  return { edges: nextEdges, labels, subtitles, glyphs };
}
