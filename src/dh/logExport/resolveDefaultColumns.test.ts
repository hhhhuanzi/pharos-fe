import mappingsToFields from '@/plugins/elasticsearch/utils/mappingsToFields';
import groupFields from '@/dh/fieldsSidebar/groupFields';

import { resolveDefaultColumns } from './resolveDefaultColumns';

const MAPPING = [
  '@timestamp',
  'message',
  'kubernetes.pod_name',
  'kubernetes.namespace_name',
  'kubernetes.annotations.sidecar_istio_io/status',
  'jsonPayload.dest_instance.project_id',
] as const;

describe('resolveDefaultColumns', () => {
  it('没有结果样本时：预填列 + 命中内置推荐词表的字段（不要求样本命中）', () => {
    const columns = resolveDefaultColumns({
      fieldOptions: [...MAPPING],
      popularCounts: {},
      presetColumns: ['@timestamp', 'message'],
    });
    expect(columns).toContain('@timestamp');
    expect(columns).toContain('message');
    expect(columns).toContain('kubernetes.pod_name');
    expect(columns).toContain('kubernetes.namespace_name');
    // 不命中推荐词表的业务嵌套字段，默认不应该出现
    expect(columns).not.toContain('jsonPayload.dest_instance.project_id');
  });

  it('有结果样本时：推荐字段收窄到样本里真的有值的那些，排掉 mapping 里的噪音字段', () => {
    const columns = resolveDefaultColumns({
      fieldOptions: [...MAPPING, 'kubernetes.docker_id'],
      resultFields: ['@timestamp', 'message', 'kubernetes.pod_name'],
      popularCounts: {},
      presetColumns: ['@timestamp', 'message'],
    });
    expect(columns).toContain('kubernetes.pod_name');
    // namespace_name 命中推荐词表但样本里没出现过值，应该被收窄掉
    expect(columns).not.toContain('kubernetes.namespace_name');
    expect(columns).not.toContain('kubernetes.docker_id');
  });

  it('用户在侧栏「显示字段」里高频用过的字段，即使样本没出现也保留（用户明确意图优先）', () => {
    const columns = resolveDefaultColumns({
      fieldOptions: [...MAPPING],
      resultFields: ['@timestamp', 'message'],
      popularCounts: { 'jsonPayload.dest_instance.project_id': 5 },
      presetColumns: ['@timestamp', 'message'],
    });
    expect(columns).toContain('jsonPayload.dest_instance.project_id');
  });

  it('预填列始终在结果里，且不重复', () => {
    const columns = resolveDefaultColumns({
      fieldOptions: ['@timestamp', 'message'],
      resultFields: ['@timestamp', 'message'],
      popularCounts: {},
      presetColumns: ['@timestamp', 'message'],
    });
    expect(columns).toEqual(['@timestamp', 'message']);
  });

  it('fieldOptions 为空（getFields 失败等）时至少退回预填列，不报错', () => {
    const columns = resolveDefaultColumns({
      fieldOptions: [],
      popularCounts: {},
      presetColumns: ['@timestamp', 'message'],
    });
    expect(columns).toEqual(['@timestamp', 'message']);
  });

  it('回归：mapping 还没拉回来时只有预填列，拉回来后应恢复到与字段侧栏一致的常用字段集合（不停留在临时兜底值上）', () => {
    // 复现用户反馈的「常用字段对不上」场景：k8s-pod* 索引，侧边栏认定的常用字段
    // 有 10 个（内置推荐词表命中 + 结果样本里确实有值），LogExportModal 打开瞬间
    // getFields()（mapping）还没返回，fieldOptions 是空数组——这一刻的默认列
    // 只能是强制预填列（2 个），这是设计上允许的短暂中间态，不是最终结果。
    const K8S_MAPPING = [
      '@timestamp',
      'time',
      'log',
      'message',
      'kubernetes.labels.app',
      'kubernetes.labels.component',
      'cluster',
      'kubernetes.container_name',
      'kubernetes.host',
      'kubernetes.namespace_name',
      'kubernetes.pod_name',
      'kubernetes.annotations.sidecar_istio_io/status',
    ] as const;
    const RESULT_SAMPLE = [
      '@timestamp',
      'time',
      'log',
      'kubernetes.labels.app',
      'kubernetes.labels.component',
      'cluster',
      'kubernetes.container_name',
      'kubernetes.host',
      'kubernetes.namespace_name',
      'kubernetes.pod_name',
    ] as const;
    const presetColumns = ['time', 'message'];

    const whileMappingPending = resolveDefaultColumns({
      fieldOptions: [],
      resultFields: [...RESULT_SAMPLE],
      popularCounts: {},
      presetColumns,
    });
    expect(whileMappingPending).toEqual(presetColumns);

    const afterMappingLoaded = resolveDefaultColumns({
      fieldOptions: [...K8S_MAPPING],
      resultFields: [...RESULT_SAMPLE],
      popularCounts: {},
      presetColumns,
    });
    // 拉回 mapping 后应该覆盖到样本里全部 10 个「有值 + 命中推荐词表」的字段，
    // 与字段侧栏「常用字段」分组的判定口径完全一致（同一个 groupFields()）
    RESULT_SAMPLE.forEach((field) => expect(afterMappingLoaded).toContain(field));
    // mapping 里存在但样本没出现值的噪音字段、以及未命中推荐词表的业务字段仍应被排除
    expect(afterMappingLoaded).not.toContain('kubernetes.annotations.sidecar_istio_io/status');
    expect(afterMappingLoaded.length).toBeGreaterThan(whileMappingPending.length);
  });

  it('回归（真实根因，非「mapping 时序」）：ES _mapping 响应挂在 _doc 下时，fieldOptions 要用 mappingsToFields() 真实解析而不是手写数组，否则「常用字段」会一直卡在预填列数量', () => {
    // 用户两轮真实环境复测证伪了「mapping 还没拉回来」这个假设：弹窗已经等了很久
    // （进度条都到 20000/43473 了），摘要仍然定格在「常用字段（2 个）」。真正原因是
    // getFields()（导出弹窗用）底层调的 mappingsToFields() 曾经只认 ES `_mapping`
    // 响应里 `doc`/`properties` 两种 properties 挂载位置，唯独不认 `_doc`——而字段
    // 侧栏走的 getFullFields()/mappingsToFullFields() 早就兼容 `_doc`，同一份 mapping
    // 在两个函数下解析出的字段集合并不一致，这才是「侧栏 9 个、导出弹窗 2 个」的根因，
    // 不是任何异步时序问题。这里直接用 mappingsToFields() 解析一份 `_doc` 挂载的真实
    // 截图字段名 mapping，模拟 LogExportModal.tsx 里 `getFields().then(res => setFieldOptions(...))`
    // 的真实数据来源，而不是像上面几个用例一样手写 `fieldOptions` 数组。
    const K8S_POD_MAPPING_WITH_DOC_TYPE = {
      'k8s-pod-2026.08.09': {
        mappings: {
          _doc: {
            properties: {
              '@timestamp': { type: 'date' },
              time: { type: 'date' },
              log: { type: 'text' },
              cluster: { type: 'keyword' },
              kubernetes: {
                properties: {
                  container_name: { type: 'keyword' },
                  host: { type: 'keyword' },
                  namespace_name: { type: 'keyword' },
                  pod_name: { type: 'keyword' },
                  labels: { properties: { app: { type: 'keyword' } } },
                },
              },
            },
          },
        },
      },
    };
    const RESULT_SAMPLE = ['@timestamp', 'time', 'log', 'cluster', 'kubernetes.container_name', 'kubernetes.host', 'kubernetes.namespace_name', 'kubernetes.pod_name', 'kubernetes.labels.app'] as const;
    const presetColumns = ['time', 'message'];

    const fieldOptions = mappingsToFields(K8S_POD_MAPPING_WITH_DOC_TYPE as any);
    const columns = resolveDefaultColumns({
      fieldOptions,
      resultFields: [...RESULT_SAMPLE],
      popularCounts: {},
      presetColumns,
    });

    RESULT_SAMPLE.forEach((field) => expect(columns).toContain(field));
    // 9 个结果样本字段 + presetColumns 里未与样本重复的 'message'（强制预填，不参与样本过滤）
    expect(columns.length).toBe(RESULT_SAMPLE.length + 1);
  });

  it('结构性保证（不依赖任何关于两条 mapping 请求链路是否一致的假设）：给同一份 fields/resultFields/popularCounts，resolveDefaultColumns() 的常用字段集合与字段侧栏 groupFields() 的 popular 分组完全一致', () => {
    // 用户最新一轮反馈的真实截图字段名（9 个）：侧边栏「常用字段」正常显示这 9 个，
    // 导出弹窗 Tooltip 却只显示「@timestamp、message」（= presetColumns，即 groups.popular
    // 为空）。这里不再假设两条链路各自解析出的 fieldOptions 是否一致——直接喂同一份
    // fields/resultFields/popularCounts 给 groupFields()（侧边栏用的判定函数）与
    // resolveDefaultColumns()（导出弹窗用的判定函数），断言两者算出的「常用字段」
    // 名称集合必须完全相等。只要这个测试通过，就证明「判定逻辑本身」没有分歧，
    // 任何未来出现的数字不一致都只能是两边拿到的输入（fields/resultFields）不同，
    // 而不是算法分歧——这也是本轮改为 ctx.indexFields 复用同一个数组的价值所在。
    const SCREENSHOT_FIELDS = ['log', '@timestamp', 'time', 'kubernetes.labels.app', 'cluster', 'kubernetes.container_name', 'kubernetes.host', 'kubernetes.namespace_name', 'kubernetes.pod_name'] as const;
    const fieldOptions = [...SCREENSHOT_FIELDS, 'kubernetes.annotations.sidecar_istio_io/status', 'message'];
    const resultFields = [...SCREENSHOT_FIELDS];
    const popularCounts = {};
    const presetColumns = ['@timestamp', 'message'];

    const sidebarPopularNames = groupFields({
      fields: fieldOptions.map((field) => ({ field, indexable: true, type: 'string' })),
      popularCounts,
      resultFields,
    }).popular.map((item) => item.field);

    const exportColumns = resolveDefaultColumns({ fieldOptions, resultFields, popularCounts, presetColumns });

    // 侧边栏「常用字段」应该是这 9 个真实字段（不含未命中推荐词表的 annotations 字段）
    expect(sidebarPopularNames.sort()).toEqual([...SCREENSHOT_FIELDS].sort());
    // 导出弹窗的默认列 = presetColumns ∪ 侧边栏那份 popular，两者取并集去重后应该相等
    expect(exportColumns.sort()).toEqual(Array.from(new Set([...presetColumns, ...sidebarPopularNames])).sort());
    // 明确验证：不应该退化成本轮 bug 报告里那个「只剩 @timestamp、message 两个」的错误结果
    expect(exportColumns.length).not.toBe(presetColumns.length);
    SCREENSHOT_FIELDS.forEach((field) => expect(exportColumns).toContain(field));
  });
});
