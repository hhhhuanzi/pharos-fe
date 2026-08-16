const en_US = {
  title: 'Event center',
  hint: 'Global event center. This release only covers Kubernetes (Prometheus kube-eventer, eventer_events_*). An empty timeline is expected without collectors.',
  refresh: 'Refresh',
  k8s: {
    title: 'Kubernetes events',
    hint: 'Stats count kind=Pod rows whose reason is in the restart / crash / pending sets. 0 is expected without collectors. Counters have no event message.',
  },
  timeline: {
    title: 'Timeline',
    more: 'The timeline shows the latest {{count}} events; the full list is below.',
  },
  dashboard: {
    title: 'Event dashboard',
    hint: 'This release only covers Kubernetes. Other sources (logs / traces) are not wired; no placeholder data. 0 is expected without collectors.',
    open_k8s: 'Open Kubernetes events',
  },
  sources: {
    title: 'Sources',
    hint: 'Other sources (logs / traces) are not wired yet. No placeholder data.',
    k8s: 'Kubernetes',
    k8s_desc: 'Collected stats for pod restarts / crashes / pending.',
  },
  filter: {
    service: 'Filtered by service: {{service}}',
    clear: 'Clear service filter',
  },
  empty: {
    timeline: 'No events yet. An empty timeline is expected without collectors.',
    k8s: 'No Kubernetes events yet. An empty page is expected without collectors.',
    no_prometheus: 'No Prometheus datasource available',
    load_failed: 'Failed to load events',
  },
  type: {
    warning: 'Warning',
    normal: 'Normal',
  },
  category: {
    all: 'All',
    restart: 'Restart',
    crash: 'Crash',
    pending: 'Pending',
  },
  stats: {
    events: 'Event rows',
    pods: 'Pods',
  },
  table: {
    title: 'Event list',
    time: 'Time',
    type: 'Type',
    reason: 'Reason',
    object: 'Object',
    namespace: 'Namespace',
    cluster: 'Cluster',
    count: 'Count',
  },
};

export default en_US;
