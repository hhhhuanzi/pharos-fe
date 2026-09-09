import { FILTER_I18N, FLOW_I18N, LAYOUT, SOURCE_NODE_ID, weekdayKey } from './constants';
import { columnLayout, estimateChannelCardHeight, estimateFilterCardHeight, estimateFilterColumnWidth, estimateTemplateCardHeight, layoutChainYs, rowCardHeight } from './layout';
import type {
  NotifyConfigValue,
  NotifyFlowChannelNode,
  NotifyFlowEdge,
  NotifyFlowFilterContent,
  NotifyFlowKvChip,
  NotifyFlowFilterNode,
  NotifyFlowGraph,
  NotifyFlowLookups,
  NotifyFlowNode,
  NotifyFlowTemplateNode,
  NotifyFlowTranslate,
} from './types';

const VALUE_MAX = 36;
const TIME_PREVIEW = 2;

function asParamsRecord(params: unknown): Record<string, unknown> | undefined {
  if (params == null || typeof params !== 'object' || Array.isArray(params)) {
    return undefined;
  }
  return params as Record<string, unknown>;
}

function asIdList(value: unknown): Array<string | number> {
  if (Array.isArray(value)) {
    return value.filter((item): item is string | number => typeof item === 'string' || typeof item === 'number');
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return [value];
  }
  return [];
}

function truncate(text: string, max = VALUE_MAX): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

function sameNumberSet(actual: number[], expected: number[]): boolean {
  if (actual.length !== expected.length) return false;
  const sorted = [...actual].sort((a, b) => a - b);
  const target = [...expected].sort((a, b) => a - b);
  return sorted.every((item, i) => item === target[i]);
}

function formatClock(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value != null && typeof value === 'object' && 'format' in value) {
    const format = (value as { format?: unknown }).format;
    if (typeof format === 'function') {
      const formatted = format.call(value, 'HH:mm');
      return typeof formatted === 'string' ? formatted : '';
    }
  }
  return '';
}

function formatWeek(week: number[], t: NotifyFlowTranslate): string {
  if (week.length === 0 || week.length === 7) return '';
  if (sameNumberSet(week, [1, 2, 3, 4, 5])) return t(FLOW_I18N.workdays);
  if (sameNumberSet(week, [0, 6])) return t(FLOW_I18N.weekend);
  return [...week]
    .filter((day) => day >= 0 && day <= 6)
    .sort((a, b) => a - b)
    .map((day) => t(weekdayKey(day)))
    .join('/');
}

function formatTimeRange(item: unknown, t: NotifyFlowTranslate): string | undefined {
  if (item == null || typeof item !== 'object') return undefined;
  const rec = item as Record<string, unknown>;
  const start = formatClock(rec.start);
  const end = formatClock(rec.end);
  const week = Array.isArray(rec.week) ? rec.week.filter((day): day is number => typeof day === 'number') : [];
  const timePart = start && end ? `${start}–${end}` : start || end;
  const weekPart = formatWeek(week, t);
  const parts = [weekPart, timePart].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : undefined;
}

/** in/not in 存数组；== 等是单字符串，空格是值的一部分，不能拆。 */
export function formatTagValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).join(', ');
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  if (value == null) return '';
  return String(value);
}

export function formatKvChip(item: unknown, opKey: 'op' | 'func'): NotifyFlowKvChip | undefined {
  if (item == null || typeof item !== 'object') return undefined;
  const rec = item as Record<string, unknown>;
  const key = typeof rec.key === 'string' ? rec.key.trim() : '';
  if (!key) return undefined;
  const op = typeof rec[opKey] === 'string' && rec[opKey] ? String(rec[opKey]) : '==';
  return { key, op, value: truncate(formatTagValue(rec.value)) };
}

function formatSeverities(severities: number[] | undefined, t: NotifyFlowTranslate): string {
  if (!Array.isArray(severities) || severities.length === 0) {
    return t(FILTER_I18N.severitiesNone);
  }
  if (severities.length === 3) {
    return t(FILTER_I18N.severitiesAll);
  }
  return [...severities]
    .filter((item): item is number => typeof item === 'number')
    .sort((a, b) => a - b)
    .map((item) => `S${item}`)
    .join('/');
}

