import { SERVICE_PAGE_PATH } from './constants';

export interface ServiceIdentity {
  service?: string;
  /** Deployment environment; same service name can exist in several of them. */
  env?: string;
  cluster?: string;
  namespace?: string;
  /** Jaeger datasource id used to list services and jump to traces. */
  ds?: number;
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (Array.isArray(value) && typeof value[0] === 'string') {
    const trimmed = value[0].trim();
    return trimmed || undefined;
  }
  return undefined;
}

function asPositiveInt(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  const raw = asString(value);
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/** Read identity fields from a parsed query-string object (or URLSearchParams-like map). */
export function parseServiceIdentity(parsed: Record<string, unknown>): ServiceIdentity {
  return {
    service: asString(parsed.service),
    env: asString(parsed.env),
    cluster: asString(parsed.cluster),
    namespace: asString(parsed.namespace),
    ds: asPositiveInt(parsed.ds),
  };
}

/**
 * Identity → query fields. Empty values are omitted so a shared URL does not pretend
 * cluster/namespace were resolved.
 */
export function identityToQuery(identity: ServiceIdentity): Record<string, string> {
  const query: Record<string, string> = {};
  if (identity.service) query.service = identity.service;
  if (identity.env) query.env = identity.env;
  if (identity.cluster) query.cluster = identity.cluster;
  if (identity.namespace) query.namespace = identity.namespace;
  if (identity.ds != null) query.ds = String(identity.ds);
  return query;
}

export function mergeIdentity(current: ServiceIdentity, patch: Partial<ServiceIdentity>): ServiceIdentity {
  const next: ServiceIdentity = { ...current, ...patch };
  if (!next.service) {
    delete next.service;
    delete next.env;
    delete next.cluster;
    delete next.namespace;
  }
  if (!next.env) delete next.env;
  if (!next.cluster) delete next.cluster;
  if (!next.namespace) delete next.namespace;
  if (next.ds == null) delete next.ds;
  return next;
}

export function encodeServiceParam(name: string): string {
  return encodeURIComponent(name);
}

export function decodeServiceParam(raw: string | undefined): string | undefined {
  if (raw == null) return undefined;
  try {
    const decoded = decodeURIComponent(raw).trim();
    return decoded || undefined;
  } catch {
    const fallback = raw.trim();
    return fallback || undefined;
  }
}

export function buildServiceListPath(query: { tab?: string } = {}): string {
  const params = new URLSearchParams();
  if (query.tab) params.set('tab', query.tab);
  const qs = params.toString();
  return qs ? `/service?${qs}` : '/service';
}

export function buildServiceDetailPath(
  service: string,
  query: { tab?: string; ds?: number; env?: string; cluster?: string; namespace?: string; start?: number; end?: number; traceId?: string } = {},
): string {
  const path = `/service/${encodeServiceParam(service)}`;
  const params = new URLSearchParams();
  if (query.tab) params.set('tab', query.tab);
  if (query.ds != null) params.set('ds', String(query.ds));
  if (query.env) params.set('env', query.env);
  if (query.cluster) params.set('cluster', query.cluster);
  if (query.namespace) params.set('namespace', query.namespace);
  if (query.start != null) params.set('start', String(query.start));
  if (query.end != null) params.set('end', String(query.end));
  if (query.traceId) params.set('traceId', query.traceId);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

/** Router 已去掉 basename。`/service` 列表不匹配；`/service/:name` 才是下钻。 */
export function parseServiceDetailLocation(pathname: string, search: string): ServiceIdentity | undefined {
  const prefix = `${SERVICE_PAGE_PATH}/`;
  if (!pathname.startsWith(prefix)) return undefined;
  const segment = pathname.slice(prefix.length).split('/')[0];
  const service = decodeServiceParam(segment);
  if (!service) return undefined;
  const qs = search.startsWith('?') ? search.slice(1) : search;
  const params = new URLSearchParams(qs);
  return parseServiceIdentity({
    service,
    env: params.get('env') ?? undefined,
    cluster: params.get('cluster') ?? undefined,
    namespace: params.get('namespace') ?? undefined,
    ds: params.get('ds') ?? undefined,
  });
}

export function buildEventCenterPath(query: { service?: string; cluster?: string; namespace?: string } = {}): string {
  const params = new URLSearchParams();
  if (query.service) params.set('service', query.service);
  if (query.cluster) params.set('cluster', query.cluster);
  if (query.namespace) params.set('namespace', query.namespace);
  const qs = params.toString();
  return qs ? `/event-center?${qs}` : '/event-center';
}

export function buildEventCenterK8sPath(query: { service?: string; cluster?: string; namespace?: string } = {}): string {
  const params = new URLSearchParams();
  if (query.service) params.set('service', query.service);
  if (query.cluster) params.set('cluster', query.cluster);
  if (query.namespace) params.set('namespace', query.namespace);
  const qs = params.toString();
  return qs ? `/event-center/k8s?${qs}` : '/event-center/k8s';
}
