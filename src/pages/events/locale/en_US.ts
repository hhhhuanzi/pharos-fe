const en_US = {
  title: 'Event center',
  hint: 'Global events. This release only covers Kubernetes (Prometheus kube-eventer, eventer_events_*). An empty timeline is expected without collectors.',
  refresh: 'Refresh',
  search: {
    placeholder: 'Search reason / object / namespace / service',
  },
  k8s: {
    title: 'Kubernetes events',
    hint: 'Categories come from kube-eventer reason / kind. 0 is expected without collectors. Counters have no event message.',
  },
  timeline: {
    title: 'Timeline',
    more: 'The timeline shows the latest {{count}} events; the full list is below.',
  },
  dashboard: {
    title: 'Event dashboard',
    hint: 'This release only covers Kubernetes. Other sources (logs / traces) are not wired; no placeholder data. 0 is expected without collectors.',
    open_k8s: 'Open Kubernetes events',
    search_placeholder: 'Search sources (Kubernetes / logs / traces)',
    source_empty: 'No matching sources',
  },
  sources: {
    title: 'Sources',
    hint: 'Other sources (logs / traces) are not wired yet. No placeholder data.',
    k8s: 'Kubernetes',
    k8s_desc: 'Collected stats grouped by Warning event reasons.',
    logs: 'Logs',
    logs_desc: 'Not wired yet. Search returns empty; no placeholder data.',
    traces: 'Traces',
    traces_desc: 'Not wired yet. Search returns empty; no placeholder data.',
    unavailable: 'Not connected',
  },
  section: {
    workload: 'Availability / failures',
    node: 'Cluster / nodes',
    health: 'Health overview',
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
    pending_hint: 'Includes FailedScheduling. kube-eventer has no message, so scheduling cannot be split further.',
    oom: 'OOMKilled',
    evicted: 'Evicted',
    image_pull: 'Image pull failed',
    probe: 'Probe failed',
    volume: 'Mount / volume failed',
    node_not_ready: 'Node not ready',
  },
  health: {
    warning: 'Warning',
    normal: 'Normal',
    namespaces: 'Namespaces',
    pods: 'Pods',
  },
  stats: {
    events: 'Event rows',
    pods: 'Pods',
    nodes: 'Nodes',
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
