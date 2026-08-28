import type { TraceKeyValuePair, TraceResponse, TraceSpanData } from '@/pages/traceCpt/type';
import { isMessagingSpan } from '../spanSemantics';
import { DB_SYSTEM_KEYS, HTTP_METHOD_KEYS, MESSAGING_SYSTEM_KEYS, tagValue } from '../summaryFields';
import { isMessagingSystemName, isSqlFamilySystem } from './peerType';
import { middlewareFromPort, peerInstancePort, systemFromHostname } from './wellKnownPorts';

/** Peer address: new network semconv first, then older net.peer / server.address. */
export const PEER_ADDRESS_KEYS = ['network.peer.address', 'net.peer.name', 'server.address', 'net.peer.ip'] as const;
export const PEER_PORT_KEYS = ['network.peer.port', 'net.peer.port', 'server.port'] as const;
export const PEER_DB_SYSTEM_KEYS = ['db.system'] as const;
export const PEER_DB_NAME_KEYS = ['db.name', 'db.namespace'] as const;
export const PEER_SERVICE_KEYS = ['peer.service'] as const;
/** Full statement first; Redis often only has operation / command-style keys. */
export const PEER_STATEMENT_KEYS = ['db.statement', 'db.query.text', 'db.query.summary', 'db.operation.name', 'db.operation', 'sql'] as const;
export const PEER_ENV_KEYS = ['deployment.environment.name'] as const;

export type CuratedPeerFieldId = 'peer_address' | 'peer_port' | 'db_system' | 'db_name' | 'peer_service' | 'statement' | 'environment';

export interface CuratedPeerSpec {
  id: CuratedPeerFieldId;
  keys: readonly string[];
}

/** Curated fields in display order. Address/port also drive the instance list. */
export const CURATED_PEER_FIELDS: readonly CuratedPeerSpec[] = [
  { id: 'peer_address', keys: PEER_ADDRESS_KEYS },
  { id: 'peer_port', keys: PEER_PORT_KEYS },
  { id: 'db_system', keys: PEER_DB_SYSTEM_KEYS },
  { id: 'db_name', keys: PEER_DB_NAME_KEYS },
  { id: 'peer_service', keys: PEER_SERVICE_KEYS },
  { id: 'statement', keys: PEER_STATEMENT_KEYS },
  { id: 'environment', keys: PEER_ENV_KEYS },
];

const CURATED_SUMMARY_IDS: readonly CuratedPeerFieldId[] = ['db_system', 'db_name', 'peer_service', 'statement', 'environment'];

const UNKNOWN_ADDRESS_HINT_KEYS = [...PEER_ADDRESS_KEYS, 'url.full', 'http.url'] as const;
const TRUNCATE_KEYS = new Set<string>(['db.statement', 'db.query.text', 'db.query.summary', 'sql', 'db.connection_string']);
const TRUNCATE_AT = 200;

/** OTel `db.system` names we can send as a FindTraces hint (gateway may ignore on older Jaeger). */
const KNOWN_DB_SYSTEMS = new Set([
  'cassandra',
  'clickhouse',
  'cockroachdb',
  'cosmosdb',
  'couchbase',
  'couchdb',
  'derby',
  'dynamodb',
  'elasticsearch',
  'h2',
  'hbase',
  'hive',
  'hsqldb',
  'influxdb',
  'mariadb',
  'memcached',
  'mongodb',
  'mssql',
  'mysql',
  'opensearch',
  'oracle',
  'other_sql',
  'postgresql',
  'redis',
  'sqlite',
  'spanner',
  'trino',
]);

export interface PeerAttrRow {
  key: string;
  values: string[];
}

export interface CuratedPeerField {
  id: CuratedPeerFieldId;
  values: string[];
  /** Keys that actually supplied a value, in fallback order. */
  sourceKeys: string[];
}

export interface MissingPeerField {
  id: CuratedPeerFieldId;
  keys: readonly string[];
}

export interface PeerInstance {
  address: string;
  port: string;
  addressKeys: string[];
  portKeys: string[];
  spanCount: number;
  /** First non-empty `db.system` seen on spans for this address+port. */
  dbSystem?: string;
  /** First non-empty `messaging.system` seen on spans for this address+port. */
  messagingSystem?: string;
}

