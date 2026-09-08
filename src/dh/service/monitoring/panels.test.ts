import { buildSectionQueries, MONITORING_SECTIONS, WORKLOAD_SECTION } from './panels';
import { MIDDLEWARE_SECTION } from './sections/middleware';
import { NODE_SECTION } from './sections/node';
import { SUMMARY_SECTION } from './sections/summary';
import { TRAFFIC_SECTION } from './sections/traffic';

const scope = { service: 'rome-sec-admin', cluster: 'k8s-rome-sec-test' } as const;
const scoped = { service: 'rome-sec-admin', cluster: 'k8s-rome-sec-test', namespace: 'rome-sec', env: 'prod' } as const;

function queryOf(
  section: typeof WORKLOAD_SECTION,
  panelId: string,
  refId: string,
  rateWindow = '5m',
  rangeWindow = '1h',
  queryScope: typeof scope | typeof scoped = scope,
): string {
  const queries = buildSectionQueries(section, queryScope, rateWindow, rangeWindow);
  const hit = queries.find((item) => item.panelId === panelId && item.refId === refId);
  if (!hit) throw new Error(`missing target ${panelId}.${refId}`);
  return hit.query;
}

function summaryPanel(panelId: string) {
  const hit = SUMMARY_SECTION.panels.find((panel) => panel.id === panelId);
  if (!hit) throw new Error(`missing summary panel ${panelId}`);
  return hit;
}

describe('section definitions', () => {
  it('gives every target a unique batch refId within its section', () => {
    MONITORING_SECTIONS.forEach((section) => {
      const refIds = buildSectionQueries(section, scope, '5m').map((item) => item.batchRefId);
      expect(new Set(refIds).size).toBe(refIds.length);
    });
  });

  it('packs the whole section into one batch', () => {
    expect(buildSectionQueries(WORKLOAD_SECTION, scope, '5m')).toHaveLength(9);
  });

  it('orders sections as symptom first, then causes from the service outwards', () => {
    expect(MONITORING_SECTIONS.map((section) => section.id)).toEqual(['summary', 'traffic', 'replicas', 'workload', 'jvm', 'node', 'middleware']);
  });

  it('keeps the sections that can be empty below the ones every service fills', () => {
    const indexOf = (id: string) => MONITORING_SECTIONS.findIndex((section) => section.id === id);
    // JVM is empty without a Java probe, middleware is empty for everyone this period.
    expect(indexOf('jvm')).toBeGreaterThan(indexOf('workload'));
    expect(indexOf('middleware')).toBe(MONITORING_SECTIONS.length - 1);
  });

  it('opens all monitoring sections by default', () => {
    expect(MONITORING_SECTIONS.filter((section) => section.defaultOpen).map((section) => section.id)).toEqual([
      'summary',
      'traffic',
      'replicas',
      'workload',
      'jvm',
      'node',
      'middleware',
    ]);
  });

  it('issues no queries for the middleware empty state', () => {
    expect(buildSectionQueries(MIDDLEWARE_SECTION, scope, '5m')).toEqual([]);
    expect(MIDDLEWARE_SECTION.emptyKey).toBeTruthy();
  });
});

describe('container CPU panel', () => {
  it('rates usage per pod and reads request / limit from kube-state-metrics', () => {
    expect(queryOf(WORKLOAD_SECTION, 'container_cpu', 'usage')).toBe(
      'sum by (pod) (rate(container_cpu_usage_seconds_total{cluster="k8s-rome-sec-test",container="rome-sec-admin"}[5m]))',
    );
    expect(queryOf(WORKLOAD_SECTION, 'container_cpu', 'request')).toBe(
      'max(kube_pod_container_resource_requests{cluster="k8s-rome-sec-test",container="rome-sec-admin",resource="cpu"})',
    );
    expect(queryOf(WORKLOAD_SECTION, 'container_cpu', 'limit')).toContain('kube_pod_container_resource_limits');
  });

  it('divides throttled periods by all periods, keeping pods that were never throttled', () => {
    const throttled = 'sum by (pod) (rate(container_cpu_cfs_throttled_periods_total{cluster="k8s-rome-sec-test",container="rome-sec-admin"}[5m]))';
    const periods = 'sum by (pod) (rate(container_cpu_cfs_periods_total{cluster="k8s-rome-sec-test",container="rome-sec-admin"}[5m]))';
    expect(queryOf(WORKLOAD_SECTION, 'container_cpu_throttling', 'ratio')).toBe(`(${throttled} or (${periods} * 0)) / ${periods}`);
  });
});

describe('container memory panel', () => {
  it('uses working set, which is what the OOM killer looks at', () => {
    expect(queryOf(WORKLOAD_SECTION, 'container_memory', 'working_set')).toBe(
      'sum by (pod) (container_memory_working_set_bytes{cluster="k8s-rome-sec-test",container="rome-sec-admin"})',
    );
    expect(queryOf(WORKLOAD_SECTION, 'container_memory', 'limit')).toContain('resource="memory"');
  });
});

