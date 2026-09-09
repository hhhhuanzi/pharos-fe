import { sumSeriesAtTimestamps } from './aggregate';
import { displayJvmGcName, FULL_GC_DISPLAY, isFullGcName, isYoungGcName } from './gcDisplay';
import type { MonitoringSeries } from './query';

function gcName(metric: Record<string, string>): string {
  return metric.jvm_gc_name || '';
}

function instanceKey(metric: Record<string, string>): string {
  return metric.exported_instance || '';
}

function withDisplayName(item: MonitoringSeries, name: string): MonitoringSeries {
  return { metric: { ...item.metric, jvm_gc_name: name }, points: item.points };
}

/**
 * Rewrite `jvm_gc_name` to Young GC / Full GC and fold same-pod aliases so the legend cannot
 * list two Young GC rows. Values at the same timestamp are summed.
 */
function foldGcDisplaySeries(series: MonitoringSeries[]): MonitoringSeries[] {
  const groups = new Map<string, MonitoringSeries[]>();
  const order: string[] = [];
  series.forEach((item) => {
    const display = displayJvmGcName(gcName(item.metric));
    const key = `${instanceKey(item.metric)}\0${display}`;
    const list = groups.get(key);
    if (list) {
      list.push(withDisplayName(item, display));
      return;
    }
    order.push(key);
    groups.set(key, [withDisplayName(item, display)]);
  });
  return order.flatMap((key) => {
    const items = groups.get(key);
    if (!items || items.length === 0) return [];
    const first = items[0];
    if (!first) return [];
    if (items.length === 1) return [first];
    return [{ metric: first.metric, points: sumSeriesAtTimestamps(items) }];
  });
}

/**
 * When a pod already has Young GC but no Full GC, append a zero Full GC series so "never ran"
 * is a 0 line, not a missing scrape. Serial Copy without MarkSweepCompact is included.
 * Existing Full GC (including real zeros) is left alone. Concurrent cycles are not Full.
 */
export function padMissingG1OldSeries(series: MonitoringSeries[]): MonitoringSeries[] {
  const folded = foldGcDisplaySeries(series);
  if (folded.length === 0) return folded;

  const byInstance = new Map<string, MonitoringSeries[]>();
  folded.forEach((item) => {
    const key = instanceKey(item.metric);
    const list = byInstance.get(key);
    if (list) list.push(item);
    else byInstance.set(key, [item]);
  });

  const padded: MonitoringSeries[] = [];
  byInstance.forEach((items) => {
    if (!items.some((item) => isYoungGcName(gcName(item.metric)))) return;
    if (items.some((item) => isFullGcName(gcName(item.metric)))) return;
    const template = items.find((item) => isYoungGcName(gcName(item.metric))) ?? items[0];
    if (!template) return;
    const metric: Record<string, string> = { jvm_gc_name: FULL_GC_DISPLAY };
    if (template.metric.exported_instance) metric.exported_instance = template.metric.exported_instance;
    padded.push({
      metric,
      points: template.points.map(([ts]) => [ts, 0]),
    });
  });

  return padded.length === 0 ? folded : [...folded, ...padded];
}
