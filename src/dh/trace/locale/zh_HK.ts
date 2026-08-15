const zh_HK = {
  list: {
    columns: {
      start_time: '開始時間',
      trace_id: 'Trace ID',
      operation: '入口介面',
      service: '入口服務',
      status: '狀態',
      duration: '耗時',
      spans: 'Span 數',
    },
    status: {
      ok: '正常',
      error: '錯誤',
    },
    total: '共 {{num}} 條',
    scope_hint: '統計僅基於目前 {{num}} 條結果，不代表全量',
    truncated: '結果已達查詢上限，可能被截斷',
    empty: '沒有查詢到鏈路',
    empty_hint: '鏈路資料經過取樣，查不到不代表呼叫沒有發生；可放寬時間範圍或篩選條件後重試',
    no_search: '設定查詢條件後點擊「查詢」',
    load_failed: '查詢失敗，請檢查資料來源與查詢條件',
    trace_not_found: '該 Trace 不存在或已過期',
    services_breakdown: '各服務 Span 數',
    error_spans: '錯誤 Span：{{num}}',
    partial: '該鏈路不完整，有 {{num}} 個 Span 的父節點缺失',
  },
};
export default zh_HK;
