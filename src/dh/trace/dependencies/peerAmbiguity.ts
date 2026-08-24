import type { CuratedPeerField, PeerAttrRow, PeerInstance } from './virtualPeer';
import { middlewareFromPort, peerInstancePort, systemFromHostname } from './wellKnownPorts';

/**
 * Sampled composition of a Prom `unknown` / `other_sql` bucket.
 * Keep this file free of `peerType` imports so the generic-name gate stays one call site.
 */
export type PeerCompositionMeta = {
  curated?: readonly Pick<CuratedPeerField, 'id' | 'values'>[];
  extraRows?: readonly Pick<PeerAttrRow, 'key' | 'values'>[];
  instances?: ReadonlyArray<
    Pick<PeerInstance, 'address' | 'port'> & Partial<Pick<PeerInstance, 'dbSystem' | 'messagingSystem' | 'spanCount'>>
  >;
};

/** Ports that are an obvious non-MQ protocol. Not added to wellKnownPorts (8443 is not a product). */
const PROTOCOL_PORT_FAMILY: Record<number, string> = {
  80: 'http',
  443: 'http',
  8080: 'http',
  8443: 'http',
  8848: 'nacos',
  20880: 'dubbo',
};

const HTTP_METHOD_KEYS = new Set(['http.method', 'http.request.method']);
const OTHER_FAMILY = 'other';

type SignalKind = 'strong' | 'weak-product' | 'protocol' | 'other';

interface InstanceSignal {
  kind: SignalKind;
  family: string;
}

function canonicalFamily(raw: string): string {
  const system = raw.trim().toLowerCase();
  if (!system) return '';
  if (system === 'postgres') return 'postgresql';
  if (system === 'mariadb') return 'mysql';
  if (system === 'mongo') return 'mongodb';
  if (system === 'opensearch') return 'elasticsearch';
  if (system === 'keydb' || system === 'valkey') return 'redis';
  if (system === 'memcache') return 'memcached';
  if (system === 'sqlserver' || system === 'sql_server') return 'mssql';
  if (system === 'sql') return 'other_sql';
  if (system === 'apache_dubbo' || system === 'dubbo') return 'dubbo';
  return system;
}

function addFamily(into: Set<string>, raw: string) {
  const family = canonicalFamily(raw);
  if (family) into.add(family);
}

function signalOfInstance(
  instance: Pick<PeerInstance, 'address' | 'port'> & Partial<Pick<PeerInstance, 'dbSystem' | 'messagingSystem'>>,
): InstanceSignal {
  const db = canonicalFamily(instance.dbSystem || '');
  if (db && db !== 'other_sql') return { kind: 'strong', family: db };
  const messaging = canonicalFamily(instance.messagingSystem || '');
  if (messaging) return { kind: 'strong', family: messaging };
  const fromHost = systemFromHostname(instance.address);
  if (fromHost) return { kind: 'strong', family: fromHost };
  const port = peerInstancePort(instance.address, instance.port);
  const middleware = middlewareFromPort(port);
  if (middleware) return { kind: 'weak-product', family: middleware.system };
  if (port != null && PROTOCOL_PORT_FAMILY[port]) return { kind: 'protocol', family: PROTOCOL_PORT_FAMILY[port] };
  return { kind: 'other', family: OTHER_FAMILY };
}

function familyOfInstance(
  instance: Pick<PeerInstance, 'address' | 'port'> & Partial<Pick<PeerInstance, 'dbSystem' | 'messagingSystem'>>,
): string {
  return signalOfInstance(instance).family;
}

function familiesFromExtraRows(rows: PeerCompositionMeta['extraRows']): string[] {
  const families: string[] = [];
  (rows || []).forEach((row) => {
    if (row.key === 'messaging.system' || row.key === 'rpc.system' || row.key === 'db.system') {
      row.values.forEach((value) => {
        const family = canonicalFamily(value);
        if (family && family !== 'other_sql') families.push(family);
      });
      return;
    }
    if (HTTP_METHOD_KEYS.has(row.key)) families.push('http');
  });
  return families;
}

