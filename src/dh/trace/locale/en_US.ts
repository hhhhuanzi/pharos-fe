const en_US = {
  list: {
    columns: {
      start_time: 'Start time',
      trace_id: 'Trace ID',
      operation: 'Root operation',
      service: 'Root service',
      status: 'Status',
      duration: 'Duration',
      spans: 'Spans',
    },
    status: {
      ok: 'OK',
      error: 'Error',
    },
    total: '{{num}} traces',
    scope_hint: 'Based on the {{num}} traces returned by this query only, not the full set',
    truncated: 'Result limit reached, the list is likely truncated',
    empty: 'No traces found',
    empty_hint: 'Traces are sampled, so a miss does not mean the call never happened. Try a wider time range or looser filters.',
    no_search: 'Set the query conditions and hit Query',
    load_failed: 'Query failed, check the datasource and the query conditions',
    trace_not_found: 'This trace does not exist or has expired',
    services_breakdown: 'Spans per service',
    error_spans: 'Error spans: {{num}}',
    partial: 'Partial trace: {{num}} spans have a missing parent',
  },
};
export default en_US;
