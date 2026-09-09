import { monitoringSeriesName, type MonitoringNameRewrite } from './format';

/**
 * Click a legend row: isolate that series, or restore every series if it is already the only one
 * shown. Clicking a different row switches the isolated series. Never hides only the clicked row.
 */
export function isolateLegendName(focused: string | undefined, clicked: string): string | undefined {
  return focused === clicked ? undefined : clicked;
}

/** When nothing is isolated, every name is visible. */
export function isLegendNameHidden(focused: string | undefined, name: string): boolean {
  return focused != null && focused !== name;
}

/**
 * Name a plotted series. A requested `nameLabels` key that never arrived is dropped — that is how
 * an unlabeled HTTP status leftover used to become the panel title ("HTTP 状态码 QPS") in the
 * legend. Only a query that never asked for labels falls back to the panel title (the old
 * `sum(rate(...))` single line).
 */
export function resolveMonitoringSeriesName(
  metric: Record<string, string> | undefined,
  nameLabels: string[] | undefined,
  staticName: string | undefined,
  rewrite: MonitoringNameRewrite | undefined,
  fallbackTitle: string,
): string | undefined {
  const name = monitoringSeriesName(metric, nameLabels, staticName, rewrite);
  if (name) return name;
  if (nameLabels && nameLabels.length > 0) return undefined;
  return fallbackTitle;
}
