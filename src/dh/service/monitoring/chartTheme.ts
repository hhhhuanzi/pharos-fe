import type { Axis, Cursor, Series } from 'uplot';

import axisBuilder from '@/components/UPlotChart/utils/axisBuilder';
import cursorBuider from '@/components/UPlotChart/utils/cursorBuilder';
import seriesBuider from '@/components/UPlotChart/utils/seriesBuider';

/** Grafana-like hairline. uPlot takes CSS px and scales by devicePixelRatio itself. */
export const MONITORING_CHART_LINE_WIDTH = 1;
/** All is the same kind of line, just a hair heavier so the total still reads next to pods. */
export const MONITORING_ALL_LINE_WIDTH = 1.25;
/**
 * Guardrails stay at data weight. Dash + semantic hue already tell them apart from a pod; extra
 * width made a static `limit` the loudest mark on an otherwise quiet panel.
 */
export const MONITORING_REFERENCE_LINE_WIDTH = 1;
/**
 * Segments four times the stroke keep the guardrails reading as a dashed *line*; much shorter and
 * they turn into dots. The gap is the smallest that still separates them at this weight.
 */
export const MONITORING_DASH: readonly [number, number] = [8, 5];
/** Same rhythm at data weight; `[8, 6]` reads as sparse once the line is a hairline. */
export const MONITORING_BASELINE_DASH: readonly [number, number] = [6, 4];

/**
 * `hexPalette` opens green → yellow → cyan → orange → red, which are the exact hues this page uses
 * to mean healthy / worth-a-look / broken. Left alone it would draw every single-series chart in
 * "healthy" green and hand "broken" red to whichever pod happens to sort fifth. Rotating the shared
 * palette keeps one source of series colours while starting on a neutral blue, and pushes the
 * status-like hues past the point where a colour still reads as a verdict rather than an index.
 *
 * Re-checked after `@/dh/status` made green the *normal* verdict rather than a rare one. Series
 * colour and verdict colour still cannot be confused, because they never apply to the same kind of
 * mark: a verdict only ever tints a number in a stat card or table cell, never a stroke, a fill or
 * a legend swatch, and every stroke is bound to a name in the legend that explains it as an index.
 * The two greens are not even the same colour — the verdict green is `--fc-fill-success`, while
 * this palette's greens (`#7EB26D`, `#508642`) are the olive Grafana classics — and the offset
 * still keeps a green stroke out of the first three series, where a single-series chart could
 * suggest a verdict.
 */
export const MONITORING_PALETTE_OFFSET = 5;

/**
 * Grafana-style opacity gradient: stronger at the line, almost gone at the x-axis.
 * Dark cards make the same alpha look louder, so both stops are a step quieter there.
 * Values stay modest so a status-code plot with 6–8 bands does not turn into one wash.
 */
export const MONITORING_FILL_TOP_ALPHA = { light: 0.24, dark: 0.16 } as const;
export const MONITORING_FILL_BOTTOM_ALPHA = { light: 0.02, dark: 0.01 } as const;

/**
 * Vertical fade in *canvas* pixels (`u.bbox` is already device-pixel). Rebuilt on every draw so a
 * resize cannot leave the gradient pointing at the previous plot height.
 */
export function createMonitoringAreaFill(color: string, darkMode: boolean): Series.Fill {
  const theme = darkMode ? 'dark' : 'light';
  const topAlpha = MONITORING_FILL_TOP_ALPHA[theme];
  const bottomAlpha = MONITORING_FILL_BOTTOM_ALPHA[theme];
  return (u) => {
    const y0 = u.bbox.top;
    const y1 = u.bbox.top + u.bbox.height;
    const gradient = u.ctx.createLinearGradient(0, y0, 0, y1);
    gradient.addColorStop(0, colorWithAlpha(color, topAlpha));
    gradient.addColorStop(1, colorWithAlpha(color, bottomAlpha));
    return gradient;
  };
}

