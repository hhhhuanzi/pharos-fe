import { buildPromRatio } from '../../series';
import { SPANMETRICS_CALLS_CANDIDATES, SPANMETRICS_DURATION_MS_CANDIDATES, spanmetricsErrorMatcher } from '../../spanmetrics';
import type { MonitoringPanelDef, MonitoringSectionDef } from '../panels';
import { otelJobMatcher, spanmetricsMatcher, type MonitoringScope } from '../selectors';

const CALLS = SPANMETRICS_CALLS_CANDIDATES[0];
const DURATION_MS_BUCKET = SPANMETRICS_DURATION_MS_CANDIDATES[0];
const HTTP_DURATION_COUNT = 'http_server_request_duration_seconds_count';
const HTTP_DURATION_BUCKET = 'http_server_request_duration_seconds_bucket';

function spanQps(scope: MonitoringScope, window: string): string {
  return `sum(rate(${CALLS}${spanmetricsMatcher(scope)}[${window}]))`;
}

function spanErrorRate(scope: MonitoringScope, window: string): string {
  const total = spanQps(scope, window);
  const failed = `sum(rate(${CALLS}${spanmetricsMatcher(scope, [spanmetricsErrorMatcher()])}[${window}]))`;
  return buildPromRatio(failed, total);
}

function spanQuantileMs(scope: MonitoringScope, window: string, q: number): string {
  return `histogram_quantile(${q}, sum by (le) (rate(${DURATION_MS_BUCKET}${spanmetricsMatcher(scope)}[${window}])))`;
}

function qpsPanel(): MonitoringPanelDef {
  return {
    id: 'traffic_qps',
    titleKey: 'monitoring.panel.qps',
    unit: 'ops',
    span: 8,
    targets: [{ refId: 'qps', build: (scope, rateWindow) => spanQps(scope, rateWindow) }],
  };
}

function errorPanel(): MonitoringPanelDef {
  return {
    id: 'traffic_error',
    titleKey: 'monitoring.panel.error_rate',
    unit: 'percentUnit',
    span: 8,
    targets: [{ refId: 'error_rate', build: (scope, rateWindow) => spanErrorRate(scope, rateWindow) }],
  };
}

function p95Panel(): MonitoringPanelDef {
  return {
    id: 'traffic_p95',
    titleKey: 'monitoring.panel.p95_ms',
    hintKey: 'monitoring.panel.p95_ms_hint',
    unit: 'milliseconds',
    span: 8,
    targets: [{ refId: 'p95', build: (scope, rateWindow) => spanQuantileMs(scope, rateWindow, 0.95) }],
  };
}

function httpStatusPanel(): MonitoringPanelDef {
  return {
    id: 'traffic_http_status',
    titleKey: 'monitoring.panel.http_status',
    hintKey: 'monitoring.panel.http_status_hint',
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
        nameLabels: ['http_route'],
        build: (scope, rateWindow) => `topk(8, sum by (http_route) (rate(${HTTP_DURATION_COUNT}${otelJobMatcher(scope)}[${rateWindow}])))`,
      },
    ],
  };
}

function httpSlowPanel(): MonitoringPanelDef {
  return {
    id: 'traffic_http_slow',
    titleKey: 'monitoring.panel.http_slow',
    hintKey: 'monitoring.panel.http_slow_hint',
    unit: 'seconds',
    span: 12,
    targets: [
      {
        refId: 'slow',
        nameLabels: ['http_route'],
        build: (scope, rateWindow) =>
          `topk(8, histogram_quantile(0.95, sum by (http_route, le) (rate(${HTTP_DURATION_BUCKET}${otelJobMatcher(scope)}[${rateWindow}]))))`,
      },
    ],
  };
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
        build: (scope, rateWindow) =>
          `topk(8, sum by (span_name) (rate(${CALLS}${spanmetricsMatcher(scope, ['span_kind=~"SPAN_KIND_CLIENT|CLIENT|client"'])}[${rateWindow}])))`,
      },
    ],
  };
}

/** Section 1: RED from spanmetrics (ms); HTTP route/status from OTel HTTP (seconds). */
export const TRAFFIC_SECTION: MonitoringSectionDef = {
  id: 'traffic',
  titleKey: 'monitoring.section.traffic',
  defaultOpen: true,
  panels: [qpsPanel(), errorPanel(), p95Panel(), httpStatusPanel(), httpRoutePanel(), httpSlowPanel(), clientPanel()],
};
