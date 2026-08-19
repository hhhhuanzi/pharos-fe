export interface NotifyConfigValue {
  channel_id?: number;
  channel?: string;
  template_id?: number;
  template?: string;
  params?: unknown;
  severities?: number[];
  time_ranges?: unknown[];
  label_keys?: unknown[];
  attributes?: unknown[];
}

export interface NotifyFlowLookups {
  channelNames: Record<number, string>;
  templateNames: Record<number, string>;
  teamNames: Record<number, string>;
}

export interface NotifyFlowTranslate {
  (key: string, options?: { count?: number }): string;
}

export type NotifyFlowFocus = 'filters' | 'channel' | 'template';

export type NotifyFlowNodeKind = 'source' | 'filter' | 'channel' | 'template';

export interface NotifyFlowPosition {
  x: number;
  y: number;
}

export interface NotifyFlowBaseNode {
  id: string;
  index?: number;
  position: NotifyFlowPosition;
}

export interface NotifyFlowSourceNode extends NotifyFlowBaseNode {
  id: 'source';
  kind: 'source';
  label: string;
}

export interface NotifyFlowFilterNode extends NotifyFlowBaseNode {
  kind: 'filter';
  index: number;
  lines: string[];
}

export interface NotifyFlowChannelNode extends NotifyFlowBaseNode {
  kind: 'channel';
  index: number;
  channelName: string;
  paramsSummary: string;
}

export interface NotifyFlowTemplateNode extends NotifyFlowBaseNode {
  kind: 'template';
  index: number;
  templateName: string;
}

export type NotifyFlowNode = NotifyFlowSourceNode | NotifyFlowFilterNode | NotifyFlowChannelNode | NotifyFlowTemplateNode;

export interface NotifyFlowEdge {
  id: string;
  source: string;
  target: string;
  index: number;
}

export interface NotifyFlowGraph {
  nodes: NotifyFlowNode[];
  edges: NotifyFlowEdge[];
}

export type NotifyFlowPositions = Record<string, NotifyFlowPosition>;
