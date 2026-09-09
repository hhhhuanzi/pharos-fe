import { LAYOUT, SOURCE_NODE_ID } from './constants';
import { buildNotifyFlowGraph, emptyLookups, formatFilterContent, formatFilterLines, formatFiltersSummary, formatKvChip, formatParamsSummary, formatTagValue } from './buildGraph';
import { columnLayout } from './layout';
import type { NotifyConfigValue, NotifyFlowChannelNode, NotifyFlowFilterNode, NotifyFlowLookups, NotifyFlowTemplateNode } from './types';

const MESSAGES: Record<string, string> = {
  'notification_configuration.filters.severities_all': '全部级别',
  'notification_configuration.filters.severities_none': '未勾选级别，不会匹配任何事件',
  'flow.source_label': '告警事件',
  'flow.channel_unset': '未选择媒介',
  'flow.template_unset': '未选择模板',
  'flow.name_separator': '、',
  'flow.group_count': '{{count}} 个群',
  'flow.team_count': '{{count}} 个接收团队',
  'flow.user_count': '{{count}} 个接收人',
  'flow.workdays': '工作日',
  'flow.weekend': '周末',
  'flow.time_more': '等 {{count}} 段',
  'flow.unrestricted': '不限 · 匹配全部事件',
  'flow.weekday_0': '周日',
  'flow.weekday_1': '周一',
  'flow.weekday_2': '周二',
  'flow.weekday_3': '周三',
  'flow.weekday_4': '周四',
  'flow.weekday_5': '周五',
  'flow.weekday_6': '周六',
};

function t(key: string, options?: { count?: number }) {
  const raw = MESSAGES[key] ?? key;
  if (options?.count == null) return raw;
  return raw.replace('{{count}}', String(options.count));
}

const lookups: NotifyFlowLookups = {
  channelNames: { 1: '钉钉机器人', 2: '邮件' },
  templateNames: { 10: '默认模板', 11: '恢复模板' },
  teamNames: { 100: '值班组', 101: 'SRE' },
};

const FORBIDDEN_BRANCH_WORDS = ['否则', 'else', 'XOR', 'xor'] as const;
const TECH_FILTER_KEYS = ['severities', 'time_ranges', 'label_keys', 'attributes'] as const;

