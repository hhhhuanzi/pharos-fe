import { displayJvmGcName, FULL_GC_DISPLAY, isConcurrentGcCycle, YOUNG_GC_DISPLAY } from './gcDisplay';

describe('displayJvmGcName', () => {
  it('maps young collectors to Young GC', () => {
    expect(displayJvmGcName('Copy')).toBe(YOUNG_GC_DISPLAY);
    expect(displayJvmGcName('PS Scavenge')).toBe(YOUNG_GC_DISPLAY);
    expect(displayJvmGcName('ParNew')).toBe(YOUNG_GC_DISPLAY);
    expect(displayJvmGcName('G1 Young Generation')).toBe(YOUNG_GC_DISPLAY);
    expect(displayJvmGcName('G1 Evacuation Pause')).toBe(YOUNG_GC_DISPLAY);
    expect(displayJvmGcName('G1 Young')).toBe(YOUNG_GC_DISPLAY);
  });

  it('maps old / full collectors to Full GC', () => {
    expect(displayJvmGcName('MarkSweepCompact')).toBe(FULL_GC_DISPLAY);
    expect(displayJvmGcName('PS MarkSweep')).toBe(FULL_GC_DISPLAY);
    expect(displayJvmGcName('ConcurrentMarkSweep')).toBe(FULL_GC_DISPLAY);
    expect(displayJvmGcName('G1 Old Generation')).toBe(FULL_GC_DISPLAY);
    expect(displayJvmGcName('G1 Full')).toBe(FULL_GC_DISPLAY);
    expect(displayJvmGcName('CMS')).toBe(FULL_GC_DISPLAY);
    expect(displayJvmGcName('CMS Pause')).toBe(FULL_GC_DISPLAY);
  });

  it('does not call concurrent cycles Full GC', () => {
    expect(isConcurrentGcCycle('G1 Concurrent Cycle')).toBe(true);
    expect(isConcurrentGcCycle('ZGC Cycles')).toBe(true);
    expect(displayJvmGcName('G1 Concurrent Cycle')).toBe('G1 Concurrent Cycle');
    expect(displayJvmGcName('ZGC Cycles')).toBe('ZGC Cycles');
    expect(displayJvmGcName('G1 Concurrent Cycle')).not.toBe(FULL_GC_DISPLAY);
    expect(displayJvmGcName('ZGC Cycles')).not.toBe(FULL_GC_DISPLAY);
  });

  it('is idempotent for already-mapped names', () => {
    expect(displayJvmGcName(YOUNG_GC_DISPLAY)).toBe(YOUNG_GC_DISPLAY);
    expect(displayJvmGcName(FULL_GC_DISPLAY)).toBe(FULL_GC_DISPLAY);
  });
});
