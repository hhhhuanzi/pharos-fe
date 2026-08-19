const zh_CN = {
  title: '事件中心',
  hint: '全局事件。本期只接 K8s（Prometheus kube-eventer，eventer_events_*）。没采集时时间轴为空，属预期。',
  refresh: '刷新',
  search: {
    placeholder: '搜索 reason / 对象 / 命名空间 / 服务',
  },
  k8s: {
    title: 'K8s 事件',
    hint: '按 kube-eventer 的 reason / kind 归类。没采集时为 0，属预期。计数没有事件正文。',
  },
  timeline: {
    title: '时间轴',
    more: '时间轴仅展示最近 {{count}} 条，完整列表见下方。',
  },
  dashboard: {
    title: '事件大盘',
    hint: '本期只接 K8s。其它来源（日志 / 链路等）尚未接入，不展示假数据。没采集时统计为 0，属预期。',
    open_k8s: '进入 K8s 事件',
    search_placeholder: '按来源搜索（Kubernetes / 日志 / 链路）',
    source_empty: '没有匹配的来源',
  },
  sources: {
    title: '事件来源',
    hint: '其它来源（日志 / 链路等）尚未接入，不展示假数据。',
    k8s: 'Kubernetes',
    k8s_desc: 'Warning 事件按 reason 归类的收集统计。',
    logs: '日志',
    logs_desc: '尚未接入，搜索结果为空，不展示假数据。',
    traces: '链路',
    traces_desc: '尚未接入，搜索结果为空，不展示假数据。',
    unavailable: '未接入',
  },
  section: {
    workload: '可用性 / 故障',
    node: '集群 / 节点',
    health: '健康概览',
  },
  filter: {
    service: '已按服务筛选：{{service}}',
    clear: '清除服务筛选',
  },
  empty: {
    timeline: '当前没有事件。没采集时为空，属预期。',
    k8s: '当前没有 K8s 事件。没采集时为空，属预期。',
    no_prometheus: '没有可用的 Prometheus 数据源',
    load_failed: '读取事件失败',
  },
  type: {
    warning: 'Warning',
    normal: 'Normal',
  },
  category: {
    all: '全部',
    restart: '重启',
    crash: 'Crash',
    pending: 'Pending',
    pending_hint: '含 FailedScheduling 等调度失败；kube-eventer 无正文，无法再拆。',
    oom: 'OOMKilled',
    evicted: '驱逐',
    image_pull: '镜像拉取失败',
    probe: '探针失败',
    volume: '挂载 / 存储失败',
    node_not_ready: '节点不可用',
  },
  health: {
    warning: 'Warning',
    normal: 'Normal',
    namespaces: '涉及命名空间',
    pods: '涉及 Pod',
  },
  stats: {
    events: '事件条数',
    pods: '涉及 Pod',
    nodes: '涉及节点',
  },
  table: {
    title: '事件列表',
    time: '时间',
    type: '类型',
    reason: '原因',
    object: '对象',
    namespace: '命名空间',
    cluster: '集群',
    count: '次数',
  },
};

export default zh_CN;
