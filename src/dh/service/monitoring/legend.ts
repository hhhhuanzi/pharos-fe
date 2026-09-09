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
 * Snapshot of the document selection at click time. Built in the row handler so tests can pass
 * a plain object instead of a live `Selection`.
 */
export interface LegendSelectionSnapshot {
  isCollapsed: boolean;
  text: string;
  /** Anchor or focus sits inside the legend row the user clicked. */
  intersectsRow: boolean;
}

export function snapshotLegendSelection(row: Node, selection: Selection | null): LegendSelectionSnapshot | null {
  if (!selection) return null;
  const intersectsRow = Boolean((selection.anchorNode && row.contains(selection.anchorNode)) || (selection.focusNode && row.contains(selection.focusNode)));
  return { isCollapsed: selection.isCollapsed, text: selection.toString(), intersectsRow };
}

/**
 * Drag-selecting a wrapped pod name must not isolate. A collapsed / empty selection is a click.
 */
export function shouldIsolateLegendClick(snapshot: LegendSelectionSnapshot | null): boolean {
  if (!snapshot || snapshot.isCollapsed || snapshot.text.length === 0) return true;
  return !snapshot.intersectsRow;
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