export function flattenFilterContent(content: NotifyFlowFilterContent): string[] {
  if (content.unrestricted) {
    return content.unrestrictedText ? [content.unrestrictedText] : [];
  }
  const chipTexts = content.chips.map((chip) => (chip.value ? `${chip.key} ${chip.op} ${chip.value}` : `${chip.key} ${chip.op}`));
  return [content.severity, ...content.times, ...chipTexts].filter((item): item is string => Boolean(item));
}

function isAllSeverities(severities: number[] | undefined): boolean {
  return Array.isArray(severities) && severities.length === 3;
}

/** Structured filter body: unrestricted default vs two-column rows (empty kinds omitted). */
export function formatFilterContent(config: NotifyConfigValue | undefined, t: NotifyFlowTranslate): NotifyFlowFilterContent {
  const timeLines = (config?.time_ranges ?? []).map((item) => formatTimeRange(item, t)).filter((item): item is string => Boolean(item));
  const chips = [...(config?.label_keys ?? []).map((item) => formatKvChip(item, 'op')), ...(config?.attributes ?? []).map((item) => formatKvChip(item, 'func'))].filter(
    (item): item is NotifyFlowKvChip => Boolean(item),
  );
  const hasExtras = timeLines.length > 0 || chips.length > 0;

  if (isAllSeverities(config?.severities) && !hasExtras) {
    return { unrestricted: true, unrestrictedText: t(FLOW_I18N.unrestricted), times: [], chips: [] };
  }

  const times = timeLines.slice(0, TIME_PREVIEW);
  if (timeLines.length > TIME_PREVIEW) {
    times.push(t(FLOW_I18N.timeMore, { count: timeLines.length }));
  }

  return {
    unrestricted: false,
    severity: isAllSeverities(config?.severities) ? undefined : formatSeverities(config?.severities, t),
    times,
    chips,
  };
}

/** Flattened lines for summary / tests. Default = all 3 severities and no extras. */
export function formatFilterLines(config: NotifyConfigValue | undefined, t: NotifyFlowTranslate): string[] {
  return flattenFilterContent(formatFilterContent(config, t));
}

export function formatFiltersSummary(config: NotifyConfigValue | undefined, t: NotifyFlowTranslate): string {
  return formatFilterLines(config, t).join(' · ');
}

/** Short params line: bot_name / groups / recipient teams (no tokens). */
export function formatParamsSummary(params: unknown, lookups: NotifyFlowLookups, t: NotifyFlowTranslate): string {
  const record = asParamsRecord(params);
  if (!record) return '';

  const parts: string[] = [];

  if (typeof record.bot_name === 'string' && record.bot_name.trim()) {
    parts.push(record.bot_name.trim());
  }

  const groups = asIdList(record.feishu_groups);
  if (groups.length > 0) {
    parts.push(t(FLOW_I18N.groupCount, { count: groups.length }));
  }

  const teamIds = asIdList(record.user_group_ids);
  if (teamIds.length > 0) {
    const names = teamIds.map((id) => lookups.teamNames[Number(id)]).filter((name): name is string => Boolean(name));
    if (names.length > 0) {
      parts.push(names.slice(0, 2).join(t(FLOW_I18N.nameSeparator)));
    } else {
      parts.push(t(FLOW_I18N.teamCount, { count: teamIds.length }));
    }
  }

  if (parts.length === 0) {
    const userIds = asIdList(record.user_ids);
    if (userIds.length > 0) {
      parts.push(t(FLOW_I18N.userCount, { count: userIds.length }));
    }
  }

  return parts.join(' · ');
}

function resolveChannelName(config: NotifyConfigValue, lookups: NotifyFlowLookups, t: NotifyFlowTranslate): string {
  if (typeof config.channel_id === 'number' && lookups.channelNames[config.channel_id]) {
    return lookups.channelNames[config.channel_id];
  }
  if (typeof config.channel === 'string' && config.channel.trim()) {
    return config.channel.trim();
  }
  return t(FLOW_I18N.channelUnset);
}

