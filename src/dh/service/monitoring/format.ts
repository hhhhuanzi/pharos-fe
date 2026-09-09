export type MonitoringUnit = 'cores' | 'bytes' | 'bytesPerSecond' | 'percentUnit' | 'short' | 'count' | 'ops' | 'milliseconds' | 'seconds';

export type MonitoringNameRewrite = 'exportedInstancePod' | 'httpMethodRoute';

const IEC_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];

function trim(value: number, decimals: number): string {
  return String(Number(value.toFixed(decimals)));
}

function formatBytes(value: number, suffix: string): string {
  let scaled = value;
  let idx = 0;
  while (Math.abs(scaled) >= 1024 && idx < IEC_UNITS.length - 1) {
    scaled /= 1024;
    idx += 1;
  }
  return `${trim(scaled, idx === 0 ? 0 : 2)} ${IEC_UNITS[idx]}${suffix}`;
}

function formatLatencyMs(ms: number): string {
  const abs = Math.abs(ms);
  if (abs >= 60000) return `${trim(ms / 60000, abs >= 600000 ? 1 : 2)} min`;
  if (abs >= 1000) return `${trim(ms / 1000, abs >= 10000 ? 1 : 2)} s`;
  return `${trim(ms, abs >= 10 ? 1 : 2)} ms`;
}

/** Missing values render as an em dash, never as 0 — 0 reads as "measured and idle". */
export function formatMonitoringValue(unit: MonitoringUnit, value?: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  switch (unit) {
    case 'cores':
      // Container CPU is routinely in the 0.01 core range, so keep 4 decimals below 1 core.
      return Math.abs(value) >= 1 ? trim(value, 2) : trim(value, 4);
    case 'bytes':
      return formatBytes(value, '');
    case 'bytesPerSecond':
      return formatBytes(value, '/s');
    case 'percentUnit': {
      // Decimals follow the percentage, not the ratio: error rates live in the 0.0x% range and
      // rounding them to 2 decimals collapsed 0.012% and 0.008% onto the same "0.01%".
      const percent = value * 100;
      const abs = Math.abs(percent);
      if (abs >= 10) return `${trim(percent, 1)}%`;
      if (abs >= 1) return `${trim(percent, 2)}%`;
      return `${trim(percent, 3)}%`;
    }
    case 'count':
      return Math.round(value).toLocaleString();
    case 'ops':
      if (Math.abs(value) >= 100) return trim(value, 0);
      if (Math.abs(value) >= 1) return trim(value, 1);
      return trim(value, 2);
    case 'milliseconds':
      return formatLatencyMs(value);
    case 'seconds':
      return formatLatencyMs(value * 1000);
    case 'short':
    default:
      return trim(value, 2);
  }
}

/**
 * `exported_instance` is `<ns>.<pod>.<service.name>`. Pod names are DNS-1123 (no dots), so the
 * middle segment is the pod; the rest of the name after that is the service, which may contain dots.
 */
export function shortExportedInstance(value: string): string {
  const parts = value.split('.').filter((part) => part.length > 0);
  return parts.length >= 3 ? parts[1] : value;
}

/** `POST /api/orders`. Method-only when the app never set `http.route`. */
export function formatHttpMethodRoute(metric: Record<string, string> | undefined): string {
  const method = metric?.http_request_method?.trim();
  const route = metric?.http_route?.trim();
  if (method && route) return `${method} ${route}`;
  return method || route || '';
}

/**
 * Series name for a panel legend. `labels` picks metric labels (usually `pod`) and `staticName` is
 * for label-less threshold lines (request / limit) or a direction suffix (rx / tx).
 */
export function monitoringSeriesName(metric: Record<string, string> | undefined, labels: string[] = [], staticName?: string, rewrite?: MonitoringNameRewrite): string {
  if (rewrite === 'httpMethodRoute') return formatHttpMethodRoute(metric);
  const labelPart = labels
    .map((label) => {
      const raw = metric?.[label];
      if (!raw || !raw.trim()) return undefined;
      return rewrite === 'exportedInstancePod' && label === 'exported_instance' ? shortExportedInstance(raw) : raw;
    })
    .filter((value): value is string => Boolean(value))
    .join(' · ');
  if (labelPart && staticName) return `${labelPart} · ${staticName}`;
  if (labelPart) return labelPart;
  if (staticName) return staticName;
  const entries = Object.entries(metric || {}).filter(([key]) => key !== '__name__');
  return entries.length ? entries.map(([key, value]) => `${key}=${value}`).join(', ') : '';
}
