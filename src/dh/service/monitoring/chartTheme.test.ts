jest.mock('@/utils/constant', () => ({
  FONT_FAMILY: 'Inter',
  THEME: {
    light: { text: { primary: '#333' } },
    dark: { text: { primary: '#fff' } },
  },
}));

Object.defineProperty(global, 'devicePixelRatio', { value: 1, writable: true });

import {
  buildMonitoringChartAxes,
  buildMonitoringChartCursor,
  buildMonitoringChartSeries,
  buildMonitoringLegendLayout,
  buildMonitoringSeriesColors,
  colorWithAlpha,
  monitoringFillOpacity,
  monitoringSeriesStroke,
  MONITORING_BASELINE_DASH,
  MONITORING_CHART_LINE_WIDTH,
  MONITORING_CURSOR_CLASS,
  MONITORING_DASH,
  MONITORING_PALETTE_OFFSET,
  MONITORING_REFERENCE_LINE_WIDTH,
} from './chartTheme';
import { MONITORING_SECTIONS } from './panels';

/** The head of `@/pages/dashboard/config`'s `hexPalette`, which is what the page feeds in. */
const PALETTE = ['#7EB26D', '#EAB839', '#6ED0E0', '#EF843C', '#E24D42', '#1F78C1', '#BA43A9', '#705DA0'] as const;
const REFERENCE_LIGHT = '#3f4856';
const REFERENCE_DARK = 'rgb(135, 135, 146)';
/** `--fc-orange-11`. Amber, not red: a limit line is on screen even when nothing is wrong. */
const CEILING_LIGHT = 'rgb(210, 77, 0)';
const CEILING_DARK = 'rgb(255, 157, 97)';
/** `--fc-violet-11`. A non-status accent, so `request` can be coloured without implying health. */
const BUDGET_LIGHT = 'rgb(107, 81, 175)';
const BUDGET_DARK = 'rgb(184, 164, 255)';

describe('colorWithAlpha', () => {
  it('turns a Grafana palette hex into a translucent rgba fill', () => {
    expect(colorWithAlpha('#7EB26D', 0.16)).toBe('rgba(126, 178, 109, 0.16)');
    expect(colorWithAlpha('#EAB839', 0.12)).toBe('rgba(234, 184, 57, 0.12)');
  });
});

describe('monitoringFillOpacity', () => {
  it('fades the area out as series pile up and drops it entirely on a busy plot', () => {
    expect(monitoringFillOpacity(1)).toBe(0.18);
    expect(monitoringFillOpacity(3)).toBe(0.12);
    expect(monitoringFillOpacity(6)).toBe(0.06);
    expect(monitoringFillOpacity(8)).toBe(0);
  });

  it('never lets a later step fill more heavily than an earlier one', () => {
    const steps = [1, 2, 3, 4, 5, 6, 7, 8, 20].map(monitoringFillOpacity);
    expect(steps).toEqual([...steps].sort((a, b) => b - a));
  });
});