export interface MatchedPeerSpan {
  traceId: string;
  spanId: string;
  operation: string;
  service: string;
}

export interface VirtualPeerAggregate {
  matchedSpans: MatchedPeerSpan[];
  /** Distinct address+port pairs (same Redis node is one row, not one per span). */
  instances: PeerInstance[];
  /** Curated fields that have at least one value (address/port live on `instances`). */
  curated: CuratedPeerField[];
  missing: MissingPeerField[];
  extraRows: PeerAttrRow[];
  truncated: boolean;
}

function stringifyTagValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function maybeTruncate(key: string, text: string): string {
  if (TRUNCATE_KEYS.has(key) && text.length > TRUNCATE_AT) return `${text.slice(0, TRUNCATE_AT)}…`;
  return text;
}

function firstKeyedValue(tags: TraceKeyValuePair[] | undefined, keys: readonly string[]): { key: string; value: string } | undefined {
  if (!tags || tags.length === 0) return undefined;
  for (const key of keys) {
    const hit = tags.find((tag) => tag.key === key);
    if (hit == null) continue;
    const text = stringifyTagValue(hit.value);
    if (!text) continue;
    return { key, value: maybeTruncate(key, text) };
  }
  return undefined;
}

function isOutboundKind(tags: TraceKeyValuePair[] | undefined): boolean {
  const kind = tagValue(tags, ['span.kind']).toLowerCase();
  return kind === '' || kind === 'client' || kind === 'producer';
}

function hasPeerAddress(tags: TraceKeyValuePair[] | undefined): boolean {
  return Boolean(tagValue(tags, UNKNOWN_ADDRESS_HINT_KEYS));
}

export interface MatchVirtualNodeOptions {
  /** `db.name` values that already have their own graph node — those spans belong there, not to `other_sql`. */
  siblingDbNames?: ReadonlySet<string>;
  /** Span operation (`basic.ack`, `POST`, …) — used for messaging-node matching. */
  operationName?: string;
}

export interface AggregateVirtualPeerOptions extends MatchVirtualNodeOptions {
  /**
   * Emitting services whose spans may be aggregated. Matching a trace by caller does not mean
   * every span in it was emitted by that caller: a trace pulled for `turms-gateway` also carries
   * the spans `nome-sec-admin` sent to the same shared database.
   *
   * Required rather than optional so no call site can drop the whitelist and silently widen the
   * result back to every emitter in the sampled traces.
   */
  allowedServices: ReadonlySet<string>;
}

const RABBIT_OPERATION = /^(basic\.|amqp\b|rabbitmq\b)/i;

function peerAddressForMatch(tags: TraceKeyValuePair[] | undefined): string {
  return tagValue(tags, UNKNOWN_ADDRESS_HINT_KEYS);
}

function peerProductConflicts(tags: TraceKeyValuePair[] | undefined, nodeName: string): boolean {
  const dbSystem = tagValue(tags, DB_SYSTEM_KEYS).toLowerCase();
  if (dbSystem && dbSystem !== 'other_sql' && dbSystem !== nodeName) return true;
  const messaging = tagValue(tags, MESSAGING_SYSTEM_KEYS).toLowerCase();
  if (messaging && messaging !== nodeName) return true;
  const fromHost = systemFromHostname(peerAddressForMatch(tags));
  if (fromHost && fromHost !== nodeName) return true;
  return false;
}

function looksLikePlainHttp(tags: TraceKeyValuePair[] | undefined, operationName?: string): boolean {
  if (tagValue(tags, HTTP_METHOD_KEYS)) return true;
  return /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/i.test(operationName?.trim() || '');
}

