import { FULL_GC_DISPLAY, YOUNG_GC_DISPLAY } from './gcDisplay';
import { padMissingG1OldSeries } from './gcPad';
import type { MonitoringSeries } from './query';

function series(metric: Record<string, string>, values: Array<[number, number]>): MonitoringSeries {
  return { metric, points: values };
}

const YOUNG = 'G1 Young Generation';
const POD_A = 'pre-turms.pod-a.turms';
const POD_B = 'pre-turms.pod-b.turms';

describe('padMissingG1OldSeries', () => {
  it('leaves an empty result empty — nothing to infer Young GC from', () => {
    expect(padMissingG1OldSeries([])).toEqual([]);
  });

  it('pads Full GC = 0 when Serial Copy is present and MarkSweepCompact is not', () => {
    const copy = series({ exported_instance: POD_A, jvm_gc_name: 'Copy' }, [[1, 0.1]]);
    expect(padMissingG1OldSeries([copy])).toEqual([
      series({ exported_instance: POD_A, jvm_gc_name: YOUNG_GC_DISPLAY }, [[1, 0.1]]),
      series({ exported_instance: POD_A, jvm_gc_name: FULL_GC_DISPLAY }, [[1, 0]]),
    ]);
  });

  it('pads Full GC = 0 when Parallel young is present and old is not', () => {
    const young = series({ exported_instance: POD_A, jvm_gc_name: 'PS Scavenge' }, [[1, 0.1]]);
    expect(padMissingG1OldSeries([young])).toEqual([
      series({ exported_instance: POD_A, jvm_gc_name: YOUNG_GC_DISPLAY }, [[1, 0.1]]),
      series({ exported_instance: POD_A, jvm_gc_name: FULL_GC_DISPLAY }, [[1, 0]]),
    ]);
  });

  it('pads a zero Full GC when G1 Young is present and Old is not', () => {
    const young = series({ exported_instance: POD_A, jvm_gc_name: YOUNG }, [
      [10, 0.02],
      [20, 0.03],
    ]);
    expect(padMissingG1OldSeries([young])).toEqual([
      series({ exported_instance: POD_A, jvm_gc_name: YOUNG_GC_DISPLAY }, [
        [10, 0.02],
        [20, 0.03],
      ]),
      series({ exported_instance: POD_A, jvm_gc_name: FULL_GC_DISPLAY }, [
        [10, 0],
        [20, 0],
      ]),
    ]);
  });

  it('does not treat Concurrent Cycle as Young or Full, so it does not pad', () => {
    const concurrent = series({ exported_instance: POD_A, jvm_gc_name: 'G1 Concurrent Cycle' }, [[1, 0.01]]);
    expect(padMissingG1OldSeries([concurrent])).toEqual([concurrent]);
  });

  it('still pads Full GC when Young is present alongside a concurrent cycle', () => {
    const young = series({ exported_instance: POD_A, jvm_gc_name: YOUNG }, [[1, 0.02]]);
    const concurrent = series({ exported_instance: POD_A, jvm_gc_name: 'G1 Concurrent Cycle' }, [[1, 0.01]]);
    const out = padMissingG1OldSeries([young, concurrent]);
    expect(out).toEqual([
      series({ exported_instance: POD_A, jvm_gc_name: YOUNG_GC_DISPLAY }, [[1, 0.02]]),
      concurrent,
      series({ exported_instance: POD_A, jvm_gc_name: FULL_GC_DISPLAY }, [[1, 0]]),
    ]);
  });

  it('does not overwrite a real Full series, including an all-zero one that already arrived', () => {
    const young = series({ exported_instance: POD_A, jvm_gc_name: YOUNG }, [[1, 0.02]]);
    const old = series({ exported_instance: POD_A, jvm_gc_name: 'G1 Old Generation' }, [[1, 0.4]]);
    const quietOld = series({ exported_instance: POD_B, jvm_gc_name: 'G1 Old Generation' }, [[1, 0]]);
    const youngB = series({ exported_instance: POD_B, jvm_gc_name: YOUNG }, [[1, 0.01]]);
    expect(padMissingG1OldSeries([young, old])).toEqual([
      series({ exported_instance: POD_A, jvm_gc_name: YOUNG_GC_DISPLAY }, [[1, 0.02]]),
      series({ exported_instance: POD_A, jvm_gc_name: FULL_GC_DISPLAY }, [[1, 0.4]]),
    ]);
    expect(padMissingG1OldSeries([youngB, quietOld])).toEqual([
      series({ exported_instance: POD_B, jvm_gc_name: YOUNG_GC_DISPLAY }, [[1, 0.01]]),
      series({ exported_instance: POD_B, jvm_gc_name: FULL_GC_DISPLAY }, [[1, 0]]),
    ]);
  });

  it('does not pad when Full already exists', () => {
    const young = series({ exported_instance: POD_A, jvm_gc_name: YOUNG }, [[1, 0.02]]);
    const full = series({ exported_instance: POD_A, jvm_gc_name: 'G1 Full' }, [[1, 0.1]]);
    expect(padMissingG1OldSeries([young, full])).toEqual([
      series({ exported_instance: POD_A, jvm_gc_name: YOUNG_GC_DISPLAY }, [[1, 0.02]]),
      series({ exported_instance: POD_A, jvm_gc_name: FULL_GC_DISPLAY }, [[1, 0.1]]),
    ]);
  });

  it('pads per pod: only the replica that is missing Full GC', () => {
    const youngA = series({ exported_instance: POD_A, jvm_gc_name: YOUNG }, [[1, 0.02]]);
    const youngB = series({ exported_instance: POD_B, jvm_gc_name: YOUNG }, [[1, 0.03]]);
    const oldB = series({ exported_instance: POD_B, jvm_gc_name: 'G1 Old Generation' }, [[1, 0.2]]);
    const out = padMissingG1OldSeries([youngA, youngB, oldB]);
    expect(out).toHaveLength(4);
    expect(out[3]).toEqual(series({ exported_instance: POD_A, jvm_gc_name: FULL_GC_DISPLAY }, [[1, 0]]));
    expect(out.filter((item) => item.metric.exported_instance === POD_B && item.metric.jvm_gc_name === FULL_GC_DISPLAY)).toEqual([
      series({ exported_instance: POD_B, jvm_gc_name: FULL_GC_DISPLAY }, [[1, 0.2]]),
    ]);
  });

  it('does not invent values from heap used or other metrics', () => {
    const young = series({ exported_instance: POD_A, jvm_gc_name: YOUNG }, [[1, 0.02]]);
    const out = padMissingG1OldSeries([young]);
    expect(out[1]?.points.every(([, value]) => value === 0)).toBe(true);
  });

  it('folds same-pod young aliases into one Young GC series', () => {
    const young = series({ exported_instance: POD_A, jvm_gc_name: YOUNG }, [
      [1, 0.02],
      [2, 0.03],
    ]);
    const evacuation = series({ exported_instance: POD_A, jvm_gc_name: 'G1 Evacuation Pause' }, [
      [1, 0.01],
      [2, 0.04],
    ]);
    const out = padMissingG1OldSeries([young, evacuation]);
    expect(out.filter((item) => item.metric.jvm_gc_name === YOUNG_GC_DISPLAY)).toEqual([
      series({ exported_instance: POD_A, jvm_gc_name: YOUNG_GC_DISPLAY }, [
        [1, 0.03],
        [2, 0.07],
      ]),
    ]);
    expect(out.filter((item) => item.metric.jvm_gc_name === FULL_GC_DISPLAY)).toHaveLength(1);
  });
});