/**
 * A series that is not one of the measured statuses. They are told apart by hue, because
 * "you crossed this" means something different for each:
 *
 * - `ceiling`: a hard boundary enforced by the platform — crossing it gets the container
 *   OOMKilled or throttled (memory / cpu / jvm heap `limit`). Amber, because "how close am I to
 *   it" is the question these panels exist to answer.
 * - `budget`: a reservation the scheduler made (`request`). Crossing it is routine and means
 *   nothing is wrong, so it gets its own hue rather than a louder version of the ceiling's.
 * - `baseline`: a measured target that moves with the workload (desired replicas). It sits right
 *   next to the series it is compared with, so it stays in neutral chrome grey and asserts
 *   nothing — it is the target, not a verdict on the actual.
 *
 * `ceiling` and `budget` share one dashed hairline: they are static platform numbers, and the
 * distinction that has to survive a glance is dash vs solid, then hue (amber vs violet). `baseline`
 * is a real `kube_deployment_spec_replicas` series drawn dashed in chrome grey — a target, not a
 * louder mark.
 *
 * Solid vs dashed and thin vs thick are both said by the plotted line. The legend only maps a
 * colour to a name, so its swatches are all the same solid chip — a 12px chip is too small to
 * render a dash rhythm or a weight difference without looking like a rendering artefact.
 */
export type MonitoringSeriesReference = 'ceiling' | 'budget' | 'baseline';

/** How a series is stroked on the plot. */
export interface MonitoringSeriesStroke {
  /** uPlot line width. */
  width: number;
  /** uPlot dash pattern; absent means a solid stroke, which only a measured series gets. */
  dash?: readonly [number, number];
}

export function monitoringSeriesStroke(reference?: MonitoringSeriesReference, emphasis?: 'all'): MonitoringSeriesStroke {
  if (emphasis === 'all') return { width: MONITORING_ALL_LINE_WIDTH };
  if (reference === undefined) return { width: MONITORING_CHART_LINE_WIDTH };
  if (reference === 'baseline') return { width: MONITORING_CHART_LINE_WIDTH, dash: MONITORING_BASELINE_DASH };
  return { width: MONITORING_REFERENCE_LINE_WIDTH, dash: MONITORING_DASH };
}

export type MonitoringLegendPlacement = 'none' | 'right';

export interface MonitoringLegendLayout {
  show: boolean;
  /** Single-series: hidden. Multi-series: a right column; long names wrap in place. */
  placement: MonitoringLegendPlacement;
  items: string[];
}

/**
 * Side-column width: hug short names (200 / GET), but stop at 16rem / 42% so the plot keeps the
 * rest. Long pod names wrap inside this cap; the column scrolls vertically, never sideways.
 */
export const MONITORING_LEGEND_SIDE_CLASS = 'flex min-h-0 w-max max-w-[min(16rem,42%)] flex-col gap-1 overflow-x-hidden';

/**
 * Full name, always. K8s labels have no spaces, so `break-all` wraps on a character boundary
 * instead of clipping. `select-text` lets the user copy by dragging; isolate is a click without
 * a selection. No ellipsis, no RTL, no hover-to-reveal.
 */
export const MONITORING_LEGEND_NAME_CLASS = 'min-w-0 flex-1 cursor-text select-text break-all text-left';

/**
 * Service-monitoring HTML legend only. Not uPlot / official Dashboard legend.
 * Color + name; click-to-isolate lives on the HTML rows in `PanelChart`. No max/avg/min/last.
 *
 * A single series stays legend-less. Hiding that one row also removes the gutter by construction
 * instead of trying to make an almost-empty gutter look intentional, and hands the freed width
 * back to the plot. A requested label that never arrived is dropped in
 * `resolveMonitoringSeriesName`, so a leftover HTTP-status series cannot become
 * "HTTP 状态码 QPS" in the legend.
 */
export function buildMonitoringLegendLayout(labels: string[]): MonitoringLegendLayout {
  if (labels.length <= 1) {
    return { show: false, placement: 'none', items: [] };
  }
  return {
    show: true,
    placement: 'right',
    items: labels,
  };
}

/**
 * Canvas cannot read CSS variables. Values stay in sync with `src/theme/variable.css`.
 *
 * Light uses `--fc-text-4`, dark steps up to `--fc-text-3`: the same token on a near-black card
 * only reaches ~3.5:1, which is unreadable at 12px, so dark needs one extra step to land at the
 * same *perceived* contrast rather than the same nominal value.
 */
const AXIS_LABEL_COLOR = {
  light: '#657386',
  dark: 'rgb(135, 135, 146)',
} as const;

/**
 * The grid orients the eye; it must never compete with a data line. Light `--fc-fill-4` and dark
 * `--fc-border-color2` both sit ~20/255 away from the card fill, so the mesh reads as equally
 * present in either theme. The previous light value (`--fc-fill-3`) was 11/255 from a white card
 * and effectively vanished.
 */
const GRID_STROKE = {
  light: 'rgb(234, 234, 236)',
  dark: 'rgba(255, 255, 255, 0.08)',
} as const;