function spanMatchesMessagingNode(tags: TraceKeyValuePair[] | undefined, nodeName: string, operationName?: string): boolean {
  if (peerProductConflicts(tags, nodeName)) return false;
  const messaging = tagValue(tags, MESSAGING_SYSTEM_KEYS).toLowerCase();
  if (messaging === nodeName) return true;
  const dbSystem = tagValue(tags, DB_SYSTEM_KEYS).toLowerCase();
  if (dbSystem === nodeName) return true;
  const port = peerInstancePort(tagValue(tags, PEER_ADDRESS_KEYS), tagValue(tags, PEER_PORT_KEYS));
  if (middlewareFromPort(port)?.system === nodeName) return true;
  if (nodeName === 'rabbitmq' && RABBIT_OPERATION.test(operationName?.trim() || '')) return true;
  if (isMessagingSpan(tags)) return true;
  const peer = tagValue(tags, ['peer.service']).toLowerCase();
  return peer === nodeName && !looksLikePlainHttp(tags, operationName);
}

/**
 * Does this client span belong to the virtual node named `nodeName`?
 * Matching follows service_graph naming: peer.service → db.name → db.system, else unknown.
 * Messaging nodes (rabbitmq / kafka / …) also match `messaging.system`, AMQP ports, and
 * verbs like `basic.ack` — not HTTP POSTs to ClickHouse Cloud.
 * Generic JDBC `other_sql` also matches a concrete SQL `db.system` (clickhouse / mysql / …)
 * when that span is not already claimed by a named `db.name` node.
 */
export function spanMatchesVirtualNode(
  tags: TraceKeyValuePair[] | undefined,
  nodeName: string,
  options?: MatchVirtualNodeOptions,
): boolean {
  const name = nodeName.trim().toLowerCase();
  if (!name) return false;
  const dbSystem = tagValue(tags, DB_SYSTEM_KEYS).toLowerCase();
  const dbName = tagValue(tags, ['db.name', 'db.namespace']).toLowerCase();
  const peer = tagValue(tags, ['peer.service']).toLowerCase();
  const kind = tagValue(tags, ['span.kind']).toLowerCase();

  if (kind === 'server' || kind === 'consumer') return false;

  if (name === 'unknown') {
    return isOutboundKind(tags) && !dbSystem && !dbName && !peer && (kind === 'client' || hasPeerAddress(tags));
  }
  if (!isOutboundKind(tags)) return false;
  if (name === 'other_sql' || name === 'sql') {
    if (dbName && options?.siblingDbNames?.has(dbName)) return false;
    return isSqlFamilySystem(dbSystem);
  }
  if (isMessagingSystemName(name)) {
    return spanMatchesMessagingNode(tags, name, options?.operationName);
  }
  return dbSystem === name || dbName === name || peer === name;
}

export function attributeHintForNode(nodeName: string): Record<string, string> | undefined {
  const name = nodeName.trim();
  if (!name || name.toLowerCase() === 'unknown') return undefined;
  // Sample broadly so JDBC `other_sql` nodes can pick up clickhouse / mysql / … from db.system.
  if (name.toLowerCase() === 'other_sql' || name.toLowerCase() === 'sql') return undefined;
  if (isMessagingSystemName(name)) return { 'messaging.system': name };
  if (KNOWN_DB_SYSTEMS.has(name.toLowerCase())) return { 'db.system': name };
  return { 'db.name': name };
}

function pushTag(into: Map<string, Set<string>>, tag: TraceKeyValuePair) {
  if (!tag?.key) return;
  let text = stringifyTagValue(tag.value);
  if (!text) return;
  text = maybeTruncate(tag.key, text);
  let set = into.get(tag.key);
  if (!set) {
    set = new Set<string>();
    into.set(tag.key, set);
  }
  set.add(text);
}

function tagsOf(span: TraceSpanData, trace: TraceResponse): TraceKeyValuePair[] {
  const processTags = trace.processes?.[span.processID]?.tags || [];
  return [...(span.tags || []), ...processTags];
}

function addToSetMap(into: Map<string, Set<string>>, id: string, value: string) {
  let set = into.get(id);
  if (!set) {
    set = new Set<string>();
    into.set(id, set);
  }
  set.add(value);
}

export function formatPeerInstance(instance: Pick<PeerInstance, 'address' | 'port'>): string {
  return instance.port ? `${instance.address}:${instance.port}` : instance.address;
}

/**
 * Collect every tag on matching client spans (span + resource/process), then curate
 * key fields (first non-empty key in each fallback list) and instance rows by address+port.
 * Only spans emitted by `options.allowedServices` contribute.
 */
