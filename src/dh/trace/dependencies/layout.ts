import * as dagre from 'dagre';
import type { PharosServiceEdge } from '../contract';
import { isTypedConnection } from './graphVisual';
import { NODE_WIDTH_MIN, planNodeWidth } from './nodeWidth';
import {
  DEFAULT_VIEWPORT,
  EDGESEP,
  GRAPH_MARGIN,
  MIN_NODESEP,
  MIN_RANKSEP,
  SPACING_SQUEEZE_PASSES,
  planGraphSpacing,
  squeezeGraphSpacing,
  type GraphSpacing,
  type Viewport,
} from './spacing';

export type GraphNodeKind = 'service' | 'virtual';

export interface LaidOutNode {
  id: string;
  x: number;
  y: number;
  kind: GraphNodeKind;
  /** Dominant typed connection when `kind` is virtual; otherwise empty. */
  connectionHint: string;
  height: number;
  /** Solved per graph and equal for every card in it; see `planNodeWidth`. */
  width: number;
}

/** Floor of the solved card width, and what every graph of short names still gets. */
export const SERVICE_NODE_WIDTH = NODE_WIDTH_MIN;
/** Single-line card (service nodes, virtual nodes with no schema/destination). */
export const SERVICE_NODE_HEIGHT = 36;
/** Type + hint schema/destination. Keep in sync with the two-line node card. */
export const SERVICE_NODE_SUBTITLE_HEIGHT = 48;

export function nodeCardHeight(subtitle?: string): number {
  return subtitle ? SERVICE_NODE_SUBTITLE_HEIGHT : SERVICE_NODE_HEIGHT;
}

/**
 * Application vs inferred peer (DB / MQ / synthetic `user`).
 *
 * - RPC on either side → service.
 * - Client of database/messaging → service (an app calling middleware, even with no inbound RPC).
 * - Server-only typed sink → virtual (redis, other_sql).
 * - Client-only `virtual_node` → virtual (`user`).
 */
export function classifyNodeKind(id: string, edges: PharosServiceEdge[]): GraphNodeKind {
  let clientRpc = 0;
  let clientDatabase = 0;
  let clientMessaging = 0;
  let clientVirtual = 0;
  let serverRpc = 0;
  let serverTyped = 0;
  let clientTotal = 0;
  let serverTotal = 0;

  edges.forEach((edge) => {
    const typed = isTypedConnection(edge.connectionType);
    if (edge.client === id) {
      clientTotal += 1;
      if (!typed) clientRpc += 1;
      else if (edge.connectionType === 'database') clientDatabase += 1;
      else if (edge.connectionType === 'messaging_system') clientMessaging += 1;
      else clientVirtual += 1;
    }
    if (edge.server === id) {
      serverTotal += 1;
      if (typed) serverTyped += 1;
      else serverRpc += 1;
    }
  });

  if (clientRpc > 0 || serverRpc > 0) return 'service';
  if (clientDatabase > 0 || clientMessaging > 0) return 'service';
  if (serverTotal > 0 && clientTotal === 0 && serverTyped > 0) return 'virtual';
  if (clientTotal > 0 && serverTotal === 0 && clientVirtual === clientTotal) return 'virtual';
  return 'service';
}

export function nodeConnectionHint(id: string, edges: PharosServiceEdge[]): string {
  const counts = new Map<string, number>();
  edges.forEach((edge) => {
    if (edge.client !== id && edge.server !== id) return;
    if (!isTypedConnection(edge.connectionType)) return;
    counts.set(edge.connectionType, (counts.get(edge.connectionType) || 0) + 1);
  });
  let best = '';
  let bestN = 0;
  counts.forEach((n, type) => {
    if (n > bestN) {
      best = type;
      bestN = n;
    }
  });
  return best;
}

export interface LayoutEdgeDirection {
  from: string;
  to: string;
  /** Both directions exist in the data (A calls B and B calls A). */
  mutual: boolean;
}

