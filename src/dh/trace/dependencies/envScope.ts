import type { PharosServiceEdge } from '../contract';

/**
 * Virtual / database node names that are not an environment-specific db.name.
 * Keep them on the fallback graph; dropping them would hide real unknown/redis.
 */
const GENERIC_PEERS = new Set(['user', 'unknown', 'redis', 'other_sql']);

/**
 * Tokens from a CLIENT span_name that can match service_graph `server` (db.name).
 *
 * Mongo: `find turms-config-pre.groupType` → `turms-config-pre`
 * SQL:   `SELECT turms.t_chatroom_admin` → `turms`
 *
 * Split on whitespace / `/` and then `.`. Do **not** split on `-`, or `turms`
 * would match `turms-config-pre` and keep a mixed-in mysql edge for the wrong reason.
 */
export function spanNamePeerTokens(spanName: string): string[] {
  const tokens: string[] = [];
  spanName.split(/[\s/]+/).forEach((part) => {
    const trimmed = part.trim();
    if (!trimmed) return;
    tokens.push(trimmed);
    trimmed.split('.').forEach((bit) => {
      if (bit && bit !== trimmed) tokens.push(bit);
    });
  });
  return tokens;
}

export function peerTokensFromSpanNames(spanNames: string[]): Set<string> {
  const tokens = new Set<string>();
  spanNames.forEach((name) => {
    spanNamePeerTokens(name).forEach((token) => tokens.add(token));
  });
  return tokens;
}

/**
 * Drop database / virtual_node peers whose `server` (or client) is not in this
 * environment's CLIENT span_name tokens. RPC edges stay: without service_graph
 * env dimensions they cannot be split, and same-named RPC peers are the same string.
 *
 * Used only while `traces_service_graph_*` still lacks client_/server_ env labels.
 */
export function filterEdgesByPeerTokens(edges: PharosServiceEdge[], focusService: string, tokens: Set<string>): PharosServiceEdge[] {
  if (!focusService) return edges;
  return edges.filter((edge) => {
    const peer = edge.client === focusService ? edge.server : edge.server === focusService ? edge.client : '';
    if (!peer) return false;
    if (edge.connectionType !== 'database' && edge.connectionType !== 'virtual_node') return true;
    if (GENERIC_PEERS.has(peer.toLowerCase())) return true;
    return tokens.has(peer);
  });
}
