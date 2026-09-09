export const SOURCE_NODE_ID = 'source' as const;

export const LAYOUT = {
  sourceX: 24,
  /** 告警事件列占位，筛选列从这里开始；含卡片本身和到下一列的余量。 */
  sourceSlotWidth: 172,
  channelWidth: 184,
  templateWidth: 168,
  columnGap: 40,
  /** 全是「不限」时筛选列收在这个宽度，避免空卡过窄。 */
  filterMinWidth: 200,
  /**
   * 条件再多也不超过这个宽度，避免四列被挤出常见表单可视区。
   * 24 + 172 + 360 + 40 + 184 + 40 + 168 = 988。
   */
  filterMaxWidth: 360,
  filterLabelWidth: 32,
  filterLabelGap: 8,
  rowGap: 24,
  innerRowGap: 8,
  /** 第一行外侧标题完整露出，不被画布上边缘裁切。 */
  paddingY: 32,
  titleHeight: 22,
  titleGap: 4,
  lineHeight: 22,
  chipLineHeight: 24,
  chipGap: 8,
  /** px-2(16) + 1px 双边框，估宽时别算窄了。 */
  chipPadX: 20,
  chipInnerGap: 4,
  /** 「且」按一个汉字宽估。 */
  andWidth: 12,
  cardPadding: 24,
  paramsGap: 4,
  charWidthAscii: 8,
  charWidthCjk: 12,
  canvasMaxHeight: 520,
  canvasMinHeight: 300,
} as const;

export const DRAG_CLICK_THRESHOLD = 5;

export const FILTER_I18N = {
  severitiesAll: 'notification_configuration.filters.severities_all',
  severitiesNone: 'notification_configuration.filters.severities_none',
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
  unrestricted: 'flow.unrestricted',
  rowSeverity: 'flow.row_severity',
  rowTime: 'flow.row_time',
  rowCondition: 'flow.row_condition',
  and: 'flow.and',
} as const;

export function weekdayKey(day: number): string {
  return `flow.weekday_${day}`;
}