function unorderedPairKey(a: string, b: string): string {
  return a < b ? `${a}\0${b}` : `${b}\0${a}`;
}

/** Unordered pairs that call each other in both directions. */
export function mutualPeerPairs(edges: PharosServiceEdge[]): Set<string> {
  const directed = new Set<string>();
  edges.forEach((edge) => {
    if (edge.client === edge.server) return;
    directed.add(`${edge.client}\0${edge.server}`);
  });
  const mutual = new Set<string>();
  directed.forEach((key) => {
    const [client, server] = key.split('\0');
    if (directed.has(`${server}\0${client}`)) mutual.add(unorderedPairKey(client, server));
  });
  return mutual;
}

/**
 * One layout direction per node pair.
 *
 * A mutual pair must not reach dagre as a 2-cycle: dagre breaks cycles by reversing whichever
 * edge its DFS hits first, so one bidirectional peer of a service ends up in the upstream
 * column and the next one in the downstream column. Collapsing the pair to a single
 * deterministic direction puts every bidirectional peer on the same side:
 * - detail view: always `focusService → peer`, so bidirectional peers join the downstream column;
 * - global view: the heavier direction wins, ties broken by name.
 *
 * The pair is drawn as one edge (see `mergeMutualEdges`), so this also fixes the drawn direction.
 */
export function layoutEdgeDirections(edges: PharosServiceEdge[], focusService?: string): LayoutEdgeDirection[] {
  const mutual = mutualPeerPairs(edges);
  const volume = new Map<string, number>();
  edges.forEach((edge) => {
    if (edge.client === edge.server) return;
    const key = `${edge.client}\0${edge.server}`;
    volume.set(key, (volume.get(key) || 0) + edge.requestCount);
  });

  const chosen = new Map<string, LayoutEdgeDirection>();
  edges.forEach((edge) => {
    if (edge.client === edge.server) return;
    const key = unorderedPairKey(edge.client, edge.server);
    if (chosen.has(key)) return;
    if (!mutual.has(key)) {
      chosen.set(key, { from: edge.client, to: edge.server, mutual: false });
      return;
    }
    const [first, second] = key.split('\0');
    let from = first;
    let to = second;
    if (focusService === first || focusService === second) {
      from = focusService;
      to = focusService === first ? second : first;
    } else if ((volume.get(`${second}\0${first}`) || 0) > (volume.get(`${first}\0${second}`) || 0)) {
      from = second;
      to = first;
    }
    chosen.set(key, { from, to, mutual: true });
  });
  return [...chosen.values()];
}

export interface RankProfile {
  /** Columns in the LR layout. */
  rankCount: number;
  /** Cards in the busiest column. */
  maxNodesPerRank: number;
}

/**
 * Rank shape of a laid-out graph. dagre decides ranking and ordering before it applies `ranksep`
 * / `nodesep`, so this is stable across a spacing change and can drive the second pass.
 */
export function rankProfile(nodes: Array<{ x: number }>): RankProfile {
  const perRank = new Map<number, number>();
  nodes.forEach((node) => {
    const rank = Math.round(node.x);
    perRank.set(rank, (perRank.get(rank) || 0) + 1);
  });
  return { rankCount: perRank.size, maxNodesPerRank: Math.max(0, ...perRank.values()) };
}

/**
 * Left-to-right layered layout via dagre (already a repo dependency). Kahn-only placement
 * stacked nodes in a grid and let bezier edges cut through cards; dagre reduces crossings
 * without adding a chart framework.
 *
 * The first pass only reveals how many ranks there are and how tall the busiest one is, which is
 * what `planGraphSpacing` needs to turn the pane size into gaps. The pass is cheap (pure math on a
 * few dozen nodes) and it is the only way to size the gaps before placement.
 *
 * The passes after that exist because the card size is the hard constraint, not the gaps: a graph
 * that would only fit at a scale where the service name is unreadable keeps giving up whitespace
 * until it fits at a readable one. Only the global graph does this — the detail topology already
 * opens at 1:1, and its gaps stay on the wider `MIN_*` floors.
 */
