const en_US = {
  view_trace: 'View trace',
  view_trace_in: 'View trace in {{datasource}}',
  view_logs: 'View logs',
  view_logs_col: 'Logs',
  view_logs_action: 'View',
  logs_unsupported: 'Jumping to logs is only available for Jaeger',
  logs_missing_config: 'Log ES datasource and index are not configured, so the jump was not opened.',
  logs_missing_config_hint:
    'Set logDatasourceId (ES id from Datasources) and logIndexPattern (id from Log → Index Patterns) or logIndex in the n9e-dh-log-trace-config localStorage key, then refresh.',
};

export default en_US;
