/** Blank for services whose RED comes from service_graph, which has no environment dimension. */
export function formatEnv(value?: string): string {
  return value?.trim() || '—';
}
