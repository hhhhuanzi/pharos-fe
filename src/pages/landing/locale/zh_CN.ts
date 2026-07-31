const zh_CN = {
  pageTitle: '欢迎使用 Pharos',
  hero: {
    badge: '企业级统一可观测平台',
    highlight: '指标 · 日志 · 链路，一个入口看清全站',
    description: '统一采集指标、日志、链路数据，告警治理、可视化大盘、智能助手开箱即用，云原生友好。',
    primaryAction: '查看文档',
    secondaryAction: '我要问 AI',
  },
  matrix: {
    headerKicker: '功能矩阵',
    headerSubtitle: '指标监控告警、日志检索分析、链路追踪三位一体，构建统一可观测平台',
    scenarioTag: '场景 · 统一告警',
    observabilityTag: '平台 · 统一观测',
    notificationTag: '触达 · 通知媒介',
    collectionTag: '数据 · 统一采集',
    integrationTag: '数据 · 统一集成',
    integrationBrowseAll: '浏览 70+ 内置集成',
    infrastructureTag: '企业服务基础设施',
    dataIngestArrow: '数据 · 统一接入',
    alertEventArrow: '告警事件',
    scenario: {
      businessGroups: {
        title: '业务组',
        description: '多租户与资源隔离',
      },
      alertGovernance: {
        title: '告警治理',
        description: '规则 · 屏蔽 · 订阅',
      },
      eventHistory: {
        title: '历史事件',
        description: '全量事件回溯分析',
      },
      aiAssistant: {
        title: 'AI 智能化',
        description: '大模型驱动的智能化能力',
      },
    },
    observability: {
      dashboard: '仪表盘',
      metricExplorer: '指标分析',
      logExplorer: '日志分析',
      traceExplorer: '链路分析',
      alertRules: '告警规则',
      alertMutes: '告警屏蔽',
      alertSubscribes: '告警订阅',
      objectExplorer: '监控对象',
      recordingRules: '记录规则',
    },
    collection: {
      description: 'all-in-one 开源采集器',
      footer: '统一采集 metrics / logs',
    },
    infrastructure: {
      components: '基础组件',
      microservice: '微服务',
      apiFunctions: '接口/功能',
      endpoints: '端',
      publicCloud: '公有云',
      privateCloud: '私有云',
      containers: '容器/虚机',
      devices: '设备',
      network: '网络',
    },
    notification: {
      rules: { title: '通知规则', description: '精细化分派路由' },
      templates: { title: '通知模板', description: '统一消息样式' },
      channels: { title: '通知媒介', description: '多渠道触达' },
      users: { title: '用户与团队', description: '接收人组织管理' },
    },
    footnotes: {
      scenario: ['多租户业务组隔离', '告警规则 · 屏蔽 · 订阅', 'AI 大模型辅助分析'],
      observability: '一体化可观测平台能力',
      integration: '主流开源数据源',
      notification: ['通知中心', '通知与订阅'],
    },
  },
  aiAssistant: {
    title: 'Pharos AI 智能助手',
    description: '基于大语言模型，自然语言完成平台操作、查询数据、分析告警根因。',
    capabilities: ['自然语言查询', '告警根因分析', 'PromQL / LogQL 生成', '文档智能问答'],
    action: '立即体验 AI 助手',
  },
};

export default zh_CN;
