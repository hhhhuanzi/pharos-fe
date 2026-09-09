export const YOUNG_GC_DISPLAY = 'Young GC';
export const FULL_GC_DISPLAY = 'Full GC';

const YOUNG_EXACT = new Set(['Copy', 'PS Scavenge', 'ParNew', 'G1 Young Generation', 'G1 Evacuation Pause']);

const FULL_EXACT = new Set(['MarkSweepCompact', 'PS MarkSweep', 'ConcurrentMarkSweep', 'G1 Old Generation', 'G1 Full']);

function normalizeGcName(name: string): string {
  return name.trim();
}

/** Concurrent cycles are not Full GC — keep the collector name (or call them Concurrent). */
export function isConcurrentGcCycle(name: string): boolean {
  const n = normalizeGcName(name);
  if (!n) return false;
  return /\bConcurrent Cycle\b/i.test(n) || /\bZGC Cycles\b/i.test(n) || /\bShenandoah Cycles\b/i.test(n);
}

export function isYoungGcName(name: string): boolean {
  const n = normalizeGcName(name);
  if (!n || isConcurrentGcCycle(n)) return false;
  if (n === YOUNG_GC_DISPLAY || YOUNG_EXACT.has(n)) return true;
  return /\bYoung\b/i.test(n) || /\bScavenge\b/i.test(n) || /\bEvacuation\b/i.test(n);
}

export function isFullGcName(name: string): boolean {
  const n = normalizeGcName(name);
  if (!n || isConcurrentGcCycle(n) || isYoungGcName(n)) return false;
  if (n === FULL_GC_DISPLAY || FULL_EXACT.has(n)) return true;
  if (/\bCMS\b/i.test(n) || /MarkSweep/i.test(n)) return true;
  return /\bOld\b/i.test(n) || /\bFull\b/i.test(n);
}

/**
 * Legend / tooltip / pin label for `jvm_gc_name`. PromQL still groups by the collector name;
 * this only rewrites what the chart shows.
 */
export function displayJvmGcName(name: string): string {
  const n = normalizeGcName(name);
  if (!n) return n;
  if (isYoungGcName(n)) return YOUNG_GC_DISPLAY;
  if (isFullGcName(n)) return FULL_GC_DISPLAY;
  return n;
}
