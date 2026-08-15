const zh_CN = {
  list: {
    columns: {
      start_time: '开始时间',
      trace_id: 'Trace ID',
      operation: '入口接口',
      service: '入口服务',
      status: '状态',
      duration: '耗时',
      spans: 'Span 数',
    },
    status: {
      ok: '正常',
      error: '错误',
    },
    total: '共 {{num}} 条',
    scope_hint: '统计仅基于当前 {{num}} 条结果，不代表全量',
    truncated: '结果已达查询上限，可能被截断',
    empty: '没有查询到链路',
    empty_hint: '链路数据经过采样，查不到不代表调用没有发生；可放宽时间范围或筛选条件后重试',
    no_search: '设置查询条件后点击「查询」',
    load_failed: '查询失败，请检查数据源与查询条件',
    trace_not_found: '该 Trace 不存在或已过期',
    services_breakdown: '各服务 Span 数',
    error_spans: '错误 Span：{{num}}',
    partial: '该链路不完整，有 {{num}} 个 Span 的父节点缺失',
  },
};
export default zh_CN;
