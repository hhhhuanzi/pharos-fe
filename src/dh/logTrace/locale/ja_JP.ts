const ja_JP = {
  view_trace: 'トレースを表示',
  view_trace_in: '{{datasource}} でトレースを表示',
  view_logs: 'ログを表示',
  view_logs_col: 'ログ',
  view_logs_action: '表示',
  logs_unsupported: 'ログへのジャンプは Jaeger のみ対応しています',
  logs_missing_config: 'ログの ES データソースとインデックスが未設定のため、ジャンプできません。',
  logs_missing_config_hint:
    'localStorage の n9e-dh-log-trace-config に logDatasourceId（データソース画面の ES ID）と logIndexPattern（ログ → インデックスパターンの ID）または logIndex を書き込み、再読み込みしてください。',
};

export default ja_JP;
