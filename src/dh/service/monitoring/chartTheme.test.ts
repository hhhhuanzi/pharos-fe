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
  MONITORING_LEGEND_NAME_CLASS,
  MONITORING_LEGEND_SIDE_CLASS,
  buildMonitoringSeriesColors,
  colorWithAlpha,
  createMonitoringAreaFill,
  monitoringSeriesStroke,
  MONITORING_BASELINE_DASH,
  MONITORING_FILL_BOTTOM_ALPHA,
  MONITORING_FILL_TOP_ALPHA,
  MONITORING_ALL_LINE_WIDTH,
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

describe('createMonitoringAreaFill', () => {
  it('fades the series colour from the line down to the x-axis, quieter on a dark card', () => {
    const stops: Array<[number, string]> = [];
    const ctx = {
      createLinearGradient: (x0: number, y0: number, x1: number, y1: number) => {
        expect([x0, y0, x1, y1]).toEqual([0, 40, 0, 240]);
        return {
          addColorStop: (offset: number, color: string) => {
            stops.push([offset, color]);
          },
        };
      },
    };
    const fill = createMonitoringAreaFill('#1F78C1', false);
    expect(typeof fill).toBe('function');
    if (typeof fill !== 'function') return;
    fill({ ctx, bbox: { top: 40, height: 200 } } as never, 1);
    expect(stops).toEqual([
      [0, colorWithAlpha('#1F78C1', MONITORING_FILL_TOP_ALPHA.light)],
      [1, colorWithAlpha('#1F78C1', MONITORING_FILL_BOTTOM_ALPHA.light)],
    ]);

    stops.length = 0;
    const dark = createMonitoringAreaFill('#1F78C1', true);
    if (typeof dark !== 'function') return;
    dark({ ctx, bbox: { top: 40, height: 200 } } as never, 1);
    expect(stops[0]?.[1]).toBe(colorWithAlpha('#1F78C1', MONITORING_FILL_TOP_ALPHA.dark));
    expect(MONITORING_FILL_TOP_ALPHA.dark).toBeLessThan(MONITORING_FILL_TOP_ALPHA.light);
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

  it('keeps static guardrails at data weight so a dashed limit is not the loudest mark', () => {
    expect(monitoringSeriesStroke('ceiling')).toEqual({ width: MONITORING_REFERENCE_LINE_WIDTH, dash: MONITORING_DASH });
    expect(monitoringSeriesStroke('budget')).toEqual(monitoringSeriesStroke('ceiling'));
    expect(MONITORING_REFERENCE_LINE_WIDTH).toBe(MONITORING_CHART_LINE_WIDTH);
    expect(MONITORING_CHART_LINE_WIDTH).toBe(1);
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
  it('fills measured series, keeps request/limit dashed and unfilled, and uses a thin spline', () => {
    const colors = ['#1F78C1', BUDGET_LIGHT] as const;
    const series = buildMonitoringChartSeries([{ label: 'pod-a' }, { label: 'request' }], [...colors], [monitoringSeriesStroke(), monitoringSeriesStroke('budget')], {
      darkMode: false,
    });

    expect(series).toHaveLength(3);
    expect(series[1]?.width).toBe(MONITORING_CHART_LINE_WIDTH);
    expect(series[1]?.dash).toBeUndefined();
    expect(series[1]?.fill).toEqual(expect.any(Function));
    expect(series[1]?.paths).toEqual(expect.any(Function));
    expect(series[2]?.dash).toEqual([...MONITORING_DASH]);
    expect(series[2]?.width).toBe(MONITORING_REFERENCE_LINE_WIDTH);
    expect(series[2]?.fill).toBeUndefined();
  });

  it('draws a baseline at data weight, dashed and unfilled', () => {
    const series = buildMonitoringChartSeries(
      [{ label: 'available' }, { label: 'desired' }],
      ['#1F78C1', REFERENCE_LIGHT],
      [monitoringSeriesStroke(), monitoringSeriesStroke('baseline')],
      { darkMode: false },
    );

    expect(series[2]?.width).toBe(MONITORING_CHART_LINE_WIDTH);
    expect(series[2]?.dash).toEqual([...MONITORING_BASELINE_DASH]);
    // An area under "desired" would hide the actual it exists to be compared with.
    expect(series[2]?.fill).toBeUndefined();
  });

  it('keeps the guardrail at the same weight as the data and the target it shares a panel with', () => {
    const colors = ['#1F78C1', REFERENCE_LIGHT, CEILING_LIGHT];
    const series = buildMonitoringChartSeries(
      [{ label: 'available' }, { label: 'desired' }, { label: 'limit' }],
      colors,
      [monitoringSeriesStroke(), monitoringSeriesStroke('baseline'), monitoringSeriesStroke('ceiling')],
      { darkMode: false },
    );

    expect(series[2]?.width).toBe(series[1]?.width);
    expect(series[3]?.width).toBe(series[1]?.width);
    expect(series[3]?.dash).toEqual([...MONITORING_DASH]);
  });

  it('keeps a hidden series hidden so a legend click can turn a line off', () => {
    const series = buildMonitoringChartSeries(
      [
        { label: 'All', show: true },
        { label: 'pod-a', show: false },
      ],
      ['#1F78C1', '#BA43A9'],
      [monitoringSeriesStroke(undefined, 'all'), monitoringSeriesStroke()],
      { darkMode: false },
    );

    expect(series[1]?.show).not.toBe(false);
    expect(series[2]?.show).toBe(false);
  });

  it('draws All a hair heavier and solid so it reads as the total next to per-pod lines', () => {
    const all = monitoringSeriesStroke(undefined, 'all');
    const pod = monitoringSeriesStroke();

    expect(all.dash).toBeUndefined();
    expect(pod.dash).toBeUndefined();
    expect(all.width).toBe(MONITORING_ALL_LINE_WIDTH);
    expect(Number(all.width)).toBeGreaterThan(Number(pod.width));
    expect(MONITORING_ALL_LINE_WIDTH).toBeLessThanOrEqual(1.25);
  });

  it('fills every measured series, including a busy overlay, and never a dashed reference', () => {
    const colors = Array.from({ length: 8 }, (_, idx) => PALETTE[idx % PALETTE.length]);
    const filled = buildMonitoringChartSeries(
      colors.map((_color, idx) => ({ label: `s${idx}` })),
      colors,
      colors.map(() => monitoringSeriesStroke()),
      { darkMode: false },
    );
    const withLimit = buildMonitoringChartSeries(
      [{ label: 'pod-a' }, { label: 'limit' }],
      ['#1F78C1', CEILING_LIGHT],
      [monitoringSeriesStroke(), monitoringSeriesStroke('ceiling')],
      { darkMode: false },
    );

    expect(filled.slice(1).every((item) => typeof item.fill === 'function')).toBe(true);
    expect(filled.slice(1).every((item) => item.width === MONITORING_CHART_LINE_WIDTH)).toBe(true);
    expect(withLimit[1]?.fill).toEqual(expect.any(Function));
    expect(withLimit[2]?.fill).toBeUndefined();
  });

  it('keeps fill on a hidden series so isolate does not change how a line is painted', () => {
    const isolated = buildMonitoringChartSeries(
      [
        { label: 'pod-a', show: true },
        { label: 'pod-b', show: false },
        { label: 'pod-c', show: false },
      ],
      ['#1F78C1', '#BA43A9', '#705DA0'],
      [monitoringSeriesStroke(), monitoringSeriesStroke(), monitoringSeriesStroke()],
      { darkMode: false },
    );

    expect(isolated.slice(1).every((item) => typeof item.fill === 'function')).toBe(true);
    expect(isolated[1]?.show).not.toBe(false);
    expect(isolated[2]?.show).toBe(false);
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

  it('puts a multi-series legend on the right, with color + name only', () => {
    const labels = ['200', '204', '400', '401', '429', '500', '503'] as const;
    const layout = buildMonitoringLegendLayout([...labels]);

    expect(layout.show).toBe(true);
    expect(layout.placement).toBe('right');
    expect(layout.items).toEqual([...labels]);
    expect(layout).not.toHaveProperty('rest');
    // uPlot's legend only knows the value under the cursor; last/max/avg/min would be our own
    // reducer, so the legend deliberately stays name-only.
    expect(layout).not.toHaveProperty('max');
    expect(layout).not.toHaveProperty('avg');
    expect(layout).not.toHaveProperty('min');
    expect(layout).not.toHaveProperty('last');
  });

  it('keeps every series listed (the container scrolls) instead of truncating with a remainder', () => {
    const labels = Array.from({ length: 10 }, (_, idx) => `s${idx}`);
    const layout = buildMonitoringLegendLayout(labels);

    expect(layout.show).toBe(true);
    expect(layout.placement).toBe('right');
    expect(layout.items).toEqual(labels);
    expect(layout).not.toHaveProperty('rest');
  });

  it('preserves series order so the legend stays index-aligned with the plot colours', () => {
    const labels = ['unavailable', 'available', 'desired'] as const;

    expect(buildMonitoringLegendLayout([...labels]).items).toEqual([...labels]);
  });

  it('caps the side column so a long pod name cannot starve the plot', () => {
    expect(MONITORING_LEGEND_SIDE_CLASS).toContain('w-max');
    expect(MONITORING_LEGEND_SIDE_CLASS).toContain('max-w-[min(12rem,38%)]');
    expect(MONITORING_LEGEND_NAME_CLASS).toContain('truncate');
    expect(MONITORING_LEGEND_NAME_CLASS).toContain('[direction:rtl]');
  });
});

describe('panel definitions', () => {
  it('does not let a panel opt out of the shared area fill', () => {
    const charts = MONITORING_SECTIONS.flatMap((section) => section.panels.filter((panel) => (panel.kind || 'chart') === 'chart'));

    expect(charts.every((panel) => !('fill' in panel))).toBe(true);
  });

  it('keeps chart panels at two per row so a right legend has room for pod names', () => {
    const chartSpans = MONITORING_SECTIONS.flatMap((section) =>
      section.panels.filter((panel) => (panel.kind || 'chart') === 'chart').map((panel) => [section.id, panel.id, panel.span] as const),
    );

    expect(chartSpans.every(([, , span]) => span === 12 || span === 24)).toBe(true);
    expect(chartSpans.filter(([, , span]) => span === 8)).toEqual([]);
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
