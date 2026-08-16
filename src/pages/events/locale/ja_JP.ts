const ja_JP = {
  title: 'イベントセンター',
  hint: 'グローバルイベントセンター。今期は K8s のみ（Prometheus kube-eventer、eventer_events_*）。未収集ならタイムラインは空になります。',
  refresh: '更新',
  k8s: {
    title: 'K8s イベント',
    hint: '集計は kind=Pod かつ reason が再起動 / crash / pending の既知集合にある行だけです。未収集なら 0 になります。カウンタに本文はありません。',
  },
  timeline: {
    title: 'タイムライン',
    more: 'タイムラインは直近 {{count}} 件のみ。全件は下の一覧です。',
  },
  dashboard: {
    title: 'イベントダッシュボード',
    hint: '今期は K8s のみ。ログ / トレースなど他ソースは未接続です。ダミーデータは出しません。未収集なら 0 です。',
    open_k8s: 'K8s イベントを開く',
  },
  sources: {
    title: 'ソース',
    hint: 'ログ / トレースなど他ソースは未接続です。ダミーデータは出しません。',
    k8s: 'Kubernetes',
    k8s_desc: 'Pod の再起動 / crash / pending の収集集計。',
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
  },
  stats: {
    events: 'イベント行',
    pods: '対象 Pod',
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
