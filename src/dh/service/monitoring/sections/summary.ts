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

/**
 * All three RED numbers come from the same spanmetrics source, so an empty result is the same
 * answer for all three: no spans were ever reported. That is why they say "未接入" instead of 0 —
 * and why there is no sibling here that could act as an `absentZeroRequires` guard, unlike the
 * replica card.
 *
 * "Instrumented but idle" still shows real zeroes rather than "未接入": the calls counter keeps
 * being exported once it exists, so `rate` over a flat counter is 0, and the error ratio's
 * `or (total * 0)` in `buildPromRatio` turns "traffic but no failures" into a genuine 0% instead of
 * an empty result. P95 stays absent in that case on purpose — a percentile over no requests is
 * undefined, not zero.
 */
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
        // kube-state-metrics publishes `..._restarts_total` for every container from the moment it
        // is created, at 0, so `increase` over a container that never restarted returns 0 rather
        // than nothing. An empty result therefore means the exporter or the matcher failed, not
        // that the service is calm — which is also what makes this the guard for OOM below.
        build: (scope, _rate, rangeWindow) => `sum(increase(kube_pod_container_status_restarts_total${containerMatcher(scope)}[${rangeWindow}]))`,
      },
      {
        refId: 'oom',
        labelKey: 'monitoring.stat.oom',
        unit: 'count',
        // `kube_pod_container_status_last_terminated_reason` carries the reason as a label and is
        // only published once a container has actually terminated, so `reason="OOMKilled"` matches
        // nothing for every container that was never OOM-killed. Empty is the *healthy* case here,
        // and the healthy case must not read as a collection failure.
        absent: 'zero',
        absentZeroRequires: 'restarts',
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

/**
 * Section 0: headline numbers for the selected window. Instant queries, one batch.
 *
 * Ordered the same way the sections below are — symptom first, then cause. Traffic is what a caller
 * actually feels, replicas and resource are two of the reasons it might feel bad.
 */
export const SUMMARY_SECTION: MonitoringSectionDef = {
  id: 'summary',
  titleKey: 'monitoring.section.summary',
  defaultOpen: true,
  panels: [trafficCard(), readyCard(), resourceCard()],
};
