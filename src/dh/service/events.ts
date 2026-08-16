import { escapePromLabel, escapePromRegex } from './red';
import type { PromVectorSample } from '@/dh/trace/dependencies/promql';
import type { PromMatrixSample } from './series';

/**
 * kube-eventer counters already used by Nightingale Kubernetes dashboards
 * (`integrations/Kubernetes/dashboards/deployment.json` "Error Events").
 * There is no dedicated Pharos events API — the page reads Prom via `/proxy/:id`.
 */
export const EVENTER_ERROR_METRIC = 'eventer_events_error_total';
export const EVENTER_NORMAL_METRIC = 'eventer_events_normal_total';

export type K8sEventType = 'warning' | 'normal';
export type K8sEventTypeFilter = 'all' | K8sEventType;

export interface K8sEvent {
  id: string;
  type: K8sEventType;
  reason: string;
  kind: string;
  name: string;
  namespace?: string;
  cluster?: string;
  count: number;
  lastSeenUnix?: number;
}

export interface ServiceEventQuery {
  service: string;
  clusters?: string[];
  namespaces?: string[];
}

export interface ServiceEventsResult {
  events: K8sEvent[];
}

/** Deployment / Pod names generated from the service name (`order`, `order-7d8f9`). */
export function buildServiceNameRegex(service: string): string {
  return `^${escapePromRegex(service)}(-[a-z0-9]+)*$`;
}

function regexOr(values: string[]): string | undefined {
  const parts = values.map((value) => value.trim()).filter(Boolean).map(escapePromRegex);
  if (parts.length === 0) return undefined;
  return parts.join('|');
}

/** Label set matches the n9e K8s dashboard: name / namespace / cluster. */
export function buildEventerMatcher(input: ServiceEventQuery): string {
  const parts = [`name=~"${escapePromLabel(buildServiceNameRegex(input.service))}"`];
  const namespaces = regexOr(input.namespaces || []);
  if (namespaces) parts.push(`namespace=~"${escapePromLabel(namespaces)}"`);
  const clusters = regexOr(input.clusters || []);
  if (clusters) parts.push(`cluster=~"${escapePromLabel(clusters)}"`);
  return `{${parts.join(',')}}`;
}

export function buildEventerQueries(input: ServiceEventQuery, range: string) {
  return buildGlobalEventerQueries(input, range);
}

/** Optional service / cluster / namespace. Empty matcher = fleet-wide eventer counters. */
export interface GlobalEventQuery {
  service?: string;
  clusters?: string[];
  namespaces?: string[];
}

export function buildGlobalEventerMatcher(input: GlobalEventQuery = {}): string {
  const parts: string[] = [];
  const service = input.service?.trim();
  if (service) parts.push(`name=~"${escapePromLabel(buildServiceNameRegex(service))}"`);
  const namespaces = regexOr(input.namespaces || []);
  if (namespaces) parts.push(`namespace=~"${escapePromLabel(namespaces)}"`);
  const clusters = regexOr(input.clusters || []);
  if (clusters) parts.push(`cluster=~"${escapePromLabel(clusters)}"`);
  return parts.length > 0 ? `{${parts.join(',')}}` : '';
}

export function buildGlobalEventerQueries(input: GlobalEventQuery, range: string) {
  const matcher = buildGlobalEventerMatcher(input);
  return {
    warning: `increase(${EVENTER_ERROR_METRIC}${matcher}[${range}])`,
    normal: `increase(${EVENTER_NORMAL_METRIC}${matcher}[${range}])`,
  };
}

export function eventKey(event: Pick<K8sEvent, 'type' | 'cluster' | 'namespace' | 'kind' | 'name' | 'reason'>): string {
  return [event.type, event.cluster || '', event.namespace || '', event.kind, event.name, event.reason].join('|');
}

function pickMetricLabel(metric: Record<string, string>, key: string): string {
  const value = metric[key];
  return typeof value === 'string' ? value.trim() : '';
}

export function labelsToEvent(metric: Record<string, string>, type: K8sEventType, count: number): K8sEvent {
  const reason = pickMetricLabel(metric, 'reason');
  const kind = pickMetricLabel(metric, 'kind');
  const name = pickMetricLabel(metric, 'name');
  const namespace = pickMetricLabel(metric, 'namespace') || undefined;
  const cluster = pickMetricLabel(metric, 'cluster') || undefined;
  const event: K8sEvent = {
    id: '',
    type,
    reason,
    kind,
    name,
    count,
  };
  if (namespace) event.namespace = namespace;
  if (cluster) event.cluster = cluster;
  event.id = eventKey(event);
  return event;
}

export function samplesToEvents(samples: PromVectorSample[], type: K8sEventType): K8sEvent[] {
  const events: K8sEvent[] = [];
  samples.forEach((sample) => {
    const count = Math.ceil(Number(sample.value?.[1]));
    if (!Number.isFinite(count) || count <= 0) return;
    events.push(labelsToEvent(sample.metric || {}, type, count));
  });
  return events;
}

export function lastSeenFromValues(values: Array<[number, string]>): number | undefined {
  for (let i = values.length - 1; i >= 0; i--) {
    const n = Number(values[i][1]);
    if (Number.isFinite(n) && n > 0) return Number(values[i][0]);
  }
  return undefined;
}

export function matrixToLastSeen(samples: PromMatrixSample[], type: K8sEventType): Array<{ key: string; lastSeenUnix?: number }> {
  return samples.map((sample) => {
    const event = labelsToEvent(sample.metric || {}, type, 0);
    return { key: event.id, lastSeenUnix: lastSeenFromValues(sample.values || []) };
  });
}

