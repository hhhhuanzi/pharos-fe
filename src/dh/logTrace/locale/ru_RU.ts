const ru_RU = {
  view_trace: 'Посмотреть трассировку',
  view_trace_in: 'Посмотреть трассировку в {{datasource}}',
  view_logs: 'Открыть логи',
  view_logs_col: 'Логи',
  view_logs_action: 'Открыть',
  logs_unsupported: 'Переход к логам доступен только для Jaeger',
  logs_missing_config: 'Источник ES и индекс логов не настроены, переход не выполнен.',
  logs_missing_config_hint:
    'Запишите logDatasourceId (ID ES на странице источников) и logIndexPattern (ID в «Логи → шаблоны индекса») или logIndex в ключ localStorage n9e-dh-log-trace-config, затем обновите страницу.',
};

export default ru_RU;