function familiesFromCurated(curated: PeerCompositionMeta['curated']): string[] {
  const row = curated?.find((item) => item.id === 'db_system');
  return (row?.values || [])
    .map((value) => canonicalFamily(value))
    .filter((family) => family && family !== 'other_sql');
}

function collectSignals(meta: PeerCompositionMeta | undefined): {
  strong: Set<string>;
  protocol: Set<string>;
  weakProduct: Set<string>;
  other: boolean;
} {
  const strong = new Set<string>();
  const protocol = new Set<string>();
  const weakProduct = new Set<string>();
  let other = false;

  familiesFromCurated(meta?.curated).forEach((family) => addFamily(strong, family));
  familiesFromExtraRows(meta?.extraRows).forEach((family) => addFamily(strong, family));

  (meta?.instances || []).forEach((instance) => {
    const signal = signalOfInstance(instance);
    if (signal.kind === 'strong') addFamily(strong, signal.family);
    else if (signal.kind === 'protocol') addFamily(protocol, signal.family);
    else if (signal.kind === 'weak-product') addFamily(weakProduct, signal.family);
    else other = true;
  });

  return { strong, protocol, weakProduct, other };
}

/**
 * Rename a generic virtual node only when every signal collapses to one explicit system.
 * Mixed AMQP + Dubbo + HTTP + Nacos + ClickHouse stays empty (keep `unknown`).
 * A unique `db.system` still wins over a colliding well-known port on the same bucket
 * (9000 is ClickHouse *and* other software). Protocol ports (80 / 20880 / 8848) do not.
 */
export function uniquePeerFamily(meta: PeerCompositionMeta | undefined): string {
  const { strong, protocol, weakProduct, other } = collectSignals(meta);
  if (strong.size > 1) return '';
  if (strong.size === 1) {
    const only = [...strong][0];
    if (!only || only === OTHER_FAMILY || only === 'other_sql') return '';
    const extraProtocol = [...protocol].some((family) => family !== only);
    if (extraProtocol) return '';
    // Unclassified peers block a messaging-only rename (`unknown` leftovers).
    // A unique curated `db.system` still wins — port 9000 is a known collision.
    if (other && familiesFromCurated(meta?.curated).length === 0) return '';
    return only;
  }
  if (other) return '';
  const weak = new Set<string>([...protocol, ...weakProduct]);
  if (weak.size !== 1) return '';
  const only = [...weak][0];
  if (!only || only === OTHER_FAMILY || only === 'other_sql') return '';
  return only;
}

function familyWeight(
  instance: Pick<PeerInstance, 'address' | 'port'> & Partial<Pick<PeerInstance, 'dbSystem' | 'messagingSystem' | 'spanCount'>>,
): { family: string; weight: number } {
  const family = familyOfInstance(instance);
  return { family, weight: instance.spanCount && instance.spanCount > 0 ? instance.spanCount : 1 };
}

/**
 * Graph subtitle for a mixed generic bucket: list the main families so a queue name
 * cannot impersonate the whole node. Empty when there is nothing honest to show.
 */
export function mixedPeerSubtitle(meta: PeerCompositionMeta | undefined): string {
  const weights = new Map<string, number>();
  const add = (family: string, weight: number) => {
    const key = canonicalFamily(family);
    if (!key || key === OTHER_FAMILY || key === 'other_sql') return;
    weights.set(key, (weights.get(key) || 0) + weight);
  };

  (meta?.instances || []).forEach((instance) => {
    const { family, weight } = familyWeight(instance);
    add(family, weight);
  });
  familiesFromCurated(meta?.curated).forEach((family) => {
    if (!weights.has(family)) add(family, 1);
  });
  familiesFromExtraRows(meta?.extraRows).forEach((family) => {
    if (!weights.has(family)) add(family, 1);
  });

  const ranked = [...weights.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([family]) => family);
  if (ranked.length > 1) return ranked.join(' · ');
  return '';
}
