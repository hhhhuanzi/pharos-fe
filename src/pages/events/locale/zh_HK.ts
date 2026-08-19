const zh_HK = {
  title: '事件中心',
  hint: '全域事件。本期只接 K8s（Prometheus kube-eventer，eventer_events_*）。沒有採集時時間軸為空，屬預期。',
  refresh: '重新整理',
  search: {
    placeholder: '搜尋 reason / 物件 / 命名空間 / 服務',
  },
  k8s: {
    title: 'K8s 事件',
    hint: '按 kube-eventer 的 reason / kind 歸類。沒有採集時為 0，屬預期。計數沒有事件正文。',
  },
  timeline: {
    title: '時間軸',
    more: '時間軸僅展示最近 {{count}} 條，完整列表見下方。',
  },
  dashboard: {
    title: '事件大盤',
    hint: '本期只接 K8s。其它來源（日誌 / 鏈路等）尚未接入，不展示假資料。沒有採集時統計為 0，屬預期。',
    open_k8s: '進入 K8s 事件',
    search_placeholder: '按來源搜尋（Kubernetes / 日誌 / 鏈路）',
    source_empty: '沒有符合的來源',
  },
  sources: {
    title: '事件來源',
    hint: '其它來源（日誌 / 鏈路等）尚未接入，不展示假資料。',
    k8s: 'Kubernetes',
    k8s_desc: 'Warning 事件按 reason 歸類的收集統計。',
    logs: '日誌',
    logs_desc: '尚未接入，搜尋結果為空，不展示假資料。',
    traces: '鏈路',
    traces_desc: '尚未接入，搜尋結果為空，不展示假資料。',
    unavailable: '未接入',
  },
  section: {
    workload: '可用性 / 故障',
    node: '叢集 / 節點',
    health: '健康概覽',
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
    pending_hint: '含 FailedScheduling 等調度失敗；kube-eventer 無正文，無法再拆。',
    oom: 'OOMKilled',
    evicted: '驅逐',
    image_pull: '鏡像拉取失敗',
    probe: '探針失敗',
    volume: '掛載 / 儲存失敗',
    node_not_ready: '節點不可用',
  },
  health: {
    warning: 'Warning',
    normal: 'Normal',
    namespaces: '涉及命名空間',
    pods: '涉及 Pod',
  },
  stats: {
    events: '事件條數',
    pods: '涉及 Pod',
    nodes: '涉及節點',
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
