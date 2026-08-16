const zh_HK = {
  title: '事件中心',
  hint: '全域事件中心。本期只接 K8s（Prometheus kube-eventer，eventer_events_*）。沒有採集時時間軸為空，屬預期。',
  refresh: '重新整理',
  k8s: {
    title: 'K8s 事件',
    hint: '統計只計 kind=Pod 且 reason 落在重啟 / crash / pending 已知集合。沒有採集時為 0，屬預期。計數沒有事件正文。',
  },
  timeline: {
    title: '時間軸',
    more: '時間軸僅展示最近 {{count}} 條，完整列表見下方。',
  },
  dashboard: {
    title: '事件中心大盤',
    hint: '本期只接 K8s。其它來源（日誌 / 鏈路等）尚未接入，不展示假資料。沒有採集時統計為 0，屬預期。',
    open_k8s: '進入 K8s 事件',
  },
  sources: {
    title: '事件來源',
    hint: '其它來源（日誌 / 鏈路等）尚未接入，不展示假資料。',
    k8s: 'Kubernetes',
    k8s_desc: 'Pod 重啟 / crash / pending 的收集統計。',
  },
  filter: {
    service: '已按服務篩選：{{service}}',
    clear: '清除服務篩選',
  },
  empty: {
    timeline: '目前沒有事件。沒有採集時為空，屬預期。',
    k8s: '目前沒有 K8s 事件。沒有採集時為空，屬預期。',
    no_prometheus: '沒有可用的 Prometheus 資料來源',
    load_failed: '讀取事件失敗',
  },
  type: {
    warning: 'Warning',
    normal: 'Normal',
  },
  category: {
    all: '全部',
    restart: '重啟',
    crash: 'Crash',
    pending: 'Pending',
  },
  stats: {
    events: '事件條數',
    pods: '涉及 Pod',
  },
  table: {
    title: '事件列表',
    time: '時間',
    type: '類型',
    reason: '原因',
    object: '物件',
    namespace: '命名空間',
    cluster: '叢集',
    count: '次數',
  },
};

export default zh_HK;
