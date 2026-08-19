const ru_RU = {
  title: 'Центр событий',
  hint: 'Глобальные события. Сейчас только Kubernetes (Prometheus kube-eventer, eventer_events_*). Пустая шкала ожидаема без сбора.',
  refresh: 'Обновить',
  search: {
    placeholder: 'Поиск: reason / объект / пространство имён / сервис',
  },
  k8s: {
    title: 'События Kubernetes',
    hint: 'Категории по reason / kind kube-eventer. 0 ожидаем без сбора. В счётчиках нет текста события.',
  },
  timeline: {
    title: 'Шкала времени',
    more: 'На шкале последние {{count}} событий; полный список ниже.',
  },
  dashboard: {
    title: 'Дашборд событий',
    hint: 'Сейчас только Kubernetes. Другие источники (логи / трейсы) не подключены, без фиктивных данных. 0 ожидаем без сбора.',
    open_k8s: 'Открыть события Kubernetes',
    search_placeholder: 'Поиск по источнику (Kubernetes / логи / трейсы)',
    source_empty: 'Нет подходящих источников',
  },
  sources: {
    title: 'Источники',
    hint: 'Другие источники (логи / трейсы) ещё не подключены. Фиктивных данных нет.',
    k8s: 'Kubernetes',
    k8s_desc: 'Сводная статистика Warning-событий по reason.',
    logs: 'Логи',
    logs_desc: 'Ещё не подключено. Поиск пустой, без фиктивных данных.',
    traces: 'Трейсы',
    traces_desc: 'Ещё не подключено. Поиск пустой, без фиктивных данных.',
    unavailable: 'Не подключено',
  },
  section: {
    workload: 'Доступность / сбои',
    node: 'Кластер / узлы',
    health: 'Обзор здоровья',
  },
  filter: {
    service: 'Фильтр по сервису: {{service}}',
    clear: 'Сбросить фильтр сервиса',
  },
  empty: {
    timeline: 'Событий пока нет. Пустая шкала ожидаема без сбора.',
    k8s: 'Событий Kubernetes пока нет. Пустая страница ожидаема без сбора.',
    no_prometheus: 'Нет доступного источника Prometheus',
    load_failed: 'Не удалось загрузить события',
  },
  type: {
    warning: 'Warning',
    normal: 'Normal',
  },
  category: {
    all: 'Все',
    restart: 'Restart',
    crash: 'Crash',
    pending: 'Pending',
    pending_hint: 'Включая FailedScheduling. У kube-eventer нет текста, поэтому планирование нельзя выделить отдельно.',
    oom: 'OOMKilled',
    evicted: 'Evicted',
    image_pull: 'Ошибка загрузки образа',
    probe: 'Сбой пробы',
    volume: 'Сбой монтирования / тома',
    node_not_ready: 'Узел недоступен',
  },
  health: {
    warning: 'Warning',
    normal: 'Normal',
    namespaces: 'Пространства имён',
    pods: 'Поды',
  },
  stats: {
    events: 'Строки',
    pods: 'Поды',
    nodes: 'Узлы',
  },
  table: {
    title: 'Список событий',
    time: 'Время',
    type: 'Тип',
    reason: 'Причина',
    object: 'Объект',
    namespace: 'Пространство имён',
    cluster: 'Кластер',
    count: 'Число',
  },
};

export default ru_RU;