describe('buildMonitoringSeriesColors', () => {
  it('starts on a neutral hue so a lone line is never read as "healthy" or "broken"', () => {
    const [only] = buildMonitoringSeriesColors([undefined], [...PALETTE], false);

    expect(only).toBe(PALETTE[MONITORING_PALETTE_OFFSET]);
    expect(only).toBe('#1F78C1');
    // The status vocabulary of this page: green / yellow / red must not open the series palette.
    expect(['#7EB26D', '#EAB839', '#E24D42']).not.toContain(only);
  });

  it('gives request, limit and the data line three separate hues', () => {
    const colors = buildMonitoringSeriesColors([undefined, 'budget', 'ceiling'], [...PALETTE], false);

    expect(colors).toEqual([PALETTE[5], BUDGET_LIGHT, CEILING_LIGHT]);
    expect(new Set(colors).size).toBe(3);
    // The grey they both used to share is gone from the resource panels entirely.
    expect(colors).not.toContain(REFERENCE_LIGHT);
  });

  it('keeps a limit line amber rather than red, so a healthy panel carries no alarm colour', () => {
    const [ceiling] = buildMonitoringSeriesColors(['ceiling'], [...PALETTE], false);

    expect(ceiling).toBe(CEILING_LIGHT);
    // `--fc-red-*` in either theme, and the palette's own reds: none of them may end up here.
    expect(['rgb(204, 46, 57)', 'rgb(229, 72, 77)', 'rgb(239, 67, 67)', '#E24D42', '#f5222d']).not.toContain(ceiling);
  });

  it('keeps request off the status hues, so a permanent line asserts nothing about health', () => {
    const [budget] = buildMonitoringSeriesColors(['budget'], [...PALETTE], false);

    expect(budget).toBe(BUDGET_LIGHT);
    // `--fc-yellow-11` / `--fc-green-11` / `--fc-red-11`: this system's warning, success and
    // critical scales. A guardrail line may not borrow any of them.
    expect(['rgb(149, 115, 0)', 'rgb(0, 129, 76)', 'rgb(204, 46, 57)']).not.toContain(budget);
    // Nor may it re-use the ceiling's hue, which is what made the two indistinguishable before.
    expect(budget).not.toBe(CEILING_LIGHT);
  });

  it('does not let any reference line consume a palette slot', () => {
    const colors = buildMonitoringSeriesColors([undefined, 'budget', 'ceiling', undefined], [...PALETTE], false);

    expect(colors).toEqual([PALETTE[5], BUDGET_LIGHT, CEILING_LIGHT, PALETTE[6]]);
  });

  it('steps every reference hue up for the dark theme', () => {
    expect(buildMonitoringSeriesColors(['budget', 'baseline', 'ceiling'], [...PALETTE], true)).toEqual([BUDGET_DARK, REFERENCE_DARK, CEILING_DARK]);
  });

  it('keeps desired replicas neutral: it is a target, not a boundary anyone can cross badly', () => {
    expect(buildMonitoringSeriesColors(['baseline'], [...PALETTE], false)).toEqual([REFERENCE_LIGHT]);
  });

  it('wraps around instead of running out of colours', () => {
    const flags = Array.from({ length: PALETTE.length + 2 }, () => undefined);
    const colors = buildMonitoringSeriesColors(flags, [...PALETTE], false);

    expect(colors).toHaveLength(PALETTE.length + 2);
    expect(colors[PALETTE.length]).toBe(colors[0]);
  });
});

describe('monitoringSeriesStroke', () => {
  it('leaves a solid stroke to the measured series alone', () => {
    expect(monitoringSeriesStroke()).toEqual({ width: MONITORING_CHART_LINE_WIDTH });
    (['ceiling', 'budget', 'baseline'] as const).forEach((reference) => {
      expect(monitoringSeriesStroke(reference).dash).toBeDefined();
    });
  });

  it('weights the static guardrails above the data they are read against', () => {
    // `hexPalette` can hand a pod `#EF843C` (near the amber ceiling) or `#705DA0` (near the violet
    // budget), so the dash rhythm alone was not a reliable tell on a busy panel.
    expect(monitoringSeriesStroke('ceiling')).toEqual({ width: MONITORING_REFERENCE_LINE_WIDTH, dash: MONITORING_DASH });
    expect(monitoringSeriesStroke('budget')).toEqual(monitoringSeriesStroke('ceiling'));
    expect(MONITORING_REFERENCE_LINE_WIDTH).toBeGreaterThan(MONITORING_CHART_LINE_WIDTH);
    // ...without letting a boundary that is on screen unconditionally shout over the data. 2.5px
    // crossed that line: the limit came out as a row of fat dots.
    expect(MONITORING_REFERENCE_LINE_WIDTH).toBeLessThanOrEqual(2);
  });

  it('keeps desired replicas at data weight rather than promoting it to a guardrail', () => {
    // It is a real `kube_deployment_spec_replicas` series drawn dashed, it is grey so it cannot
    // clash with the palette, and at guardrail weight it would out-shout available / unavailable.
    expect(monitoringSeriesStroke('baseline')).toEqual({ width: MONITORING_CHART_LINE_WIDTH, dash: MONITORING_BASELINE_DASH });
    expect(monitoringSeriesStroke('baseline').width).toBe(monitoringSeriesStroke().width);
  });

  it('scales each dash rhythm to the line it is drawn on', () => {
    // A segment under ~4x the stroke reads as a dot rather than a dash, which is what made the
    // limit line look like a row of beads; a gap under ~2x lets the segments merge into a bar.
    expect(MONITORING_DASH[0]).toBeGreaterThanOrEqual(MONITORING_REFERENCE_LINE_WIDTH * 4);
    expect(MONITORING_DASH[1]).toBeGreaterThan(MONITORING_REFERENCE_LINE_WIDTH * 2);
    expect(MONITORING_BASELINE_DASH[0]).toBeGreaterThanOrEqual(MONITORING_CHART_LINE_WIDTH * 4);
    expect(MONITORING_BASELINE_DASH[1]).toBeGreaterThan(MONITORING_CHART_LINE_WIDTH * 2);
    expect(MONITORING_BASELINE_DASH[0]).toBeLessThan(MONITORING_DASH[0]);
  });
});

