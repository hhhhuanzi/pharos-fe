export const PROM_LS = 'n9e-dh-service-graph-prom-id';
export const RANGE_LS = 'n9e-dh-service-overview-range';
export const JAEGER_LS = 'n9e-dh-service-jaeger-id';
export const TOP_N_LS = 'n9e-dh-service-top-n';

export function readStoredId(key: string): number | undefined {
  const raw = localStorage.getItem(key);
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

export function pickDatasourceId(list: Array<{ id: number }>, preferred?: number): number | undefined {
  if (preferred != null && list.some((ds) => ds.id === preferred)) return preferred;
  return list[0]?.id;
}

export function readStoredTopN(fallback: number): number {
  const raw = localStorage.getItem(TOP_N_LS);
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}
