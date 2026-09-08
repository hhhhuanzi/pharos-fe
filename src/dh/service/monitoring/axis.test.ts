import { errorRateYMax } from '../series';
import { buildMonitoringYAxis, defaultMonitoringYAxisMode } from './axis';
import { formatMonitoringValue } from './format';
import { JVM_SECTION } from './sections/jvm';
import { NODE_SECTION } from './sections/node';

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

describe('defaultMonitoringYAxisMode', () => {
  it('derives the mode from the unit so panels only override real utilization ratios', () => {
    expect(defaultMonitoringYAxisMode('count')).toBe('count');
    expect(defaultMonitoringYAxisMode('percentUnit')).toBe('ratio');
    expect(defaultMonitoringYAxisMode('bytes')).toBe('linear');
    expect(defaultMonitoringYAxisMode('ops')).toBe('linear');
    expect(defaultMonitoringYAxisMode('milliseconds')).toBe('linear');
  });
});

describe('count axes', () => {
  it('never lets an all-zero restart chart draw uPlot default 0-100 axis', () => {
    const plan = buildMonitoringYAxis({ unit: 'count', values: [0, 0, 0, 0, 0] });

    expect(plan.range).toEqual([0, 2]);
    expect(plan.range[1]).not.toBe(100);
  });

  it('keeps a single restart spike well inside the plot', () => {
    expect(buildMonitoringYAxis({ unit: 'count', values: [0, 0, 1, 0] }).range).toEqual([0, 2]);
  });

  it('offers whole-number increments only, so a replica count of 1 cannot tick 0 / 0 / 1 / 1', () => {
    const plan = buildMonitoringYAxis({ unit: 'count', values: [1, 1, 0, 0], references: [1] });

    expect(plan.range).toEqual([0, 2]);
    expect(plan.incrs).toBeDefined();
    expect(plan.incrs?.every((incr) => Number.isInteger(incr))).toBe(true);
    expect(Math.min(...(plan.incrs ?? []))).toBe(1);
  });

  it('renders every reachable count tick as a distinct integer', () => {
    [
      { values: [0], top: 2 },
      { values: [1], top: 2 },
      { values: [3], top: 4 },
      { values: [8], top: 10 },
    ].forEach(({ values, top }) => {
      const plan = buildMonitoringYAxis({ unit: 'count', values });
      const labels = Array.from({ length: top + 1 }, (_, tick) => formatMonitoringValue('count', tick));
      expect(plan.range).toEqual([0, top]);
      expect(new Set(labels).size).toBe(labels.length);
    });
  });

  it('scales up for large counts like threads and loaded classes without losing integer ticks', () => {
    expect(buildMonitoringYAxis({ unit: 'count', values: [41, 45, 43] }).range).toEqual([0, 60]);
    expect(buildMonitoringYAxis({ unit: 'count', values: [15234, 15240] }).range).toEqual([0, 20000]);
  });
});

describe('ratio axes', () => {
  it('matches the error-rate ladder used by the service overview charts', () => {
    [[0], [0.008, 0.012], [0.4], [1], [2]].forEach((values) => {
      expect(buildMonitoringYAxis({ unit: 'percentUnit', values }).range[1]).toBe(errorRateYMax(values));
    });
  });

  it('keeps sub-percent error noise readable without a 0-100% axis', () => {
    const plan = buildMonitoringYAxis({ unit: 'percentUnit', values: [0, 0.0008, 0.0002] });

    expect(plan.range).toEqual([0, 0.01]);
    expect(formatMonitoringValue('percentUnit', plan.range[1])).toBe('1%');
  });

  it('lands the CPU throttling axis on the 5% threshold the hint talks about', () => {
    expect(buildMonitoringYAxis({ unit: 'percentUnit', values: [0.03, 0.041] }).range).toEqual([0, 0.05]);
  });

  it('leaves ratio and utilization axes on the default decimal increments', () => {
    expect(buildMonitoringYAxis({ unit: 'percentUnit', values: [0.2] }).incrs).toBeUndefined();
  });
});

