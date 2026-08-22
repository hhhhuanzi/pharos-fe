import { buildPromRatio } from '../../series';
import { SPANMETRICS_CALLS_CANDIDATES, SPANMETRICS_DURATION_MS_CANDIDATES, spanmetricsErrorMatcher } from '../../spanmetrics';
import type { MonitoringPanelDef, MonitoringSectionDef } from '../panels';
import { containerMatcher, spanmetricsMatcher, workloadMatcher, type MonitoringScope } from '../selectors';

const CALLS = SPANMETRICS_CALLS_CANDIDATES[0];
const DURATION_MS_BUCKET = SPANMETRICS_DURATION_MS_CANDIDATES[0];

function spanQps(scope: MonitoringScope, window: string): string {
  return `sum(rate(${CALLS}${spanmetricsMatcher(scope)}[${window}]))`;
}

function spanErrorRate(scope: MonitoringScope, window: string): string {
  const total = spanQps(scope, window);
  const failed = `sum(rate(${CALLS}${spanmetricsMatcher(scope, [spanmetricsErrorMatcher()])}[${window}]))`;
  return buildPromRatio(failed, total);
}

function spanP95Ms(scope: MonitoringScope, window: string): string {
  return `histogram_quantile(0.95, sum by (le) (rate(${DURATION_MS_BUCKET}${spanmetricsMatcher(scope)}[${window}])))`;
}

function trafficCard(): MonitoringPanelDef {
  return {
    id: 'summary_traffic',
    titleKey: 'monitoring.stat.traffic',
    hintKey: 'monitoring.stat.traffic_hint',
    kind: 'stat',
    unit: 'ops',
    span: 8,
    targets: [
      {
        refId: 'qps',
        labelKey: 'monitoring.stat.qps',
        unit: 'ops',
        absent: 'uninstrumented',
        build: (scope, _rate, rangeWindow) => spanQps(scope, rangeWindow),
      },
      {
        refId: 'error_rate',
        labelKey: 'monitoring.stat.error_rate',
        unit: 'percentUnit',
        absent: 'uninstrumented',
        build: (scope, _rate, rangeWindow) => spanErrorRate(scope, rangeWindow),
      },
      {
        refId: 'p95',
        labelKey: 'monitoring.stat.p95',
        unit: 'milliseconds',
        absent: 'uninstrumented',
        build: (scope, _rate, rangeWindow) => spanP95Ms(scope, rangeWindow),
      },
    ],
  };
}

function readyCard(): MonitoringPanelDef {
  return {
    id: 'summary_ready',
    titleKey: 'monitoring.stat.ready',
    hintKey: 'monitoring.stat.ready_hint',
    kind: 'stat',
    primaryAsPair: true,
    unit: 'count',
    span: 8,
    targets: [
      {
        refId: 'ready',
        labelKey: 'monitoring.stat.ready_replicas',
        unit: 'count',
        build: (scope) => `sum(kube_deployment_status_replicas_ready${workloadMatcher(scope)})`,
      },
      {
        refId: 'desired',
        labelKey: 'monitoring.legend.desired',
        unit: 'count',
        build: (scope) => `sum(kube_deployment_spec_replicas${workloadMatcher(scope)})`,
      },
      {
        refId: 'restarts',
        labelKey: 'monitoring.stat.restarts',
        unit: 'count',
        build: (scope, _rate, rangeWindow) => `sum(increase(kube_pod_container_status_restarts_total${containerMatcher(scope)}[${rangeWindow}]))`,
      },
      {
        refId: 'oom',
        labelKey: 'monitoring.stat.oom',
        unit: 'count',
        absent: 'zero',
        build: (scope) => `sum(kube_pod_container_status_last_terminated_reason${containerMatcher(scope, ['reason="OOMKilled"'])})`,
      },
    ],
  };
}

function resourceCard(): MonitoringPanelDef {
  return {
    id: 'summary_resource',
    titleKey: 'monitoring.stat.resource',
    hintKey: 'monitoring.stat.resource_hint',
    kind: 'stat',
    unit: 'percentUnit',
    span: 8,
    targets: [
      {
        refId: 'cpu_water',
        labelKey: 'monitoring.stat.cpu_water',
        unit: 'percentUnit',
        build: (scope, _rate, rangeWindow) => {
          const usage = `sum(rate(container_cpu_usage_seconds_total${containerMatcher(scope)}[${rangeWindow}]))`;
          const limit = `sum(kube_pod_container_resource_limits${containerMatcher(scope, ['resource="cpu"'])})`;
          return `${usage} / ${limit}`;
        },
      },
      {
        refId: 'mem_water',
        labelKey: 'monitoring.stat.mem_water',
        unit: 'percentUnit',
        build: (scope) => {
          const usage = `sum(container_memory_working_set_bytes${containerMatcher(scope)})`;
          const limit = `sum(kube_pod_container_resource_limits${containerMatcher(scope, ['resource="memory"'])})`;
          return `${usage} / ${limit}`;
        },
      },
    ],
  };
}

/** Section 0: headline numbers for the selected window. Instant queries, one batch. */
export const SUMMARY_SECTION: MonitoringSectionDef = {
  id: 'summary',
  titleKey: 'monitoring.section.summary',
  defaultOpen: true,
  panels: [trafficCard(), readyCard(), resourceCard()],
};