export function applyLastSeen(events: K8sEvent[], seen: Array<{ key: string; lastSeenUnix?: number }>): K8sEvent[] {
  const map = new Map<string, number>();
  seen.forEach((item) => {
    if (item.lastSeenUnix != null) map.set(item.key, item.lastSeenUnix);
  });
  return events.map((event) => {
    const lastSeenUnix = map.get(event.id);
    return lastSeenUnix != null ? { ...event, lastSeenUnix } : event;
  });
}

export function sortEvents(events: K8sEvent[]): K8sEvent[] {
  return [...events].sort((a, b) => {
    const ta = a.lastSeenUnix ?? 0;
    const tb = b.lastSeenUnix ?? 0;
    if (tb !== ta) return tb - ta;
    if (b.count !== a.count) return b.count - a.count;
    return a.reason.localeCompare(b.reason);
  });
}

export function mergeServiceEvents(input: {
  warning: PromVectorSample[];
  normal: PromVectorSample[];
  warningRange?: PromMatrixSample[];
  normalRange?: PromMatrixSample[];
}): K8sEvent[] {
  const events = [...samplesToEvents(input.warning, 'warning'), ...samplesToEvents(input.normal, 'normal')];
  const seen = [...matrixToLastSeen(input.warningRange || [], 'warning'), ...matrixToLastSeen(input.normalRange || [], 'normal')];
  return sortEvents(applyLastSeen(events, seen));
}

export function filterEventsByType(events: K8sEvent[], type: K8sEventTypeFilter): K8sEvent[] {
  if (type === 'all') return events;
  return events.filter((event) => event.type === type);
}

export function countEventsByType(events: K8sEvent[]): { warning: number; normal: number } {
  let warning = 0;
  let normal = 0;
  events.forEach((event) => {
    if (event.type === 'warning') warning += 1;
    else normal += 1;
  });
  return { warning, normal };
}

export function formatEventObject(event: Pick<K8sEvent, 'kind' | 'name'>): string {
  if (event.kind && event.name) return `${event.kind}/${event.name}`;
  return event.name || event.kind || '—';
}

/**
 * Well-known Kubernetes Event.reason values for pod 重启 / crash / pending.
 * kube-eventer counters have no message body, so this is reason-only.
 * Crash is checked before restart so BackOff is not counted as a start.
 */
export type PodEventCategory = 'restart' | 'crash' | 'pending';

export const POD_RESTART_REASONS = ['Killing', 'Started'] as const;
export const POD_CRASH_REASONS = ['BackOff', 'CrashLoopBackOff', 'Failed', 'Error', 'OOMKilling', 'Unhealthy'] as const;
export const POD_PENDING_REASONS = [
  'FailedScheduling',
  'FailedBinding',
  'Unschedulable',
  'Nominated',
  'NotTriggerScaleUp',
  'ImagePullBackOff',
  'ErrImagePull',
] as const;

const POD_RESTART_REASON_SET = new Set<string>(POD_RESTART_REASONS);
const POD_CRASH_REASON_SET = new Set<string>(POD_CRASH_REASONS);
const POD_PENDING_REASON_SET = new Set<string>(POD_PENDING_REASONS);

export function isPodKind(kind: string): boolean {
  return kind.trim().toLowerCase() === 'pod';
}

export function classifyPodEvent(event: Pick<K8sEvent, 'kind' | 'reason'>): PodEventCategory | undefined {
  if (!isPodKind(event.kind)) return undefined;
  const reason = event.reason.trim();
  if (POD_CRASH_REASON_SET.has(reason)) return 'crash';
  if (POD_PENDING_REASON_SET.has(reason)) return 'pending';
  if (POD_RESTART_REASON_SET.has(reason)) return 'restart';
  return undefined;
}

export interface PodCategoryStat {
  /** Distinct event rows in this bucket. */
  events: number;
  /** Sum of kube-eventer counts. */
  occurrences: number;
  /** Distinct pods (cluster|namespace|name). */
  pods: number;
}

export interface PodEventStats {
  restart: PodCategoryStat;
  crash: PodCategoryStat;
  pending: PodCategoryStat;
}

function emptyPodStat(): PodCategoryStat {
  return { events: 0, occurrences: 0, pods: 0 };
}

function toPodStat(list: K8sEvent[]): PodCategoryStat {
  if (list.length === 0) return emptyPodStat();
  const podKeys = new Set<string>();
  let occurrences = 0;
  list.forEach((event) => {
    occurrences += event.count;
    podKeys.add([event.cluster || '', event.namespace || '', event.name].join('|'));
  });
  return { events: list.length, occurrences, pods: podKeys.size };
}

export function summarizePodEvents(events: K8sEvent[]): PodEventStats {
  const restart: K8sEvent[] = [];
  const crash: K8sEvent[] = [];
  const pending: K8sEvent[] = [];
  events.forEach((event) => {
    const category = classifyPodEvent(event);
    if (category === 'restart') restart.push(event);
    else if (category === 'crash') crash.push(event);
    else if (category === 'pending') pending.push(event);
  });
  return {
    restart: toPodStat(restart),
    crash: toPodStat(crash),
    pending: toPodStat(pending),
  };
}

export function filterEventsByCategory(events: K8sEvent[], category: PodEventCategory | 'all'): K8sEvent[] {
  if (category === 'all') return events;
  return events.filter((event) => classifyPodEvent(event) === category);
}