describe('utilization axes', () => {
  it('uses a coarse ladder so node and JVM utilization stop re-scaling on refresh', () => {
    const mode = 'utilization' as const;
    expect(buildMonitoringYAxis({ unit: 'percentUnit', mode, values: [0.03] }).range).toEqual([0, 0.1]);
    expect(buildMonitoringYAxis({ unit: 'percentUnit', mode, values: [0.2] }).range).toEqual([0, 0.25]);
    expect(buildMonitoringYAxis({ unit: 'percentUnit', mode, values: [0.62] }).range).toEqual([0, 1]);
    expect(buildMonitoringYAxis({ unit: 'percentUnit', mode, values: [0, 0] }).range).toEqual([0, 0.1]);
  });

  it('is what the node and JVM CPU panels ask for', () => {
    expect(NODE_SECTION.panels.map((panel) => panel.yAxis)).toEqual(['utilization', 'utilization', 'utilization']);
    expect(JVM_SECTION.panels.find((panel) => panel.id === 'jvm_cpu')?.yAxis).toBe('utilization');
    expect(JVM_SECTION.panels.find((panel) => panel.id === 'jvm_gc')?.yAxis).toBeUndefined();
  });
});

describe('request / limit reference lines', () => {
  it('keeps a far-away limit inside the range even though it flattens the usage curve', () => {
    // 25 mCore against a 2-core limit. The flat line is the answer: nowhere near the limit.
    const plan = buildMonitoringYAxis({ unit: 'cores', values: [0.011, 0.012], references: [0.1, 2] });

    expect(plan.range[1]).toBeGreaterThan(2);
  });

  it('never leaves a reference line the tooltip and legend still list off the plot', () => {
    [
      { unit: 'cores' as const, values: [0.012], references: [2] },
      { unit: 'bytes' as const, values: [3 * MIB], references: [2 * GIB] },
      { unit: 'count' as const, values: [0], references: [3] },
    ].forEach(({ unit, values, references }) => {
      const plan = buildMonitoringYAxis({ unit, values, references });
      expect(plan.range[1]).toBeGreaterThanOrEqual(Math.max(...references));
    });
  });

  it('fits usage and both reference lines when they are the same order of magnitude', () => {
    expect(buildMonitoringYAxis({ unit: 'cores', values: [1.5], references: [1, 2] }).range).toEqual([0, 2.5]);
  });

  it('fits heap used together with the heap limit instead of clipping it', () => {
    const plan = buildMonitoringYAxis({ unit: 'bytes', values: [1.2 * GIB], references: [2 * GIB] });

    expect(plan.range[1]).toBeGreaterThan(2 * GIB);
    expect(formatMonitoringValue('bytes', plan.range[1])).toBe('2.5 GiB');
  });

  it('falls back to the reference lines when nothing was measured', () => {
    expect(buildMonitoringYAxis({ unit: 'cores', values: [null, undefined], references: [0.5, 2] }).range).toEqual([0, 2.5]);
  });
});

describe('linear axes', () => {
  it('gives an all-zero panel a plausible scale per unit instead of 0-100', () => {
    expect(buildMonitoringYAxis({ unit: 'ops', values: [0, 0] }).range).toEqual([0, 1]);
    expect(buildMonitoringYAxis({ unit: 'milliseconds', values: [0] }).range).toEqual([0, 10]);
    expect(buildMonitoringYAxis({ unit: 'cores', values: [0] }).range).toEqual([0, 0.1]);
    expect(buildMonitoringYAxis({ unit: 'bytes', values: [] }).range).toEqual([0, MIB]);
    expect(buildMonitoringYAxis({ unit: 'bytesPerSecond', values: [0] }).range).toEqual([0, 1024]);
  });

  it('rounds byte axes onto exact IEC ticks', () => {
    const plan = buildMonitoringYAxis({ unit: 'bytes', values: [800 * MIB] });

    expect(formatMonitoringValue('bytes', plan.range[1])).toBe('896 MiB');
    expect(plan.incrs?.every((incr) => Number.isInteger(Math.log2(incr)))).toBe(true);
    expect(plan.incrs).toContain(256 * MIB);
  });

  it('adds headroom above the QPS peak without overshooting it', () => {
    const plan = buildMonitoringYAxis({ unit: 'ops', values: [7.2, 4.3, 6.6] });

    expect(plan.range).toEqual([0, 8]);
    expect(plan.incrs).toBeUndefined();
  });

  it('scales latency to the actual magnitude, from single-digit ms to seconds', () => {
    expect(buildMonitoringYAxis({ unit: 'milliseconds', values: [5.46] }).range).toEqual([0, 7]);
    expect(buildMonitoringYAxis({ unit: 'milliseconds', values: [546] }).range).toEqual([0, 700]);
    expect(formatMonitoringValue('milliseconds', buildMonitoringYAxis({ unit: 'milliseconds', values: [1260] }).range[1])).toBe('1.5 s');
  });

  it('ignores nulls left by gap-filled series', () => {
    expect(buildMonitoringYAxis({ unit: 'ops', values: [null, 3.1, undefined, NaN] }).range).toEqual([0, 4]);
  });
});