/**
 * Desired-replicas is not a measurement, so it is drawn in the chrome grey (`--fc-text-3`) rather
 * than a palette colour: clearly separate from every data line, clearly not one of them, and not
 * loud enough to pull the eye away from what the pods are actually doing. Also the fallback when a
 * caller passes an empty palette.
 */
const REFERENCE_LINE_COLOR = {
  light: '#3f4856',
  dark: 'rgb(135, 135, 146)',
} as const;

/**
 * `request` gets `--fc-violet-11`.
 *
 * This token set only carries four status hues — red, orange, yellow, green — and violet / indigo
 * as plain accents, which is exactly why violet can sit permanently on a chart without asserting
 * anything about health. Of those two accents it is the one further from the data blue
 * (`#1F78C1`), so a flat violet hairline never reads as one more pod.
 *
 * Not the yellow, orange or green that were suggested: orange is already `limit`, and a second
 * orange hairline puts the two guardrails back in one hue, which is the exact confusion this
 * page just fixed. Yellow is this system's *warning* scale (`--fc-fill-warning`, light
 * `rgb(250, 200, 0)`) and must not sit on a permanent request line. Green is
 * the *success* scale and `hexPalette` already spends two slots on greens.
 *
 * Light `rgb(107, 81, 175)` is ~6.1:1 on a white card, dark `rgb(184, 164, 255)` ~8:1 on a dark
 * one; both are well clear of the 3:1 WCAG asks of a graphical object, and both are stronger than
 * the grey they replace.
 */
const REFERENCE_BUDGET_COLOR = {
  light: 'rgb(107, 81, 175)',
  dark: 'rgb(184, 164, 255)',
} as const;

/**
 * `limit` gets `--fc-orange-11`, and deliberately not red.
 *
 * A limit line is drawn on every healthy panel forever. In red it would put a permanent alarm
 * colour on a service that is behaving perfectly — the same mistake as painting every single-series
 * chart "healthy" green, run in reverse: after the tenth healthy service with a red line, red stops
 * meaning anything, and the page loses the colour it needs for a service that really is broken.
 * Amber makes the honest claim instead: *this is the edge*, not *you are over it*.
 *
 * Step 11 of the scale is the darker, burnt end (light `rgb(210, 77, 0)`, ~4.4:1 on a white card —
 * on par with the blue data line and well past the 3:1 WCAG asks of a graphical object). It is not
 * the vivid yellow the stat cards use for a warning *state*, so a static boundary line cannot be
 * misread as this service currently being in trouble.
 */
const REFERENCE_CEILING_COLOR = {
  light: 'rgb(210, 77, 0)',
  dark: 'rgb(255, 157, 97)',
} as const;

