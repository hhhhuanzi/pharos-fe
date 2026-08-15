const zh_CN = {
  view_trace: '查看链路',
  view_trace_in: '在 {{datasource}} 中查看链路',
  view_logs: '查看日志',
  view_logs_col: '日志',
  view_logs_action: '查看',
  logs_unsupported: '仅 Jaeger 支持跳转日志',
  logs_missing_config: '尚未配置日志 ES 数据源与索引，无法跳转。',
  logs_missing_config_hint: '在 localStorage 键 n9e-dh-log-trace-config 写入 logDatasourceId（「数据源」页的 ES ID）和 logIndexPattern（「日志 → 索引模式」的 ID）或 logIndex（索引名），刷新后再点。',
};

export default zh_CN;
