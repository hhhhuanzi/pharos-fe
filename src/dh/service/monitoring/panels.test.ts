import { buildSectionQueries, MONITORING_SECTIONS, WORKLOAD_SECTION } from './panels';
import { MIDDLEWARE_SECTION } from './sections/middleware';
import { NODE_SECTION } from './sections/node';
import { SUMMARY_SECTION } from './sections/summary';
import { TRAFFIC_SECTION } from './sections/traffic';

const scope = { service: 'rome-sec-admin', cluster: 'k8s-rome-sec-test' } as const;

function queryOf(section: typeof WORKLOAD_SECTION, panelId: string, refId: string, rateWindow = '5m', rangeWindow = '1h'): string {
  const queries = buildSectionQueries(section, scope, rateWindow, rangeWindow);
  const hit = queries.find((item) => item.panelId === panelId && item.refId === refId);
  if (!hit) throw new Error(`missing target ${panelId}.${refId}`);
  return hit.query;
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

  it('opens all monitoring sections by default', () => {
    expect(MONITORING_SECTIONS.map((section) => section.id)).toEqual(['summary', 'traffic', 'workload', 'replicas', 'jvm', 'node', 'middleware']);
    expect(MONITORING_SECTIONS.filter((section) => section.defaultOpen).map((section) => section.id)).toEqual([
      'summary',
      'traffic',
      'workload',
      'replicas',
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

describe('namespace is never a PromQL matcher', () => {
  it('does not interpolate namespace even when the page knows one', () => {
    const queries = buildSectionQueries(WORKLOAD_SECTION, { ...scope, namespace: 'rome-sec' }, '5m');
    queries.forEach((item) => {
      expect(item.query).not.toContain('namespace=');
      expect(item.query).not.toContain('pod=~');
    });
  });
});

describe('summary stats', () => {
  it('reads QPS / error rate / P95 from spanmetrics over the selected window, in milliseconds', () => {
    expect(queryOf(SUMMARY_SECTION, 'summary_traffic', 'qps', '5m', '1h')).toBe(
      'sum(rate(traces_span_metrics_calls_total{service_name="rome-sec-admin"}[1h]))',
    );
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

  it('does not put the business namespace on OTel HTTP matchers', () => {
    const queries = buildSectionQueries(TRAFFIC_SECTION, { ...scope, namespace: 'rome-sec' }, '5m');
    const http = queries.find((item) => item.panelId === 'traffic_http_status');
    expect(http?.query).not.toContain('namespace="rome-sec"');
  });
});

describe('label contract', () => {
  it('builds every section from service_name + cluster only: no namespace, no pod regex, no K8s service label', () => {
    MONITORING_SECTIONS.forEach((section) => {
      buildSectionQueries(section, { ...scope, namespace: 'rome-sec' }, '5m', '1h').forEach((item) => {
        expect(item.query).not.toContain('namespace=');
        expect(item.query).not.toContain('pod=~');
        expect(item.query).not.toContain('service="');
      });
    });
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
