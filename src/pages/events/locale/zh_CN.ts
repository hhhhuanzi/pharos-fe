const zh_CN = {
  title: '事件中心',
  hint: '全局事件中心。本期只接 K8s（Prometheus kube-eventer，eventer_events_*）。没采集时时间轴为空，属预期。',
  refresh: '刷新',
  k8s: {
    title: 'K8s 事件',
    hint: '统计只计 kind=Pod 且 reason 落在重启 / crash / pending 已知集合。没采集时为 0，属预期。计数没有事件正文。',
  },
  timeline: {
    title: '时间轴',
    more: '时间轴仅展示最近 {{count}} 条，完整列表见下方。',
  },
  dashboard: {
    title: '事件中心大盘',
    hint: '本期只接 K8s。其它来源（日志 / 链路等）尚未接入，不展示假数据。没采集时统计为 0，属预期。',
    open_k8s: '进入 K8s 事件',
  },
  sources: {
    title: '事件来源',
    hint: '其它来源（日志 / 链路等）尚未接入，不展示假数据。',
    k8s: 'Kubernetes',
    k8s_desc: 'Pod 重启 / crash / pending 的收集统计。',
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
  },
  stats: {
    events: '事件条数',
    pods: '涉及 Pod',
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
