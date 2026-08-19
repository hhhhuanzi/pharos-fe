export const SOURCE_NODE_ID = 'source' as const;

export const LAYOUT = {
  sourceX: 24,
  filterX: 196,
  channelX: 428,
  templateX: 644,
  rowHeight: 144,
  paddingY: 88,
} as const;

export const DRAG_CLICK_THRESHOLD = 5;

export const FILTER_I18N = {
  severitiesAll: 'notification_configuration.filters.severities_all',
  severitiesNone: 'notification_configuration.filters.severities_none',
  noExtra: 'notification_configuration.filters.no_extra',
} as const;

export const FLOW_I18N = {
  sourceLabel: 'flow.source_label',
  channelUnset: 'flow.channel_unset',
  templateUnset: 'flow.template_unset',
  nameSeparator: 'flow.name_separator',
  groupCount: 'flow.group_count',
  teamCount: 'flow.team_count',
  userCount: 'flow.user_count',
  workdays: 'flow.workdays',
  weekend: 'flow.weekend',
  timeMore: 'flow.time_more',
} as const;

export function weekdayKey(day: number): string {
  return `flow.weekday_${day}`;
}
