const ru_RU = {
  title: 'Центр событий',
  hint: 'Глобальный центр событий. Сейчас только Kubernetes (Prometheus kube-eventer, eventer_events_*). Пустая шкала ожидаема без сбора.',
  refresh: 'Обновить',
  k8s: {
    title: 'События Kubernetes',
    hint: 'Статистика считает только kind=Pod с reason из наборов restart / crash / pending. 0 ожидаем без сбора. В счётчиках нет текста события.',
  },
  timeline: {
    title: 'Шкала времени',
    more: 'На шкале последние {{count}} событий; полный список ниже.',
  },
  dashboard: {
    title: 'Дашборд событий',
    hint: 'Сейчас только Kubernetes. Другие источники (логи / трейсы) не подключены, без фиктивных данных. 0 ожидаем без сбора.',
    open_k8s: 'Открыть события Kubernetes',
  },
  sources: {
    title: 'Источники',
    hint: 'Другие источники (логи / трейсы) ещё не подключены. Фиктивных данных нет.',
    k8s: 'Kubernetes',
    k8s_desc: 'Сводная статистика restart / crash / pending подов.',
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
  },
  stats: {
    events: 'Строки',
    pods: 'Поды',
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