describe('formatFilterLines / formatFiltersSummary', () => {
  it('默认筛选走弱化「不限」，不再输出长斜杠句', () => {
    const content = formatFilterContent({ severities: [1, 2, 3] }, t);
    expect(content).toEqual({ unrestricted: true, unrestrictedText: '不限 · 匹配全部事件', times: [], chips: [] });
    expect(formatFilterLines({ severities: [1, 2, 3] }, t)).toEqual(['不限 · 匹配全部事件']);
    expect(formatFiltersSummary({ severities: [1, 2, 3] }, t)).toBe('不限 · 匹配全部事件');
    expect(formatFiltersSummary({ severities: [1, 2, 3] }, t)).not.toContain('全部级别');
    expect(formatFiltersSummary({ severities: [1, 2, 3] }, t)).not.toContain('时段/标签/属性不限');
    for (const key of TECH_FILTER_KEYS) {
      expect(formatFilterLines({ severities: [1, 2, 3] }, t).join(' ')).not.toContain(key);
    }
  });

  it('未勾选级别且无其它条件时只保留级别行', () => {
    expect(formatFilterContent({ severities: [] }, t)).toEqual({
      unrestricted: false,
      severity: '未勾选级别，不会匹配任何事件',
      times: [],
      chips: [],
    });
    expect(formatFilterLines({}, t)).toEqual(['未勾选级别，不会匹配任何事件']);
  });

  it('全部级别但有时段时省略级别行', () => {
    const content = formatFilterContent(
      {
        severities: [1, 2, 3],
        time_ranges: [{ week: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' }],
      },
      t,
    );
    expect(content.unrestricted).toBe(false);
    expect(content.severity).toBeUndefined();
    expect(content.times).toEqual(['工作日 09:00–18:00']);
    expect(content.chips).toEqual([]);
  });

  it('单字符串 value 不按空格拆成多值；数组才用逗号拼接', () => {
    expect(formatTagValue('Default Busi Group')).toBe('Default Busi Group');
    expect(formatTagValue('Default Busi Group')).not.toContain(',');
    expect(formatTagValue(['Default', 'Busi', 'Group'])).toBe('Default, Busi, Group');
    expect(formatKvChip({ key: 'group_name', func: '==', value: 'Default Busi Group' }, 'func')).toEqual({
      key: 'group_name',
      op: '==',
      value: 'Default Busi Group',
    });
  });

  it('多条条件拆成独立 chip，标签与属性之间也是且', () => {
    const content = formatFilterContent(
      {
        severities: [1, 2, 3],
        label_keys: [
          { key: 'datasource', op: '==', value: 'es' },
          { key: 'app', op: '==', value: 'aaaa' },
          { key: 'dddd', op: 'not in', value: ['ssss'] },
        ],
        attributes: [{ key: 'group_name', func: '==', value: 'Default Busi Group' }],
      },
      t,
    );
    expect(content.chips).toEqual([
      { key: 'datasource', op: '==', value: 'es' },
      { key: 'app', op: '==', value: 'aaaa' },
      { key: 'dddd', op: 'not in', value: 'ssss' },
      { key: 'group_name', op: '==', value: 'Default Busi Group' },
    ]);
    expect(content.chips).toHaveLength(4);
  });

  it('展示具体时段/标签/属性，而不是只写个数', () => {
    const lines = formatFilterLines(
      {
        severities: [3, 1],
        time_ranges: [{ week: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' }],
        label_keys: [
          { key: 'app', op: '==', value: 'api' },
          { key: 'namespace', op: 'not in', value: 'prod staging extra-very-long-name that-keeps-going' },
        ],
        attributes: [{ key: 'cluster', func: '==', value: 'prod' }],
      },
      t,
    );
    expect(lines[0]).toBe('S1/S3');
    expect(lines).toContain('工作日 09:00–18:00');
    expect(lines).toContain('app == api');
    expect(lines.some((line) => line.startsWith('namespace not in ') && line.includes('…'))).toBe(true);
    expect(lines).toContain('cluster == prod');
    expect(lines.join(' ')).not.toContain('个时段');
    expect(lines.join(' ')).not.toContain('个标签');
  });

  it('多段时段只列前 2 段并带总数', () => {
    const lines = formatFilterLines(
      {
        severities: [1, 2, 3],
        time_ranges: [
          { week: [1, 2, 3, 4, 5], start: '09:00', end: '12:00' },
          { week: [0, 6], start: '10:00', end: '16:00' },
          { week: [3], start: '20:00', end: '22:00' },
        ],
      },
      t,
    );
    expect(lines).toContain('工作日 09:00–12:00');
    expect(lines).toContain('周末 10:00–16:00');
    expect(lines).toContain('等 3 段');
    expect(lines.some((line) => line.includes('周三'))).toBe(false);
  });
});

describe('formatParamsSummary', () => {
  it('优先 bot_name / 群 / 接收团队', () => {
    expect(
      formatParamsSummary(
        {
          bot_name: 'oncall-bot',
          feishu_groups: ['oc_1', 'oc_2'],
          user_group_ids: [100, 101],
        },
        lookups,
        t,
      ),
    ).toBe('oncall-bot · 2 个群 · 值班组、SRE');
  });

  it('团队无名称回退到数量；无 bot/群/团队时用接收人数量', () => {
    expect(formatParamsSummary({ user_group_ids: [9] }, emptyLookups(), t)).toBe('1 个接收团队');
    expect(formatParamsSummary({ user_ids: [1, 2, 3] }, emptyLookups(), t)).toBe('3 个接收人');
  });

  it('空 params / 数组形态 / 不含 token', () => {
    expect(formatParamsSummary(undefined, lookups, t)).toBe('');
    expect(formatParamsSummary({}, lookups, t)).toBe('');
    expect(formatParamsSummary([], lookups, t)).toBe('');
    expect(formatParamsSummary({ access_token: 'secret', token: 'x' }, lookups, t)).toBe('');
  });
});

describe('buildNotifyFlowGraph', () => {
  it('空数组只有起始节点，无边、无目标框', () => {
    const graph = buildNotifyFlowGraph([], lookups, t);
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0]).toMatchObject({ id: SOURCE_NODE_ID, kind: 'source', label: '告警事件' });
    expect(graph.edges).toEqual([]);
    expect(graph.columns.filterWidth).toBe(LAYOUT.filterMinWidth);
  });

  it('undefined 与空数组结果一致', () => {
    expect(buildNotifyFlowGraph(undefined, lookups, t)).toEqual(buildNotifyFlowGraph([], lookups, t));
  });

  it('N 条配置 → 1 source + N 条 filter→channel→template 链（并行扇出，无 XOR）', () => {
    const configs: NotifyConfigValue[] = [
      { channel_id: 1, template_id: 10, severities: [1, 2, 3], params: { bot_name: 'bot-a' } },
      { channel_id: 2, template_id: 11, severities: [1], params: { user_group_ids: [100] } },
    ];
    const graph = buildNotifyFlowGraph(configs, lookups, t);

    expect(graph.nodes).toHaveLength(7);
    expect(graph.edges).toHaveLength(6);
    expect(graph.nodes.filter((node) => node.kind === 'source')).toHaveLength(1);
    expect(graph.nodes.filter((node) => node.kind === 'filter')).toHaveLength(2);
    expect(graph.nodes.filter((node) => node.kind === 'channel')).toHaveLength(2);
    expect(graph.nodes.filter((node) => node.kind === 'template')).toHaveLength(2);

    const byIndex = (index: number) => graph.edges.filter((edge) => edge.index === index);
    expect(byIndex(0).map((edge) => [edge.source, edge.target])).toEqual([
      [SOURCE_NODE_ID, 'filter-0'],
      ['filter-0', 'channel-0'],
      ['channel-0', 'template-0'],
    ]);
    expect(byIndex(1).map((edge) => [edge.source, edge.target])).toEqual([
      [SOURCE_NODE_ID, 'filter-1'],
      ['filter-1', 'channel-1'],
      ['channel-1', 'template-1'],
    ]);
    expect(graph.edges.some((edge) => edge.source.startsWith('channel') && edge.target.startsWith('filter'))).toBe(false);
    expect(graph.edges.some((edge) => edge.source === 'channel-0' && edge.target === 'channel-1')).toBe(false);

    const texts = graph.nodes.flatMap((node) => {
      if (node.kind === 'source') return [node.label];
      if (node.kind === 'filter') {
        return [node.content.severity, node.content.unrestrictedText, ...node.content.times, ...node.content.chips.map((chip) => `${chip.key} ${chip.op} ${chip.value}`)];
      }
      if (node.kind === 'channel') return [node.channelName, node.paramsSummary];
      return [node.templateName];
    });
    for (const text of texts) {
      if (!text) continue;
      for (const word of FORBIDDEN_BRANCH_WORDS) {
        expect(text.toLowerCase()).not.toContain(word.toLowerCase());
      }
    }
  });

  it('筛选/媒介/模板分框；媒介框不含模板名', () => {
    const graph = buildNotifyFlowGraph(
      [
        {
          channel_id: 1,
          template_id: 10,
          severities: [1, 2, 3],
          params: { bot_name: 'oncall-bot' },
        },
      ],
      lookups,
      t,
    );
    const filter = graph.nodes.find((node): node is NotifyFlowFilterNode => node.kind === 'filter');
    const channel = graph.nodes.find((node): node is NotifyFlowChannelNode => node.kind === 'channel');
    const template = graph.nodes.find((node): node is NotifyFlowTemplateNode => node.kind === 'template');
    expect(filter?.content).toEqual({ unrestricted: true, unrestrictedText: '不限 · 匹配全部事件', times: [], chips: [] });
    expect(channel).toMatchObject({ channelName: '钉钉机器人', paramsSummary: 'oncall-bot' });
    expect(JSON.stringify(channel)).not.toContain('默认模板');
    expect(template?.templateName).toBe('默认模板');
    expect(graph.edges.every((edge) => !('label' in edge) || !edge.label)).toBe(true);
  });

  it('未选媒介/模板用占位文案；坐标从左到右且可重复调用（幂等）', () => {
    const configs: NotifyConfigValue[] = [{ severities: [1, 2, 3] }, { channel: '邮件', severities: [2] }];
    const first = buildNotifyFlowGraph(configs, lookups, t);
    const second = buildNotifyFlowGraph(configs, lookups, t);
    expect(first).toEqual(second);

    const source = first.nodes.find((node) => node.kind === 'source');
    const filters = first.nodes.filter((node): node is NotifyFlowFilterNode => node.kind === 'filter');
    const channels = first.nodes.filter((node): node is NotifyFlowChannelNode => node.kind === 'channel');
    const templates = first.nodes.filter((node): node is NotifyFlowTemplateNode => node.kind === 'template');
    expect(source && filters[0] && source.position.x < filters[0].position.x).toBe(true);
    expect(filters[0].position.x).toBe(first.columns.filterX);
    expect(channels[0].position.x).toBe(first.columns.channelX);
    expect(templates[0].position.x).toBe(first.columns.templateX);
    expect(channels[0].position.y).toBe(filters[0].position.y);
    expect(templates[0].position.y).toBe(filters[0].position.y);
    expect(filters[1].position.y).toBeGreaterThan(filters[0].position.y);
    expect(channels[1].position.y).toBe(filters[1].position.y);
    expect(templates[1].position.y).toBe(filters[1].position.y);
    expect(channels[0].channelName).toBe('未选择媒介');
    expect(templates[0].templateName).toBe('未选择模板');
    expect(channels[1].channelName).toBe('邮件');
  });

  it('可用稳定 key 生成节点 id，删除后位置不串链', () => {
    const graph = buildNotifyFlowGraph([{ severities: [1, 2, 3] }, { severities: [1] }], lookups, t, { keys: [11, 22] });
    expect(graph.nodes.map((node) => node.id)).toEqual(['source', 'filter-11', 'filter-22', 'channel-11', 'channel-22', 'template-11', 'template-22']);
  });

  it('条件多的筛选卡把下一行顶下去，列宽按最胖分支撑开', () => {
    const compact = buildNotifyFlowGraph([{ severities: [1, 2, 3] }, { severities: [1, 2, 3] }], lookups, t);
    const tall = buildNotifyFlowGraph(
      [
        {
          severities: [1, 2, 3],
          time_ranges: [{ start: '00:00', end: '00:00' }],
          label_keys: [
            { key: 'app', op: '==', value: 'api' },
            { key: 'env', op: '==', value: 'prod' },
            { key: 'layer', op: '==', value: 'workload' },
            { key: 'ident', op: '==', value: 'host-1' },
            { key: 'cluster', op: '==', value: 'c1' },
            { key: 'region', op: '==', value: 'cn' },
          ],
        },
        { severities: [1, 2, 3] },
      ],
      lookups,
      t,
    );
    const compactFilters = compact.nodes.filter((node): node is NotifyFlowFilterNode => node.kind === 'filter');
    const tallFilters = tall.nodes.filter((node): node is NotifyFlowFilterNode => node.kind === 'filter');
    expect(tallFilters[0].content.chips).toHaveLength(6);
    expect(tallFilters[1].position.y - tallFilters[0].position.y).toBeGreaterThan(compactFilters[1].position.y - compactFilters[0].position.y);
    expect(tall.contentHeight).toBeGreaterThan(compact.contentHeight);
    expect(compact.columns.filterWidth).toBe(LAYOUT.filterMinWidth);
    expect(tall.columns.filterWidth).toBeGreaterThan(compact.columns.filterWidth);
    expect(tall.columns.filterWidth).toBeLessThanOrEqual(LAYOUT.filterMaxWidth);
    expect(tall.columns.channelX).toBe(columnLayout(tall.columns.filterWidth).channelX);
  });
});