export function layoutServiceGraph(
  edges: PharosServiceEdge[],
  subtitles?: Record<string, string>,
  focusService?: string,
  container: Viewport = DEFAULT_VIEWPORT,
): LaidOutNode[] {
  const captions = subtitles || {};
  const names = new Set<string>();
  edges.forEach((edge) => {
    names.add(edge.client);
    names.add(edge.server);
  });
  if (names.size === 0) return [];

  const kinds = new Map<string, GraphNodeKind>();
  names.forEach((id) => kinds.set(id, classifyNodeKind(id, edges)));

  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  const applySpacing = (spacing: GraphSpacing) => {
    graph.setGraph({
      rankdir: 'LR',
      ranksep: spacing.ranksep,
      nodesep: spacing.nodesep,
      edgesep: spacing.edgesep,
      marginx: GRAPH_MARGIN,
      marginy: GRAPH_MARGIN,
    });
  };
  applySpacing({ ranksep: MIN_RANKSEP, nodesep: MIN_NODESEP, edgesep: EDGESEP });

  const setCards = (width: number) => {
    names.forEach((id) => {
      graph.setNode(id, { width, height: nodeCardHeight(captions[id]) });
    });
  };
  setCards(SERVICE_NODE_WIDTH);

  layoutEdgeDirections(edges, focusService).forEach((direction) => {
    graph.setEdge(direction.from, direction.to);
  });

  dagre.layout(graph);

  const profile = rankProfile([...names].map((id) => graph.node(id)));
  // The card is the hard constraint, so its width is solved before the gaps: a 3-rank detail graph
  // can afford to spell out a 26-character name where a 7-rank global one has to keep truncating.
  // Both graphs are measured against the same budget — the widening is only allowed to take space
  // no gap was going to get anyway, so it can never be the reason the squeeze below runs.
  const nodeWidth = planNodeWidth({ labels: [...names], rankCount: profile.rankCount, container });
  if (nodeWidth !== SERVICE_NODE_WIDTH) setCards(nodeWidth);
  let spacing = planGraphSpacing({
    container,
    rankCount: profile.rankCount,
    maxNodesPerRank: profile.maxNodesPerRank,
    nodeWidth,
    nodeHeight: SERVICE_NODE_HEIGHT,
  });
  applySpacing(spacing);
  dagre.layout(graph);

  // Only the global graph. The squeeze exists to buy card size back from the gaps, and a 1-hop
  // graph already fits at 1:1 — tightening it there spends the layout's one free variable to gain
  // nothing, collapsing six cards into a clump ringed by empty canvas with the fan-out unreadable.
  if (!focusService) {
    for (let pass = 0; pass < SPACING_SQUEEZE_PASSES; pass += 1) {
      const box = graph.graph();
      const next = squeezeGraphSpacing({
        spacing,
        bounds: { width: Number(box.width) || 0, height: Number(box.height) || 0 },
        container,
        rankCount: profile.rankCount,
        maxNodesPerRank: profile.maxNodesPerRank,
        nodeWidth,
        nodeHeight: SERVICE_NODE_HEIGHT,
      });
      if (next.ranksep === spacing.ranksep && next.nodesep === spacing.nodesep && next.edgesep === spacing.edgesep) break;
      spacing = next;
      applySpacing(spacing);
      dagre.layout(graph);
    }
  }

  return [...names].map((id) => {
    const node = graph.node(id);
    const kind = kinds.get(id) || 'service';
    const height = typeof node.height === 'number' ? node.height : nodeCardHeight(captions[id]);
    return {
      id,
      x: node.x - nodeWidth / 2,
      y: node.y - height / 2,
      kind,
      connectionHint: kind === 'virtual' ? nodeConnectionHint(id, edges) : '',
      height,
      width: nodeWidth,
    };
  });
}
