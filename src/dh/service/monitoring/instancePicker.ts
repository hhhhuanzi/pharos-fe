import { shortExportedInstance } from './format';
import type { MonitoringSeries } from './query';

export interface MonitoringInstanceOption {
  /** Full `exported_instance` (`<ns>.<pod>.<service>`), used in PromQL. */
  value: string;
  /** Pod segment shown in the Select. */
  label: string;
}

/**
 * Unique exported_instance values, labelled by the pod segment and sorted so the default
 * pick is stable across refreshes (replica suffix order, not scrape arrival order).
 */
export function collectExportedInstances(series: MonitoringSeries[]): MonitoringInstanceOption[] {
  const byValue = new Map<string, string>();
  series.forEach((item) => {
    const raw = item.metric.exported_instance?.trim();
    if (!raw || byValue.has(raw)) return;
    byValue.set(raw, shortExportedInstance(raw));
  });
  return [...byValue.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label) || a.value.localeCompare(b.value));
}

/** Keep the current pick when it is still present; otherwise the first sorted pod. */
export function pickDefaultExportedInstance(options: MonitoringInstanceOption[], current?: string): string | undefined {
  if (current && options.some((option) => option.value === current)) return current;
  return options[0]?.value;
}
