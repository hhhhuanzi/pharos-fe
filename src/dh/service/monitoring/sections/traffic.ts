import { buildPromRatio } from '../../series';
import { SPANMETRICS_CALLS_CANDIDATES } from '../../spanmetrics';
import type { MonitoringPanelDef, MonitoringSectionDef } from '../panels';
import { otelJobMatcher, spanmetricsMatcher, type MonitoringScope } from '../selectors';

const CALLS = SPANMETRICS_CALLS_CANDIDATES[0];
const HTTP_DURATION_COUNT = 'http_server_request_duration_seconds_count';
const HTTP_DURATION_BUCKET = 'http_server_request_duration_seconds_bucket';
const HTTP_5XX = 'http_response_status_code=~"5.."';

function httpQpsByPod(scope: MonitoringScope, window: string): string {
  return `sum by (exported_instance) (rate(${HTTP_DURATION_COUNT}${otelJobMatcher(scope)}[${window}]))`;
}

function httpErrorRate(scope: MonitoringScope, window: string, by?: string): string {
  const failed = by
    ? `sum by (${by}) (rate(${HTTP_DURATION_COUNT}${otelJobMatcher(scope, [HTTP_5XX])}[${window}]))`
    : `sum(rate(${HTTP_DURATION_COUNT}${otelJobMatcher(scope, [HTTP_5XX])}[${window}]))`;
  const total = by ? `sum by (${by}) (rate(${HTTP_DURATION_COUNT}${otelJobMatcher(scope)}[${window}]))` : `sum(rate(${HTTP_DURATION_COUNT}${otelJobMatcher(scope)}[${window}]))`;
  return buildPromRatio(failed, total);
}

function httpP95Ms(scope: MonitoringScope, window: string, by: string): string {
  return `histogram_quantile(0.95, sum by (${by}) (rate(${HTTP_DURATION_BUCKET}${otelJobMatcher(scope)}[${window}]))) * 1000`;
}

/**
 * Spanmetrics has no pod dimension (`resource_metrics_key_attributes` drops it). HTTP metrics
 * keep `exported_instance` (`<ns>.<pod>.<service>`), the same per-replica key JVM uses.
 * All for QPS is summed in the browser so it equals the pod lines. Error rate and P95 are not
 * additive — those All series are queried as the combined HTTP ratio / quantile.
 */
function qpsPanel(): MonitoringPanelDef {
  return {
    id: 'traffic_qps',
    titleKey: 'monitoring.panel.qps',
    hintKey: 'monitoring.panel.red_http_hint',
    unit: 'ops',
    span: 12,
    deriveAll: 'sum',
    targets: [
      {
        refId: 'qps',
        nameLabels: ['exported_instance'],
        nameRewrite: 'exportedInstancePod',
        build: (scope, rateWindow) => httpQpsByPod(scope, rateWindow),
      },
    ],
  };
}

function errorPanel(): MonitoringPanelDef {
  return {
    id: 'traffic_error',
    titleKey: 'monitoring.panel.error_rate',
    hintKey: 'monitoring.panel.red_http_hint',
    unit: 'percentUnit',
    span: 12,
    targets: [
      {
        refId: 'all',
        nameKey: 'monitoring.legend.all',
        emphasis: 'all',
        build: (scope, rateWindow) => httpErrorRate(scope, rateWindow),
      },
      {
        refId: 'pods',
        nameLabels: ['exported_instance'],
        nameRewrite: 'exportedInstancePod',
        build: (scope, rateWindow) => httpErrorRate(scope, rateWindow, 'exported_instance'),
      },
    ],
  };
}

function p95Panel(): MonitoringPanelDef {
  return {
    id: 'traffic_p95',
    titleKey: 'monitoring.panel.p95_ms',
    hintKey: 'monitoring.panel.red_http_hint',
    unit: 'milliseconds',
    span: 12,
    targets: [
      {
        refId: 'all',
        nameKey: 'monitoring.legend.all',
        emphasis: 'all',
        build: (scope, rateWindow) => httpP95Ms(scope, rateWindow, 'le'),
      },
      {
        refId: 'pods',
        nameLabels: ['exported_instance'],
        nameRewrite: 'exportedInstancePod',
        build: (scope, rateWindow) => httpP95Ms(scope, rateWindow, 'exported_instance, le'),
      },
    ],
  };
}

