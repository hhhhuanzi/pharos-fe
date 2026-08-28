import { searchTraces } from '../api';
import type { TraceResponse } from '@/pages/traceCpt/type';
import type { PharosServiceEdge } from '../contract';
import type { TracePluginType } from '../types';
import { databaseNodeNames, visibleAdjacentClients } from './hop';
import { classifyNodeKind } from './layout';
import { isGenericVirtualName } from './peerType';
import { aggregateVirtualPeerSpans, attributeHintForNode, spanMatchesVirtualNode, type MatchVirtualNodeOptions, type VirtualPeerAggregate } from './virtualPeer';

export const PEER_TRACE_LIMIT = 40;
export const PEER_CLIENT_LIMIT = 8;
const GRAPH_PEER_NODE_LIMIT = 8;

export interface VirtualPeerQueryInput {
  dataSourceId: number;
  pluginType: TracePluginType;
  clients: string[];
  nodeName: string;
  startMs: number;
  endMs: number;
  edges?: PharosServiceEdge[];
  /**
   * Services the current user may see. Callers of a shared middleware node outside this set are
   * neither queried nor aggregated. Required so an empty set (unknown visibility) means "nothing".
   */
  allowedServices: ReadonlySet<string>;
}

export interface VirtualPeerQueryResult extends VirtualPeerAggregate {
  queriedClients: string[];
  skippedClients: string[];
  fetchedTraceCount: number;
  clientErrors: Array<{ client: string; message: string }>;
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return 'query failed';
}

function matchOptions(nodeName: string, edges: PharosServiceEdge[] | undefined): MatchVirtualNodeOptions | undefined {
  if (!edges || edges.length === 0) return undefined;
  const siblings = databaseNodeNames(edges);
  siblings.delete(nodeName.trim().toLowerCase());
  return { siblingDbNames: siblings };
}

/** Mirrors what `aggregateVirtualPeerSpans` will keep, so an invisible emitter cannot pass a hint off as a hit. */
function tracesHaveMatch(traces: TraceResponse[], nodeName: string, allowedServices: ReadonlySet<string>, options?: MatchVirtualNodeOptions): boolean {
  return traces.some((trace) =>
    (trace.spans || []).some(
      (span) =>
        allowedServices.has(trace.processes?.[span.processID]?.serviceName || '') &&
        spanMatchesVirtualNode(span.tags, nodeName, { ...options, operationName: span.operationName }),
    ),
  );
}

async function searchClientTraces(input: VirtualPeerQueryInput, client: string, options?: MatchVirtualNodeOptions): Promise<TraceResponse[]> {
  const base = {
    data_source_id: input.dataSourceId,
    plugin_type: input.pluginType,
    service: client,
    start_time_min: input.startMs,
    start_time_max: input.endMs,
    num_traces: PEER_TRACE_LIMIT,
  };
  const hint = attributeHintForNode(input.nodeName);
  const hinted = await searchTraces({ ...base, attributes: hint || null });
  if (!hint || tracesHaveMatch(hinted, input.nodeName, input.allowedServices, options)) return hinted;
  return searchTraces({ ...base, attributes: null });
}

/**
 * Pull traces for each visible caller of a virtual node, then keep client spans that match
 * `db.system` / `peer.service` / node name. Curates key attributes; does not invent values.
 */
export async function fetchVirtualPeerMeta(input: VirtualPeerQueryInput): Promise<VirtualPeerQueryResult> {
  // Narrow before capping: otherwise invisible callers eat the budget and the user's own
  // services fall outside `PEER_CLIENT_LIMIT` without ever being queried.
  const visibleClients = input.clients.filter((client) => input.allowedServices.has(client));
  const queriedClients = visibleClients.slice(0, PEER_CLIENT_LIMIT);
  const skippedClients = visibleClients.slice(PEER_CLIENT_LIMIT);
  const clientErrors: VirtualPeerQueryResult['clientErrors'] = [];
  const traces: TraceResponse[] = [];
  let anyTruncated = false;
  const options = matchOptions(input.nodeName, input.edges);

  const settled = await Promise.allSettled(queriedClients.map((client) => searchClientTraces(input, client, options)));
  settled.forEach((result, index) => {
    const client = queriedClients[index];
    if (result.status === 'rejected') {
      clientErrors.push({ client, message: errorMessage(result.reason) });
      return;
    }
    traces.push(...result.value);
    if (result.value.length >= PEER_TRACE_LIMIT) anyTruncated = true;
  });

  const aggregate = aggregateVirtualPeerSpans(traces, input.nodeName, anyTruncated, { ...options, allowedServices: input.allowedServices });
  return { ...aggregate, queriedClients, skippedClients, fetchedTraceCount: traces.length, clientErrors };
}

/**
 * Traces backfill for virtual nodes: unknown / other_sql first (type from ports or
 * db.system), then named db / redis so cards can show type + schema. Caps query cost.
 */
export async function fetchPeerMetasForGraph(input: {
  dataSourceId: number;
  pluginType: TracePluginType;
  edges: PharosServiceEdge[];
  startMs: number;
  endMs: number;
  /** Services the current user may see; nodes with no visible caller are not queried at all. */
  allowedServices: ReadonlySet<string>;
}): Promise<Map<string, VirtualPeerQueryResult>> {
  const virtualIds: string[] = [];
  const seen = new Set<string>();
  input.edges.forEach((edge) => {
    [edge.client, edge.server].forEach((id) => {
      if (seen.has(id)) return;
      seen.add(id);
      if (classifyNodeKind(id, input.edges) === 'virtual' && id.toLowerCase() !== 'user') virtualIds.push(id);
    });
  });

  const generic = virtualIds.filter((id) => isGenericVirtualName(id));
  const rest = virtualIds.filter((id) => !isGenericVirtualName(id));
  const targets = [...new Set([...generic, ...rest])].slice(0, GRAPH_PEER_NODE_LIMIT);
  const results = new Map<string, VirtualPeerQueryResult>();
  if (targets.length === 0) return results;

  const settled = await Promise.allSettled(
    targets.map((nodeName) =>
      fetchVirtualPeerMeta({
        dataSourceId: input.dataSourceId,
        pluginType: input.pluginType,
        clients: visibleAdjacentClients(nodeName, input.edges, input.allowedServices),
        nodeName,
        startMs: input.startMs,
        endMs: input.endMs,
        edges: input.edges,
        allowedServices: input.allowedServices,
      }),
    ),
  );
  settled.forEach((result, index) => {
    if (result.status !== 'fulfilled') return;
    results.set(targets[index], result.value);
  });
  return results;
}
