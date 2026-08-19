const ja_JP = {
  title: 'イベントセンター',
  hint: 'グローバルイベント。今期は K8s のみ（Prometheus kube-eventer、eventer_events_*）。未収集ならタイムラインは空になります。',
  refresh: '更新',
  search: {
    placeholder: 'reason / オブジェクト / ネームスペース / サービスで検索',
  },
  k8s: {
    title: 'K8s イベント',
    hint: 'kube-eventer の reason / kind で分類します。未収集なら 0 になります。カウンタに本文はありません。',
  },
  timeline: {
    title: 'タイムライン',
    more: 'タイムラインは直近 {{count}} 件のみ。全件は下の一覧です。',
  },
  dashboard: {
    title: 'イベントダッシュボード',
    hint: '今期は K8s のみ。ログ / トレースなど他ソースは未接続です。ダミーデータは出しません。未収集なら 0 です。',
    open_k8s: 'K8s イベントを開く',
    search_placeholder: 'ソースで検索（Kubernetes / ログ / トレース）',
    source_empty: '一致するソースがありません',
  },
  sources: {
    title: 'ソース',
    hint: 'ログ / トレースなど他ソースは未接続です。ダミーデータは出しません。',
    k8s: 'Kubernetes',
    k8s_desc: 'Warning イベントを reason で分類した収集集計。',
    logs: 'ログ',
    logs_desc: '未接続です。検索結果は空で、ダミーデータは出しません。',
    traces: 'トレース',
    traces_desc: '未接続です。検索結果は空で、ダミーデータは出しません。',
    unavailable: '未接続',
  },
  section: {
    workload: '可用性 / 障害',
    node: 'クラスタ / ノード',
    health: 'ヘルス概要',
  },
  filter: {
    service: 'サービスで絞り込み中：{{service}}',
    clear: 'サービス絞り込みを解除',
  },
  empty: {
    timeline: 'イベントはまだありません。未収集なら空になるのは想定どおりです。',
    k8s: 'K8s イベントはまだありません。未収集なら空になるのは想定どおりです。',
    no_prometheus: '利用可能な Prometheus データソースがありません',
    load_failed: 'イベントの読み込みに失敗しました',
  },
  type: {
    warning: 'Warning',
    normal: 'Normal',
  },
  category: {
    all: 'すべて',
    restart: '再起動',
    crash: 'Crash',
    pending: 'Pending',
    pending_hint: 'FailedScheduling などのスケジュール失敗を含みます。本文がないためこれ以上分割できません。',
    oom: 'OOMKilled',
    evicted: '退避',
    image_pull: 'イメージ取得失敗',
    probe: 'プローブ失敗',
    volume: 'マウント / ストレージ失敗',
    node_not_ready: 'ノード利用不可',
  },
  health: {
    warning: 'Warning',
    normal: 'Normal',
    namespaces: 'ネームスペース',
    pods: 'Pod',
  },
  stats: {
    events: 'イベント行',
    pods: '対象 Pod',
    nodes: '対象ノード',
  },
  table: {
    title: 'イベント一覧',
    time: '時刻',
    type: 'タイプ',
    reason: '理由',
    object: 'オブジェクト',
    namespace: 'ネームスペース',
    cluster: 'クラスタ',
    count: '回数',
  },
};

export default ja_JP;