export function aggregateVirtualPeerSpans(
  traces: TraceResponse[],
  nodeName: string,
  truncated: boolean,
  options: AggregateVirtualPeerOptions,
): VirtualPeerAggregate {
  const valueSets = new Map<string, Set<string>>();
  const matchedSpans: MatchedPeerSpan[] = [];
  const fieldValues = new Map<CuratedPeerFieldId, Set<string>>();
  const fieldKeys = new Map<CuratedPeerFieldId, Set<string>>();
  const instanceMap = new Map<string, PeerInstance>();
  const consumedKeys = new Set<string>();

  traces.forEach((trace) => {
    (trace.spans || []).forEach((span) => {
      const service = trace.processes?.[span.processID]?.serviceName || '';
      if (!options.allowedServices.has(service)) return;
      const spanTags = span.tags || [];
      if (!spanMatchesVirtualNode(spanTags, nodeName, { ...options, operationName: span.operationName })) return;
      const tags = tagsOf(span, trace);
      matchedSpans.push({
        traceId: trace.traceID,
        spanId: span.spanID,
        operation: span.operationName,
        service,
      });
      tags.forEach((tag) => pushTag(valueSets, tag));

      CURATED_PEER_FIELDS.forEach((field) => {
        const hit = firstKeyedValue(tags, field.keys);
        if (!hit) return;
        addToSetMap(fieldValues, field.id, hit.value);
        addToSetMap(fieldKeys, field.id, hit.key);
        consumedKeys.add(hit.key);
      });

      const address = firstKeyedValue(tags, PEER_ADDRESS_KEYS);
      if (!address) return;
      const port = firstKeyedValue(tags, PEER_PORT_KEYS);
      const instanceKey = `${address.value}\0${port?.value || ''}`;
      let instance = instanceMap.get(instanceKey);
      if (!instance) {
        instance = {
          address: address.value,
          port: port?.value || '',
          addressKeys: [],
          portKeys: [],
          spanCount: 0,
        };
        instanceMap.set(instanceKey, instance);
      }
      instance.spanCount += 1;
      if (!instance.addressKeys.includes(address.key)) instance.addressKeys.push(address.key);
      if (port && !instance.portKeys.includes(port.key)) instance.portKeys.push(port.key);
      const dbSystem = firstKeyedValue(tags, PEER_DB_SYSTEM_KEYS) || firstKeyedValue(tags, DB_SYSTEM_KEYS);
      if (dbSystem && !instance.dbSystem) instance.dbSystem = dbSystem.value;
      const messaging = firstKeyedValue(tags, MESSAGING_SYSTEM_KEYS);
      if (messaging && !instance.messagingSystem) instance.messagingSystem = messaging.value;
    });
  });

  const instances = [...instanceMap.values()].sort((a, b) => {
    if (b.spanCount !== a.spanCount) return b.spanCount - a.spanCount;
    return formatPeerInstance(a).localeCompare(formatPeerInstance(b));
  });

  const curated: CuratedPeerField[] = [];
  const missing: MissingPeerField[] = [];
  CURATED_PEER_FIELDS.forEach((field) => {
    const values = [...(fieldValues.get(field.id) || [])].sort();
    const sourceKeys = field.keys.filter((key) => fieldKeys.get(field.id)?.has(key));
    const present = values.length > 0;
    if (field.id === 'peer_address' || field.id === 'peer_port') {
      if (!present) missing.push({ id: field.id, keys: field.keys });
      return;
    }
    if (!CURATED_SUMMARY_IDS.includes(field.id)) return;
    if (present) {
      curated.push({ id: field.id, values, sourceKeys });
    } else {
      missing.push({ id: field.id, keys: field.keys });
    }
  });

  const extraRows: PeerAttrRow[] = [...valueSets.keys()]
    .filter((key) => !consumedKeys.has(key))
    .sort()
    .map((key) => ({
      key,
      values: [...(valueSets.get(key) || [])].sort(),
    }));

  return { matchedSpans, instances, curated, missing, extraRows, truncated };
}