describe('container network panel', () => {
  it('derives the pod set instead of matching pod names, and drops the host interface', () => {
    const query = queryOf(WORKLOAD_SECTION, 'container_network', 'receive');
    expect(query).toBe(
      'sum by (pod) (rate(container_network_receive_bytes_total{cluster="k8s-rome-sec-test",id!="/"}[5m]) ' +
        'and on (pod) (max by (pod) (container_memory_working_set_bytes{cluster="k8s-rome-sec-test",container="rome-sec-admin"})))',
    );
    expect(query).not.toContain('pod=~');
    expect(queryOf(WORKLOAD_SECTION, 'container_network', 'transmit')).toContain('container_network_transmit_bytes_total');
  });
});

describe('namespace is a PromQL matcher for kube-state / cadvisor', () => {
  it('binds the current environment namespace so pre and prod are not summed together', () => {
    expect(queryOf(WORKLOAD_SECTION, 'container_cpu', 'usage', '5m', '1h', scoped)).toBe(
      'sum by (pod) (rate(container_cpu_usage_seconds_total{cluster="k8s-rome-sec-test",namespace="rome-sec",container="rome-sec-admin"}[5m]))',
    );
    expect(queryOf(SUMMARY_SECTION, 'summary_ready', 'ready', '5m', '1h', scoped)).toContain(
      'kube_deployment_status_replicas_ready{cluster="k8s-rome-sec-test",namespace="rome-sec",deployment="rome-sec-admin"}',
    );
    buildSectionQueries(WORKLOAD_SECTION, scoped, '5m').forEach((item) => {
      expect(item.query).not.toContain('pod=~');
    });
  });
});

describe('summary stats', () => {
  it('orders summary cards symptom first, the same direction as the sections below', () => {
    expect(SUMMARY_SECTION.panels.map((panel) => panel.id)).toEqual(['summary_traffic', 'summary_ready', 'summary_resource']);
    expect(SUMMARY_SECTION.panels.map((panel) => panel.titleKey)).toEqual(['monitoring.stat.traffic', 'monitoring.stat.ready', 'monitoring.stat.resource']);
    expect(SUMMARY_SECTION.panels.map((panel) => panel.targets[0]?.labelKey)).toEqual(['monitoring.stat.qps', 'monitoring.stat.ready_replicas', 'monitoring.stat.cpu_water']);
    expect(summaryPanel('summary_traffic').targets.map((target) => target.refId)).toEqual(['qps', 'error_rate', 'p95']);
    expect(
      summaryPanel('summary_ready')
        .targets.slice(2)
        .map((target) => target.refId),
    ).toEqual(['restarts', 'oom']);
    expect(summaryPanel('summary_resource').targets.map((target) => target.refId)).toEqual(['cpu_water', 'mem_water']);
  });

  it('reads QPS / error rate / P95 from spanmetrics over the selected window, in milliseconds', () => {
    expect(queryOf(SUMMARY_SECTION, 'summary_traffic', 'qps', '5m', '1h')).toBe('sum(rate(traces_span_metrics_calls_total{service_name="rome-sec-admin"}[1h]))');
    expect(queryOf(SUMMARY_SECTION, 'summary_traffic', 'error_rate', '5m', '1h')).toContain('status_code=~"STATUS_CODE_ERROR|ERROR"');
    expect(queryOf(SUMMARY_SECTION, 'summary_traffic', 'p95', '5m', '1h')).toContain('traces_span_metrics_duration_milliseconds_bucket');
    expect(queryOf(SUMMARY_SECTION, 'summary_traffic', 'p95', '5m', '1h')).not.toContain('duration_seconds');
  });

  it('marks summary traffic queries as instant so they do not need a chart step', () => {
    const qps = buildSectionQueries(SUMMARY_SECTION, scope, '5m', '1h').find((item) => item.refId === 'qps');
    expect(qps?.instant).toBe(true);
  });

  it('uses deployment for ready replicas and container for restarts / OOMKilled', () => {
    expect(queryOf(SUMMARY_SECTION, 'summary_ready', 'ready')).toContain('kube_deployment_status_replicas_ready{cluster="k8s-rome-sec-test",deployment="rome-sec-admin"}');
    expect(queryOf(SUMMARY_SECTION, 'summary_ready', 'restarts', '5m', '1h')).toContain('increase(kube_pod_container_status_restarts_total');
    expect(queryOf(SUMMARY_SECTION, 'summary_ready', 'oom')).toContain('reason="OOMKilled"');
  });

  it('declares what an empty result means for each summary metric', () => {
    const absentModeOf = (panelId: string, refId: string) => SUMMARY_SECTION.panels.find((panel) => panel.id === panelId)?.targets.find((target) => target.refId === refId)?.absent;

    // OOMKilled only publishes a series once a container was actually killed, so no series means
    // zero kills. Restarts is published at 0 for every container, so no series means no collection.
    expect(absentModeOf('summary_ready', 'oom')).toBe('zero');
    expect(absentModeOf('summary_ready', 'restarts')).toBeUndefined();
    expect(absentModeOf('summary_ready', 'ready')).toBeUndefined();
    // RED metrics exist only once the service reports spans.
    expect(summaryPanel('summary_traffic').targets.map((target) => target.absent)).toEqual(['uninstrumented', 'uninstrumented', 'uninstrumented']);
  });

  it('guards the OOM zero against a silent exporter using a sibling that is always published', () => {
    const readyPanel = summaryPanel('summary_ready');
    const oom = readyPanel.targets.find((target) => target.refId === 'oom');
    const guard = readyPanel.targets.find((target) => target.refId === oom?.absentZeroRequires);

    expect(oom?.absentZeroRequires).toBe('restarts');
    // The guard has to be a sibling in the same panel, on the same matcher, that is never itself
    // rewritten to zero — otherwise it could not prove anything.
    expect(guard).toBeDefined();
    expect(guard?.absent).toBeUndefined();
    expect(queryOf(SUMMARY_SECTION, 'summary_ready', 'restarts', '5m', '1h')).toContain('container="rome-sec-admin"');
    expect(queryOf(SUMMARY_SECTION, 'summary_ready', 'oom', '5m', '1h')).toContain('container="rome-sec-admin"');
  });

  it('computes CPU / memory water as usage over limit', () => {
    expect(queryOf(SUMMARY_SECTION, 'summary_resource', 'cpu_water', '5m', '1h')).toContain('container_cpu_usage_seconds_total');
    expect(queryOf(SUMMARY_SECTION, 'summary_resource', 'cpu_water', '5m', '1h')).toContain('resource="cpu"');
    expect(queryOf(SUMMARY_SECTION, 'summary_resource', 'mem_water')).toContain('container_memory_working_set_bytes');
  });
});