export function colorWithAlpha(hex: string, alpha: number): string {
  const raw = hex.startsWith('#') ? hex.slice(1) : hex;
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((ch) => `${ch}${ch}`)
          .join('')
      : raw;
  const n = Number.parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Colour per series, in the same order as the aligned labels, so the plot and the HTML legend
 * cannot drift apart. No reference line consumes a palette slot — otherwise a CPU panel with one
 * pod would spend three palette colours and its pod would not be first.
 *
 * `ceiling` is the one reference that takes a hue of its own; that is what finally separates
 * `request` from `limit`, which used to be the same grey at the same weight and so were only
 * tellable apart by hovering.
 */
export function buildMonitoringSeriesColors(references: Array<MonitoringSeriesReference | undefined>, palette: string[], darkMode: boolean): string[] {
  const theme = darkMode ? 'dark' : 'light';
  const referenceColor = REFERENCE_LINE_COLOR[theme];
  let measured = 0;
  return references.map((reference) => {
    if (reference === 'ceiling') return REFERENCE_CEILING_COLOR[theme];
    if (reference === 'budget') return REFERENCE_BUDGET_COLOR[theme];
    if (reference !== undefined) return referenceColor;
    if (palette.length === 0) return referenceColor;
    const color = palette[(measured + MONITORING_PALETTE_OFFSET) % palette.length];
    measured += 1;
    return color;
  });
}

/**
 * Service-monitoring series only. Official Explorer / Dashboard keep their own options.
 * `seriesBuider` fill is skipped (it only paints when `stroke` is a function); area fill is applied here.
 *
 * `strokes` is index-aligned with `baseSeries`, so `strokes[i]` describes `series[i + 1]`.
 * `seriesBuider` spreads each base series *before* stamping its own uniform `width`, so per-series
 * weight and dash have to be applied here, after it has run.
 */
export interface MonitoringChartSeriesOptions {
  darkMode: boolean;
}

export function buildMonitoringChartSeries(baseSeries: Series[], colors: string[], strokes: MonitoringSeriesStroke[], options: MonitoringChartSeriesOptions): Series[] {
  const series = seriesBuider({
    baseSeries,
    colors,
    width: MONITORING_CHART_LINE_WIDTH,
    pathsType: 'spline',
    points: { show: false },
    fillOpacity: 0,
    spanGaps: true,
  });
  return series.map((item, idx) => {
    if (idx === 0) return item;
    const stroke = strokes[idx - 1];
    if (!stroke) return item;
    const styled: Series = { ...item, width: stroke.width, dash: stroke.dash ? [...stroke.dash] : undefined };
    // A reference is never filled: an area under "limit" would read as the limit being consumed,
    // and an area under "desired" would hide the actual it exists to be compared with.
    if (stroke.dash) return styled;
    const color = colors[(idx - 1) % colors.length];
    return { ...styled, fill: createMonitoringAreaFill(color, options.darkMode) };
  });
}

/**
 * uPlot draws its crosshair as two DOM lines, `.u-cursor-x` (vertical) and `.u-cursor-y`
 * (horizontal), both `1px dashed #607D8B` from `uPlot.min.css`.
 *
 * The horizontal one is dropped. It follows the pointer's y position, which is not a number the
 * chart ever plotted, and a grey horizontal hairline is exactly what `limit` and `request` look
 * like — people read it as a fourth reference line and went looking for what it meant. `cursor.y`
 * is read in one place in uPlot (whether to create that div), so switching it off costs nothing:
 * the tooltip, the per-series points and the hit testing are all driven by the x position.
 *
 * The vertical one stays, because it is the only thing tying the tooltip's numbers to a place on
 * the plot, but it is restyled solid. That leaves one dash vocabulary on the whole plot — dashed
 * means reference, solid means data or chrome — and the crosshair is separated from the references
 * a second time by running the other way.
 */
export function buildMonitoringChartCursor(): Cursor {
  return cursorBuider({ y: false });
}

/**
 * Applied to the `UPlotChart` wrapper, because the dash lives in uPlot's own stylesheet and there
 * is no option for it. Tailwind is configured with `important: true`, so this wins over uPlot's
 * `border-right` shorthand without a specificity fight and without touching the shared component.
 *
 * It has to be the `border-right` *shorthand*, not Tailwind's `border-r` + `border-solid` +
 * `border-r-[colour]` trio. `border-solid` sets `border-style` on all four sides, and a border
 * whose style is `none` only computes to zero width *because* of that style — the initial
 * `border-width` underneath is `medium`, i.e. 3px. Styling all four sides solid therefore
 * resurrected the three sides uPlot never asked for, at 3px each, in `currentColor` (near-black
 * body text, since only `border-right-color` had been overridden). Measured in Chrome: 4px wide
 * with a 3px near-black left edge, against the 1px hairline that was intended. Tailwind's preflight
 * would normally zero those widths app-wide, but it is switched off here to coexist with antd.
 *
 * `--fc-text-4` at 50% resolves to ~rgb(178, 185, 195) on a light card and ~rgb(66, 66, 72) on a
 * dark one: clearly stronger than the grid, far weaker than any data line. A crosshair only has to
 * say "here"; it is the one mark on the plot that carries no value of its own.
 */
export const MONITORING_CURSOR_CLASS = ['[&_.u-cursor-x]:[border-right:1px_solid_var(--fc-text-4)]', '[&_.u-cursor-x]:opacity-[0.5]'].join(' ');

/** `incrs` is owned by `axis.ts` (tick ladder); it is passed straight through to the y axis. */
export function buildMonitoringChartAxes(darkMode: boolean, formatValue: (value: number) => string, incrs?: number[]): Axis[] {
  const theme = darkMode ? 'dark' : 'light';
  const labelColor = AXIS_LABEL_COLOR[theme];
  const gridStroke = GRID_STROKE[theme];
  const patchGrid = (axis: Axis): Axis => ({
    ...axis,
    grid: {
      ...axis.grid,
      show: true,
      stroke: gridStroke,
    },
  });

  return [
    patchGrid(
      axisBuilder({
        isTime: true,
        theme,
        color: labelColor,
        ticks: { show: false },
      }),
    ),
    patchGrid(
      axisBuilder({
        scaleKey: 'y',
        theme,
        color: labelColor,
        formatValue,
        incrs,
        ticks: { show: false },
      }),
    ),
  ];
}
