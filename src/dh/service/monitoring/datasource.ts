export const MONITORING_PROM_LS = 'n9e-dh-service-monitoring-prom-id';

export interface MonitoringDatasource {
  id: number;
  name: string;
}

/** Built-in stores hold n9e's own metrics, not cluster metrics, so they must never win by default. */
const EMBEDDED_NAME = /embedded|built-?in|内置/i;
/** Long-term stores that actually hold the cadvisor / kube-state-metrics series. */
const LONG_TERM_NAME = /thanos|victoria|vm-?select|mimir|cortex/i;

/**
 * `groupedDatasourceList` is ordered by `is_default` first, so the embedded TSDB sits at index 0 in a
 * typical install. Taking the head of that list silently renders empty charts, which is easy to
 * misread as "no metrics collected". Preference order: the user's stored choice, a long-term store by
 * name, any non-embedded source, then list order.
 */
export function pickMonitoringDatasourceId(list: MonitoringDatasource[], preferred?: number): number | undefined {
  if (preferred != null && list.some((item) => item.id === preferred)) return preferred;
  const longTerm = list.find((item) => LONG_TERM_NAME.test(item.name || ''));
  if (longTerm) return longTerm.id;
  const external = list.find((item) => !EMBEDDED_NAME.test(item.name || ''));
  if (external) return external.id;
  return list[0]?.id;
}

export function readMonitoringDatasourceId(): number | undefined {
  const raw = localStorage.getItem(MONITORING_PROM_LS);
  if (!raw) return undefined;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

export function storeMonitoringDatasourceId(id: number): void {
  localStorage.setItem(MONITORING_PROM_LS, String(id));
}
