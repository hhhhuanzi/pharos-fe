import { shortExportedInstance } from './format';
import type { MonitoringSeries } from './query';

/**
 * Join key for a table row. `exported_instance` is only used when the series has no `pod` label
 * (JVM heap), and even then it must not *create* a row — see {@link collectMonitoringJoinKeys}.
 */
export function joinKeyOf(series: MonitoringSeries, joinLabel: string, rewritePodFromInstance: boolean): string | undefined {
  const direct = series.metric[joinLabel];
  if (direct && direct.trim()) return direct.trim();
  if (rewritePodFromInstance && series.metric.exported_instance) {
    return shortExportedInstance(series.metric.exported_instance);
  }
  return undefined;
}

/**
 * OTel JVM / HTTP series are matched by `exported_job`. When the page has no namespace the
 * matcher is still cluster-wide (`.+/$service`), so seeding the pod inventory from them would
 * re-list pods that live in another env. Those series may still *fill* a cell once the row
 * exists from kube-state / cadvisor.
 */
export function collectMonitoringJoinKeys(entries: Array<{ target: { nameRewrite?: string }; series: MonitoringSeries[] }>, joinLabel: string): string[] {
  const keys = new Set<string>();
  entries.forEach((entry) => {
    if (entry.target.nameRewrite === 'exportedInstancePod') return;
    entry.series.forEach((item) => {
      const key = joinKeyOf(item, joinLabel, false);
      if (key) keys.add(key);
    });
  });
  return Array.from(keys).sort((a, b) => a.localeCompare(b));
}

/**
 * Long identifiers wrap in place — same convention as the chart legend. No ellipsis, no
 * click-to-copy: the user selects text and copies via the OS.
 */
export const MONITORING_TABLE_WRAP_CELL_CLASS = 'cursor-text select-text break-all whitespace-normal';

/** IP / QoS / numbers stay on one line; still selectable. */
export const MONITORING_TABLE_COMPACT_CELL_CLASS = 'cursor-text select-text whitespace-nowrap';

/** Applied to the td so antd / resizable-header overflow cannot clip a wrapped name. */
export const MONITORING_TABLE_WRAP_COLUMN_CLASS = 'align-top overflow-visible whitespace-normal break-all';
export const MONITORING_TABLE_COMPACT_COLUMN_CLASS = 'whitespace-nowrap';

const TABLE_CHAR_PX = 7;
const TABLE_CELL_PAD_PX = 24;
const WRAP_COLUMN_MIN = 168;
const WRAP_COLUMN_MAX = 360;
const COMPACT_COLUMN_MIN = 72;

function visualChars(text: string): number {
  let n = 0;
  for (const ch of text) {
    n += ch.charCodeAt(0) > 255 ? 2 : 1;
  }
  return n;
}

export function isWrappingTableColumn(id: string): boolean {
  return id === 'pod' || id === 'node' || id === 'reason';
}

/**
 * Hug the longest cell (and the header). Wrap columns stop growing past {@link WRAP_COLUMN_MAX}
 * so a 50-char node name wraps instead of shoving every other field off-screen; compact columns
 * stay one line and grow with their content.
 */
export function monitoringTableColumnWidth(id: string, title: string, values: readonly string[]): number {
  const longest = Math.max(visualChars(title), ...values.map(visualChars), 1);
  const content = longest * TABLE_CHAR_PX + TABLE_CELL_PAD_PX;
  if (isWrappingTableColumn(id)) {
    return Math.min(WRAP_COLUMN_MAX, Math.max(WRAP_COLUMN_MIN, content));
  }
  return Math.max(COMPACT_COLUMN_MIN, content);
}