describe('traffic section', () => {
  it('keeps HTTP queries on exported_job and spanmetrics on service_name', () => {
    expect(queryOf(TRAFFIC_SECTION, 'traffic_qps', 'qps')).toContain('service_name="rome-sec-admin"');
    expect(queryOf(TRAFFIC_SECTION, 'traffic_http_status', 'status')).toContain('http_server_request_duration_seconds_count');
    expect(queryOf(TRAFFIC_SECTION, 'traffic_http_status', 'status')).toContain('exported_job=~".+/rome-sec-admin"');
    expect(queryOf(TRAFFIC_SECTION, 'traffic_client', 'client')).toContain('span_kind=~"SPAN_KIND_CLIENT|CLIENT|client"');
  });

  it('splits top and slow interfaces by SERVER span_name, not http_route', () => {
    const route = queryOf(TRAFFIC_SECTION, 'traffic_http_route', 'route');
    const slow = queryOf(TRAFFIC_SECTION, 'traffic_http_slow', 'slow');
    expect(route).toContain('sum by (span_name)');
    expect(route).toContain('span_kind=~"SPAN_KIND_SERVER|SERVER|server"');
    expect(route).not.toContain('http_route');
    expect(slow).toContain('sum by (span_name, le)');
    expect(slow).toContain('traces_span_metrics_duration_milliseconds_bucket');
    expect(slow).not.toContain('http_server_request_duration_seconds');
  });

  it('does not put the business namespace on OTel HTTP matchers', () => {
    const queries = buildSectionQueries(TRAFFIC_SECTION, scoped, '5m');
    const http = queries.find((item) => item.panelId === 'traffic_http_status');
    expect(http?.query).not.toContain('namespace="rome-sec"');
  });

  it('narrows spanmetrics to the header environment, not the K8s namespace', () => {
    expect(queryOf(TRAFFIC_SECTION, 'traffic_qps', 'qps', '5m', '1h', scoped)).toContain('deployment_environment_name="prod"');
    expect(queryOf(TRAFFIC_SECTION, 'traffic_qps', 'qps', '5m', '1h', scoped)).not.toContain('namespace=');
  });
});

describe('label contract', () => {
  it('binds namespace on K8s families and never uses a pod regex or the K8s service label', () => {
    MONITORING_SECTIONS.forEach((section) => {
      buildSectionQueries(section, scoped, '5m', '1h').forEach((item) => {
        expect(item.query).not.toContain('pod=~');
        expect(item.query).not.toContain('service="');
      });
    });
    expect(queryOf(SUMMARY_SECTION, 'summary_ready', 'desired', '5m', '1h', scoped)).toContain('namespace="rome-sec"');
    expect(queryOf(WORKLOAD_SECTION, 'container_memory', 'working_set', '5m', '1h', scoped)).toContain('namespace="rome-sec"');
    expect(queryOf(NODE_SECTION, 'node_cpu', 'cpu', '5m', '1h', scoped)).toContain('namespace="rome-sec"');
    expect(queryOf(NODE_SECTION, 'node_cpu', 'cpu', '5m', '1h', scoped)).not.toContain('node_cpu_seconds_total{cluster="k8s-rome-sec-test",namespace=');
  });
});

describe('node section', () => {
  it('joins on node via kube_pod_info and never regex-matches pod names', () => {
    const query = queryOf(NODE_SECTION, 'node_cpu', 'cpu');
    expect(query).toContain('kube_pod_info');
    expect(query).toContain('label_replace');
    expect(query).not.toContain('pod=~');
  });
});
