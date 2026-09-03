/** Blank for services whose spanmetrics series carry no `deployment.environment.name` dimension. */
export function formatEnv(value?: string): string {
  return value?.trim() || '—';
}