describe('buildMonitoringChartCursor', () => {
  it('drops the horizontal crosshair that was being read as a fourth reference line', () => {
    // It tracks the pointer, not a plotted value, and uPlot styles it as the same grey hairline the
    // limit and request lines use.
    expect(buildMonitoringChartCursor().y).toBe(false);
  });

  it('keeps the vertical crosshair, which is what ties the tooltip to a point in time', () => {
    expect(buildMonitoringChartCursor().x).not.toBe(false);
  });

  it('restyles only the surviving crosshair, and only into a hairline', () => {
    // `.u-cursor-y` must not appear: it is gone at the options level, not hidden by CSS.
    expect(MONITORING_CURSOR_CLASS).not.toContain('u-cursor-y');
    expect(MONITORING_CURSOR_CLASS).toContain('border-right:1px_solid');
    // Dashed is reserved for references; the crosshair may not borrow it back.
    expect(MONITORING_CURSOR_CLASS).not.toContain('dashed');
    // Colour comes from the theme, so both light and dark follow one token.
    expect(MONITORING_CURSOR_CLASS).toContain('var(--fc-text-4)');
    expect(MONITORING_CURSOR_CLASS).not.toMatch(/#[0-9a-f]{3,6}/i);
  });

  it('never styles the crosshair through an all-sides border utility', () => {
    // `border-solid` / `border-2` style all four sides. uPlot only sets `border-right`, so the other
    // three sit at `style: none` over an initial width of `medium`; giving them a style materialises
    // them at 3px in `currentColor`. That is what turned a 1px hairline into a 4px near-black bar,
    // and Tailwind's preflight is not here to zero the widths because antd needs it switched off.
    expect(MONITORING_CURSOR_CLASS).not.toMatch(/:border-(solid|dashed|dotted|double|\d)\b/);
    expect(MONITORING_CURSOR_CLASS).not.toMatch(/:border-r\b/);
  });
});

describe('buildMonitoringChartSeries', () => {
  it('fills measured series, keeps request/limit dashed, heavier and unfilled, and uses a thin spline', () => {
    const colors = ['#1F78C1', BUDGET_LIGHT] as const;
    const series = buildMonitoringChartSeries([{ label: 'pod-a' }, { label: 'request' }], [...colors], monitoringFillOpacity(1), [
      monitoringSeriesStroke(),
      monitoringSeriesStroke('budget'),
    ]);

    expect(series).toHaveLength(3);
    expect(series[1]?.width).toBe(MONITORING_CHART_LINE_WIDTH);
    expect(series[1]?.dash).toBeUndefined();
    expect(series[1]?.fill).toBe(colorWithAlpha(colors[0], 0.18));
    expect(series[1]?.paths).toEqual(expect.any(Function));
    expect(series[2]?.dash).toEqual([...MONITORING_DASH]);
    expect(series[2]?.width).toBe(MONITORING_REFERENCE_LINE_WIDTH);
    expect(series[2]?.fill).toBeUndefined();
  });

  it('draws a baseline at data weight, dashed and unfilled', () => {
    const series = buildMonitoringChartSeries([{ label: 'available' }, { label: 'desired' }], ['#1F78C1', REFERENCE_LIGHT], monitoringFillOpacity(1), [
      monitoringSeriesStroke(),
      monitoringSeriesStroke('baseline'),
    ]);

    expect(series[2]?.width).toBe(MONITORING_CHART_LINE_WIDTH);
    expect(series[2]?.dash).toEqual([...MONITORING_BASELINE_DASH]);
    // An area under "desired" would hide the actual it exists to be compared with.
    expect(series[2]?.fill).toBeUndefined();
  });

  it('lifts the guardrail above both the data and the target it shares a panel with', () => {
    const colors = ['#1F78C1', REFERENCE_LIGHT, CEILING_LIGHT];
    const series = buildMonitoringChartSeries([{ label: 'available' }, { label: 'desired' }, { label: 'limit' }], colors, monitoringFillOpacity(1), [
      monitoringSeriesStroke(),
      monitoringSeriesStroke('baseline'),
      monitoringSeriesStroke('ceiling'),
    ]);

    expect(series[2]?.width).toBe(series[1]?.width);
    expect(Number(series[3]?.width)).toBeGreaterThan(Number(series[2]?.width));
  });

  it('drops the area fill once the plot is too busy for it to be readable', () => {
    const colors = Array.from({ length: 8 }, (_, idx) => PALETTE[idx % PALETTE.length]);
    const series = buildMonitoringChartSeries(
      colors.map((_color, idx) => ({ label: `s${idx}` })),
      colors,
      monitoringFillOpacity(colors.length),
      colors.map(() => monitoringSeriesStroke()),
    );

    expect(series.slice(1).every((item) => item.fill === undefined)).toBe(true);
    expect(series.slice(1).every((item) => item.width === MONITORING_CHART_LINE_WIDTH)).toBe(true);
  });
});

describe('buildMonitoringLegendLayout', () => {
  it('hides the legend and reserves no gutter for a single series', () => {
    const layout = buildMonitoringLegendLayout(['QPS']);

    expect(layout.show).toBe(false);
    expect(layout.placement).toBe('none');
    expect(layout.items).toEqual([]);
    expect(layout).not.toHaveProperty('rest');
  });

  it('still hides the legend for a single series on a panel that asked for the side column', () => {
    const layout = buildMonitoringLegendLayout(['QPS'], 'right');

    expect(layout.show).toBe(false);
    expect(layout.placement).toBe('none');
    expect(layout.items).toEqual([]);
  });

  it('defaults a multi-series legend to under the plot, with color + name only', () => {
    const labels = ['200', '204', '400', '401', '429', '500', '503'] as const;
    const layout = buildMonitoringLegendLayout([...labels]);

    expect(layout.show).toBe(true);
    expect(layout.placement).toBe('bottom');
    expect(layout.items).toEqual([...labels]);
    expect(layout).not.toHaveProperty('rest');
    // uPlot's legend only knows the value under the cursor; last/max/avg/min would be our own
    // reducer, so the legend deliberately stays name-only.
    expect(layout).not.toHaveProperty('max');
    expect(layout).not.toHaveProperty('avg');
    expect(layout).not.toHaveProperty('min');
    expect(layout).not.toHaveProperty('last');
  });

  it('moves the legend to a side column only when the panel opts in', () => {
    const labels = ['available', 'desired', 'unavailable'] as const;

    expect(buildMonitoringLegendLayout([...labels], 'right').placement).toBe('right');
    expect(buildMonitoringLegendLayout([...labels]).placement).toBe('bottom');
  });

  it('keeps every series listed (the container scrolls) instead of truncating with a remainder', () => {
    const labels = Array.from({ length: 10 }, (_, idx) => `s${idx}`);

    (['bottom', 'right'] as const).forEach((placement) => {
      const layout = buildMonitoringLegendLayout(labels, placement === 'right' ? 'right' : undefined);

      expect(layout.show).toBe(true);
      expect(layout.placement).toBe(placement);
      expect(layout.items).toEqual(labels);
      expect(layout).not.toHaveProperty('rest');
    });
  });

  it('preserves series order so the legend stays index-aligned with the plot colours', () => {
    const labels = ['unavailable', 'available', 'desired'] as const;

    expect(buildMonitoringLegendLayout([...labels], 'right').items).toEqual([...labels]);
  });
});

describe('panel definitions', () => {
  it('gives the side column to the replicas trend and leaves every other panel at the bottom', () => {
    const optedIn = MONITORING_SECTIONS.flatMap((section) => section.panels.filter((panel) => panel.legend !== undefined).map((panel) => [section.id, panel.id, panel.legend]));

    expect(optedIn).toEqual([['replicas', 'replicas_trend', 'right']]);
  });

  it('files every reference line under the claim it actually makes', () => {
    const references = MONITORING_SECTIONS.flatMap((section) =>
      section.panels.flatMap((panel) => panel.targets.filter((target) => target.reference !== undefined).map((target) => `${panel.id}.${target.refId}:${target.reference}`)),
    );

    expect(references.filter((entry) => entry.endsWith(':baseline'))).toEqual(['replicas_trend.desired:baseline']);
    expect(references).toEqual(
      expect.arrayContaining([
        // Hard boundaries: crossing them gets the container throttled or OOMKilled.
        'container_cpu.limit:ceiling',
        'container_memory.limit:ceiling',
        'jvm_heap.limit:ceiling',
        // Scheduler reservations: crossing them is routine.
        'container_cpu.request:budget',
        'container_memory.request:budget',
      ]),
    );
    expect(references.every((entry) => /:(ceiling|budget|baseline)$/.test(entry))).toBe(true);
  });

  it('never files a `request` as a boundary or a `limit` as a reservation', () => {
    const targets = MONITORING_SECTIONS.flatMap((section) => section.panels.flatMap((panel) => panel.targets));

    expect(targets.filter((target) => target.refId === 'request').every((target) => target.reference === 'budget')).toBe(true);
    expect(targets.filter((target) => target.refId === 'limit').every((target) => target.reference === 'ceiling')).toBe(true);
  });
});

describe('buildMonitoringChartAxes', () => {
  it('keeps a visible-but-subordinate grid and readable labels in both themes', () => {
    const formatValue = (value: number) => `${value}`;
    const light = buildMonitoringChartAxes(false, formatValue);
    const dark = buildMonitoringChartAxes(true, formatValue);

    expect(light[0]?.grid?.show).toBe(true);
    expect(light[1]?.grid?.show).toBe(true);
    // --fc-fill-4, ~20/255 off the white card. --fc-fill-3 was half that and disappeared.
    expect(light[0]?.grid?.stroke).toBe('rgb(234, 234, 236)');
    expect(dark[0]?.grid?.stroke).toBe('rgba(255, 255, 255, 0.08)');
    // Labels step up one token in dark to hold the same perceived contrast on a near-black card.
    expect(light[0]?.stroke).toBe('#657386');
    expect(dark[0]?.stroke).toBe('rgb(135, 135, 146)');
    expect(light[0]?.ticks?.show).toBe(false);
    expect(light[1]?.ticks?.show).toBe(false);
  });

  it('passes the tick ladder from axis.ts through to the y axis only', () => {
    const incrs = [1, 2, 5];
    const axes = buildMonitoringChartAxes(false, (value) => `${value}`, incrs);

    expect(axes[1]?.incrs).toEqual(incrs);
    expect(axes[0]?.incrs).toBeUndefined();
  });
});
