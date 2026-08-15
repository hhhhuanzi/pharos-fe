const ja_JP = {
  list: {
    columns: {
      start_time: '開始時刻',
      trace_id: 'Trace ID',
      operation: 'ルート操作',
      service: 'ルートサービス',
      status: 'ステータス',
      duration: '所要時間',
      spans: 'Span 数',
    },
    status: {
      ok: '正常',
      error: 'エラー',
    },
    total: '{{num}} 件',
    scope_hint: '今回のクエリで取得した {{num}} 件のみに基づく集計です（全量ではありません）',
    truncated: '取得上限に達したため、結果が切り捨てられている可能性があります',
    empty: 'トレースが見つかりません',
    empty_hint: 'トレースはサンプリングされているため、見つからなくても呼び出しがなかったとは限りません。期間や条件を広げて再試行してください。',
    no_search: '検索条件を設定して「クエリ」をクリックしてください',
    load_failed: 'クエリに失敗しました。データソースと検索条件を確認してください',
    trace_not_found: 'このトレースは存在しないか、期限切れです',
    services_breakdown: 'サービス別 Span 数',
    error_spans: 'エラー Span：{{num}}',
    partial: '不完全なトレースです。親が欠落している Span が {{num}} 件あります',
  },
};
export default ja_JP;