function resolveTemplateName(config: NotifyConfigValue, lookups: NotifyFlowLookups, t: NotifyFlowTranslate): string {
  if (typeof config.template_id === 'number' && lookups.templateNames[config.template_id]) {
    return lookups.templateNames[config.template_id];
  }
  if (typeof config.template === 'string' && config.template.trim()) {
    return config.template.trim();
  }
  return t(FLOW_I18N.templateUnset);
}

function tokenOf(index: number, keys?: Array<string | number>): string | number {
  if (keys && keys[index] != null) return keys[index];
  return index;
}

export function filterNodeId(index: number, keys?: Array<string | number>): string {
  return `filter-${tokenOf(index, keys)}`;
}

export function channelNodeId(index: number, keys?: Array<string | number>): string {
  return `channel-${tokenOf(index, keys)}`;
}

export function templateNodeId(index: number, keys?: Array<string | number>): string {
  return `template-${tokenOf(index, keys)}`;
}

export function emptyLookups(): NotifyFlowLookups {
  return { channelNames: {}, templateNames: {}, teamNames: {} };
}

export interface BuildNotifyFlowOptions {
  keys?: Array<string | number>;
}

/** Parallel fan-out: each config is source → filter → channel → template. Layout is derived, never persisted. */
export function buildNotifyFlowGraph(
  configs: NotifyConfigValue[] | undefined,
  lookups: NotifyFlowLookups,
  t: NotifyFlowTranslate,
  options?: BuildNotifyFlowOptions,
): NotifyFlowGraph {
  const list = Array.isArray(configs) ? configs : [];
  const keys = options?.keys;

  const prepared = list.map((config) => {
    const safeConfig = config ?? {};
    const content = formatFilterContent(safeConfig, t);
    const paramsSummary = formatParamsSummary(safeConfig.params, lookups, t);
    return { safeConfig, content, paramsSummary };
  });
  const columns = columnLayout(estimateFilterColumnWidth(prepared.map((item) => item.content)));
  const rowHeights = prepared.map((item) =>
    rowCardHeight(estimateFilterCardHeight(item.content, columns.filterWidth), estimateChannelCardHeight(Boolean(item.paramsSummary)), estimateTemplateCardHeight()),
  );

  const { ys, sourceY, contentHeight } = layoutChainYs(rowHeights);

  const source: NotifyFlowNode = {
    id: SOURCE_NODE_ID,
    kind: 'source',
    label: t(FLOW_I18N.sourceLabel),
    position: { x: LAYOUT.sourceX, y: sourceY },
  };

  const filters: NotifyFlowFilterNode[] = [];
  const channels: NotifyFlowChannelNode[] = [];
  const templates: NotifyFlowTemplateNode[] = [];
  const edges: NotifyFlowEdge[] = [];

  prepared.forEach((item, index) => {
    const y = ys[index];
    const filterId = filterNodeId(index, keys);
    const channelId = channelNodeId(index, keys);
    const templateId = templateNodeId(index, keys);

    filters.push({
      id: filterId,
      kind: 'filter',
      index,
      content: item.content,
      position: { x: columns.filterX, y },
    });
    channels.push({
      id: channelId,
      kind: 'channel',
      index,
      channelName: resolveChannelName(item.safeConfig, lookups, t),
      paramsSummary: item.paramsSummary,
      position: { x: columns.channelX, y },
    });
    templates.push({
      id: templateId,
      kind: 'template',
      index,
      templateName: resolveTemplateName(item.safeConfig, lookups, t),
      position: { x: columns.templateX, y },
    });

    edges.push(
      { id: `e-${tokenOf(index, keys)}-sf`, source: SOURCE_NODE_ID, target: filterId, index },
      { id: `e-${tokenOf(index, keys)}-fc`, source: filterId, target: channelId, index },
      { id: `e-${tokenOf(index, keys)}-ct`, source: channelId, target: templateId, index },
    );
  });

  return {
    nodes: [source, ...filters, ...channels, ...templates],
    edges,
    contentHeight,
    columns,
  };
}
