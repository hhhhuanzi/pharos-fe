/**
 * Common middleware ports. This is a short hint table, not an encyclopedia.
 * Weaker than hostname / `db.system` / `messaging.system` when those are already present.
 * Port 9000 is also used by non-ClickHouse software — callers must prefer db.system.
 * Port 8443 is ClickHouse Cloud HTTPS (and generic HTTPS). Do not map 8443 to RabbitMQ.
 */

export interface WellKnownMiddleware {
  /** Canonical token for graph cards (rabbitmq, redis, mysql, …). */
  system: string;
  /** Sidebar label (e.g. RabbitMQ / AMQP). */
  displayName: string;
}

const PORT_TO_MIDDLEWARE: Record<number, WellKnownMiddleware> = {
  5672: { system: 'rabbitmq', displayName: 'RabbitMQ / AMQP' },
  5671: { system: 'rabbitmq', displayName: 'RabbitMQ / AMQP' },
  15672: { system: 'rabbitmq', displayName: 'RabbitMQ' },
  6379: { system: 'redis', displayName: 'Redis' },
  3306: { system: 'mysql', displayName: 'MySQL' },
  5432: { system: 'postgresql', displayName: 'PostgreSQL' },
  27017: { system: 'mongodb', displayName: 'MongoDB' },
  9200: { system: 'elasticsearch', displayName: 'Elasticsearch' },
  9300: { system: 'elasticsearch', displayName: 'Elasticsearch' },
  9092: { system: 'kafka', displayName: 'Kafka' },
  2181: { system: 'zookeeper', displayName: 'ZooKeeper' },
  11211: { system: 'memcached', displayName: 'Memcached' },
  8123: { system: 'clickhouse', displayName: 'ClickHouse' },
  9000: { system: 'clickhouse', displayName: 'ClickHouse' },
  9030: { system: 'doris', displayName: 'Doris' },
  1433: { system: 'mssql', displayName: 'SQL Server' },
  1521: { system: 'oracle', displayName: 'Oracle' },
  61616: { system: 'activemq', displayName: 'ActiveMQ' },
  4222: { system: 'nats', displayName: 'NATS' },
  1883: { system: 'mqtt', displayName: 'MQTT' },
  9042: { system: 'cassandra', displayName: 'Cassandra' },
  2379: { system: 'etcd', displayName: 'etcd' },
  6650: { system: 'pulsar', displayName: 'Pulsar' },
};

const SYSTEM_DISPLAY: Record<string, string> = {
  rabbitmq: 'RabbitMQ / AMQP',
  redis: 'Redis',
  mysql: 'MySQL',
  postgresql: 'PostgreSQL',
  mongodb: 'MongoDB',
  elasticsearch: 'Elasticsearch',
  kafka: 'Kafka',
  zookeeper: 'ZooKeeper',
  memcached: 'Memcached',
  clickhouse: 'ClickHouse',
  doris: 'Doris',
  mssql: 'SQL Server',
  oracle: 'Oracle',
  activemq: 'ActiveMQ',
  nats: 'NATS',
  mqtt: 'MQTT',
  cassandra: 'Cassandra',
  etcd: 'etcd',
  pulsar: 'Pulsar',
};

export function parsePortNumber(raw: string | number | undefined | null): number | undefined {
  if (raw == null || raw === '') return undefined;
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isInteger(n) || n <= 0 || n > 65535) return undefined;
  return n;
}

/** `host:port` or `[ipv6]:port`. Bare IPv6 (multiple colons, no brackets) is ignored. */
export function portFromAddress(address: string): number | undefined {
  const trimmed = address.trim();
  if (!trimmed) return undefined;
  const bracket = trimmed.match(/^\[(?:[^\]]+)\]:(\d+)$/);
  if (bracket) return parsePortNumber(bracket[1]);
  const colon = trimmed.lastIndexOf(':');
  if (colon <= 0) return undefined;
  if (trimmed.indexOf(':') !== colon) return undefined;
  return parsePortNumber(trimmed.slice(colon + 1));
}

export function peerInstancePort(address: string, port: string): number | undefined {
  return parsePortNumber(port) ?? portFromAddress(address);
}

/** Hostname without port / brackets. `host:port` or `[ipv6]:port`. */
export function hostFromAddress(address: string): string {
  const trimmed = address.trim();
  if (!trimmed) return '';
  const withoutScheme = trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  const hostPort = withoutScheme.split('/')[0] || '';
  const bracket = hostPort.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracket) return bracket[1];
  const colon = hostPort.lastIndexOf(':');
  if (colon > 0 && hostPort.indexOf(':') === colon) return hostPort.slice(0, colon);
  return hostPort;
}

/**
 * Product from the peer hostname. Port 8443 is not enough — ClickHouse Cloud uses it for HTTPS.
 * Weaker callers still prefer an explicit `db.system` on the same row.
 */
export function systemFromHostname(address: string): string {
  const host = hostFromAddress(address).toLowerCase();
  if (!host) return '';
  if (host.includes('clickhouse')) return 'clickhouse';
  return '';
}

export function middlewareFromPort(port: number | undefined): WellKnownMiddleware | undefined {
  if (port == null) return undefined;
  return PORT_TO_MIDDLEWARE[port];
}

export function middlewareDisplayName(system: string): string {
  const key = system.trim().toLowerCase();
  if (!key) return '';
  return SYSTEM_DISPLAY[key] || system;
}

/**
 * All instances must map to the same system. Mixed or unknown ports return empty
 * so the graph does not merge unrelated backends into one type.
 */
export function unanimousSystemFromPorts(instances: ReadonlyArray<{ address: string; port: string }>): string {
  if (instances.length === 0) return '';
  const systems = new Set<string>();
  for (const instance of instances) {
    const port = peerInstancePort(instance.address, instance.port);
    const hint = middlewareFromPort(port);
    if (!hint) return '';
    systems.add(hint.system);
  }
  return systems.size === 1 ? [...systems][0] : '';
}

export interface PeerInstanceTypeHint {
  address: string;
  port: string;
  dbSystem?: string;
  messagingSystem?: string;
}

/**
 * Sidebar instance type is inferred per row.
 * hostname / `db.system` beat well-known ports; 8443 alone is not RabbitMQ.
 * Do not pass the graph node name — a rabbitmq drawer can still list a ClickHouse host.
 */
export function instanceTypeLabel(instance: PeerInstanceTypeHint): string {
  const fromHost = systemFromHostname(instance.address);
  if (fromHost) return middlewareDisplayName(fromHost);
  const db = instance.dbSystem?.trim().toLowerCase() || '';
  if (db && db !== 'other_sql') return middlewareDisplayName(db);
  const messaging = instance.messagingSystem?.trim().toLowerCase() || '';
  if (messaging) return middlewareDisplayName(messaging);
  const hint = middlewareFromPort(peerInstancePort(instance.address, instance.port));
  return hint?.displayName || '';
}