function httpStatusPanel(): MonitoringPanelDef {
  return {
    id: 'traffic_http_status',
    titleKey: 'monitoring.panel.http_status',
    unit: 'ops',
    span: 12,
    targets: [
      {
        refId: 'status',
        nameLabels: ['http_response_status_code'],
        build: (scope, rateWindow) => `sum by (http_response_status_code) (rate(${HTTP_DURATION_COUNT}${otelJobMatcher(scope)}[${rateWindow}]))`,
      },
    ],
  };
}

function httpRoutePanel(): MonitoringPanelDef {
  return {
    id: 'traffic_http_route',
    titleKey: 'monitoring.panel.http_route',
    hintKey: 'monitoring.panel.http_route_hint',
    unit: 'ops',
    span: 12,
    targets: [
      {
        refId: 'route',
        // HTTP family keeps method + route. spanmetrics `span_name` is only the method when the
        // app never set http.route (turms: GET/POST/OPTIONS) — grouping there cannot invent a path.
        nameLabels: ['http_request_method', 'http_route'],
        nameRewrite: 'httpMethodRoute',
        build: (scope, rateWindow) => `topk(8, sum by (http_request_method, http_route) (rate(${HTTP_DURATION_COUNT}${otelJobMatcher(scope)}[${rateWindow}])))`,
      },
    ],
  };
}

function httpSlowPanel(): MonitoringPanelDef {
  return {
    id: 'traffic_http_slow',
    titleKey: 'monitoring.panel.http_slow',
    hintKey: 'monitoring.panel.http_slow_hint',
    unit: 'milliseconds',
    span: 12,
    targets: [
      {
        refId: 'slow',
        nameLabels: ['http_request_method', 'http_route'],
        nameRewrite: 'httpMethodRoute',
        build: (scope, rateWindow) =>
          `topk(8, histogram_quantile(0.95, sum by (http_request_method, http_route, le) (rate(${HTTP_DURATION_BUCKET}${otelJobMatcher(scope)}[${rateWindow}])))) * 1000`,
      },
    ],
  };
}

const CLIENT_KIND = 'span_kind=~"SPAN_KIND_CLIENT|CLIENT|client"';

function clientCalls(scope: MonitoringScope): string {
  return `${CALLS}${spanmetricsMatcher(scope, [CLIENT_KIND])}`;
}

function clientPanel(): MonitoringPanelDef {
  return {
    id: 'traffic_client',
    titleKey: 'monitoring.panel.client',
    hintKey: 'monitoring.panel.client_hint',
    unit: 'ops',
    span: 12,
    targets: [
      {
        refId: 'client',
        nameLabels: ['span_name'],
        // Per-step topk unions different winners across the window and grows the legend past 8.
        // Rank once on window totals, then the range query keeps only those span_names.
        windowTopk: {
          k: 8,
          by: 'span_name',
          rank: (scope, _rate, rangeWindow) => `topk(8, sum by (span_name) (increase(${clientCalls(scope)}[${rangeWindow}])))`,
        },
        build: (scope, rateWindow) => `sum by (span_name) (rate(${clientCalls(scope)}[${rateWindow}]))`,
      },
    ],
  };
}

/**
 * Two-column pairs follow the on-call scan, not the old three-across fold.
 *
 * Row 1 is the first glance: still taking traffic, and is it failing.
 * Row 2 is latency as a left-right pair (overall P95 next to the slow interfaces).
 * Row 3 attributes volume (top routes) and errors (status codes).
 * Downstream sits last — a different question ("is it someone we call") and stays half-width
 * rather than being stretched across the row or paired with P95 / errors.
 */
export const TRAFFIC_SECTION: MonitoringSectionDef = {
  id: 'traffic',
  titleKey: 'monitoring.section.traffic',
  defaultOpen: true,
  panels: [qpsPanel(), errorPanel(), p95Panel(), httpSlowPanel(), httpRoutePanel(), httpStatusPanel(), clientPanel()],
};
