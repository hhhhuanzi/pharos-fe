import React, { useContext, useMemo, useRef, useState } from 'react';
import { Empty, Spin, Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { useSize } from 'ahooks';
import { useTranslation } from 'react-i18next';
import type { AlignedData, Options, Series } from 'uplot';

import UPlotChart, { paddingSide, scalesBuilder, tooltipPlugin } from '@/components/UPlotChart';
import { CommonStateContext } from '@/App';
import { hexPalette } from '@/pages/dashboard/config';
import { NS } from '@/pages/service/constants';

import { alignServiceSeries, type NamedSeries } from '../../series';
import { omitRedundantAllSeries, sumSeriesAtTimestamps } from '../aggregate';
import { buildMonitoringYAxis } from '../axis';
import {
  buildMonitoringChartAxes,
  buildMonitoringChartCursor,
  buildMonitoringChartSeries,
  buildMonitoringLegendLayout,
  MONITORING_LEGEND_NAME_CLASS,
  MONITORING_LEGEND_SIDE_CLASS,
  buildMonitoringSeriesColors,
  monitoringSeriesStroke,
  MONITORING_CURSOR_CLASS,
  type MonitoringSeriesReference,
} from '../chartTheme';
import { formatMonitoringValue } from '../format';
import { isolateLegendName, isLegendNameHidden, resolveMonitoringSeriesName } from '../legend';
import type { MonitoringPanelDef, MonitoringSectionQuery } from '../panels';
import type { MonitoringSeries } from '../query';
import { readUplotSelectRange } from '../zoom';
import type { IRawTimeRange } from '@/components/TimeRangePicker';
import moment from 'moment';

export interface PanelChartEntry {
  target: MonitoringSectionQuery;
  series: MonitoringSeries[];
}

interface Props {
  panel: MonitoringPanelDef;
  entries: PanelChartEntry[];
  loading: boolean;
  emptyDescription: string;
  /** Box-select updates the page time range, not a local visual zoom. */
  onRangeChange?: (range: IRawTimeRange) => void;
}

interface ResolvedSeries extends NamedSeries {
  reference?: MonitoringSeriesReference;
  emphasis?: 'all';
}

export default function PanelChart({ panel, entries, loading, emptyDescription, onRangeChange }: Props) {
  const { t } = useTranslation(NS);
  const { darkMode } = useContext(CommonStateContext);
  const wrapRef = useRef<HTMLDivElement>(null);
  const onRangeChangeRef = useRef(onRangeChange);
  onRangeChangeRef.current = onRangeChange;
  const [focusedName, setFocusedName] = useState<string | undefined>();
  const size = useSize(wrapRef);
  const width = size?.width || 0;
  const height = size?.height || 0;
  const id = `n9e-dh-service-monitoring-${panel.id}`;

  const resolved = useMemo<ResolvedSeries[]>(() => {
    const fallbackTitle = t(panel.titleKey);
    const named = entries.flatMap(({ target, series }) =>
      series.flatMap((item) => {
        const name = resolveMonitoringSeriesName(item.metric, target.nameLabels, target.nameKey ? t(target.nameKey) : undefined, target.nameRewrite, fallbackTitle);
        if (!name) return [];
        return [{ name, points: item.points, reference: target.reference, emphasis: target.emphasis }];
      }),
    );
    const withAll =
      panel.deriveAll === 'sum' && named.length > 0 ? [{ name: t('monitoring.legend.all'), points: sumSeriesAtTimestamps(named), emphasis: 'all' as const }, ...named] : named;
    return omitRedundantAllSeries(withAll);
  }, [entries, panel.deriveAll, panel.titleKey, t]);

  const aligned = useMemo(() => alignServiceSeries(resolved), [resolved]);
  // `resolved`, `aligned.labels`, `colors` and `strokes` stay index-aligned, so the plot and the
  // legend cannot show the same series in two different colours or two different weights.
  const references = useMemo(() => resolved.map((item) => item.reference), [resolved]);
  const strokes = useMemo(() => resolved.map((item) => monitoringSeriesStroke(item.reference, item.emphasis)), [resolved]);
  const colors = useMemo(() => buildMonitoringSeriesColors(references, hexPalette, darkMode), [references, darkMode]);
  // A vanished pod name must not keep every remaining series hidden.
  const isolate = useMemo(() => (focusedName && resolved.some((item) => item.name === focusedName) ? focusedName : undefined), [focusedName, resolved]);
  // Reference lines are weighted differently from measured data, so they are collected apart.
  // Hidden series are left out so isolating one pod shrinks the axis onto that line.
  const yAxis = useMemo(() => {
    const values: Array<number | null> = [];
    const references: Array<number | null> = [];
    aligned.frames.slice(1).forEach((row, idx) => {
      const series = resolved[idx];
      if (!series || isLegendNameHidden(isolate, series.name)) return;
      const bucket = series.reference ? references : values;
      row.forEach((value) => bucket.push(value));
    });
    return buildMonitoringYAxis({ unit: panel.unit, mode: panel.yAxis, values, references });
  }, [aligned.frames, isolate, panel.unit, panel.yAxis, resolved]);

  const options: Options | undefined = useMemo(() => {
    if (width <= 0 || height <= 0 || aligned.labels.length === 0 || aligned.times.length === 0) return undefined;
    const formatValue = (value: unknown) => formatMonitoringValue(panel.unit, Number(value));
    // Weight and dash are stamped by `buildMonitoringChartSeries` from the same `strokes` the
    // legend swatches use, so the label is all this needs to carry.
    const baseSeries: Series[] = resolved.map((item) => ({ label: item.name, show: !isLegendNameHidden(isolate, item.name) }));
    return {
      width,
      height,
      padding: [paddingSide, paddingSide, paddingSide, paddingSide],
      legend: { show: false },
      plugins: [
        tooltipPlugin({
          id,
          mode: 'all',
          sort: 'desc',
          pointValueformatter: formatValue,
        }),
      ],
      cursor: {
        ...buildMonitoringChartCursor(),
        // Select without local scale zoom: the page range is what every panel queries.
        drag: { x: true, y: false, setScale: false },
      },
      hooks: {
        setSelect: [
          (u) => {
            const boxed = readUplotSelectRange(u);
            if (!boxed) return;
            onRangeChangeRef.current?.({
              start: moment.unix(boxed.min),
              end: moment.unix(boxed.max),
            });
          },
        ],
      },
      scales: scalesBuilder({ yRange: yAxis.range }),
      series: buildMonitoringChartSeries(baseSeries, colors, strokes, { darkMode }),
      axes: buildMonitoringChartAxes(darkMode, formatValue, yAxis.incrs),
    };
  }, [aligned.labels, aligned.times.length, colors, darkMode, height, id, isolate, panel.unit, resolved, strokes, width, yAxis]);

  const legend = useMemo(() => buildMonitoringLegendLayout(aligned.labels), [aligned.labels]);

  return (
    <div className='fc-border flex h-[300px] flex-col rounded-lg bg-fc-100 p-4'>
      {/* Panel titles are one step under the section header (16px bold) in both size and weight, and
          one step over the 12px labels inside the card. */}
      <div className='mb-3 flex shrink-0 items-center gap-2 text-l1 font-medium leading-none text-title'>
        <span className='truncate' title={t(panel.titleKey)}>
          {t(panel.titleKey)}
        </span>
        {panel.hintKey ? (
          <Tooltip title={t(panel.hintKey)}>
            <QuestionCircleOutlined className='text-soft' />
          </Tooltip>
        ) : null}
      </div>
      {/* Plot left, legend right. Long pod names stack; they never wrap under the plot. */}
      <div className='flex min-h-0 flex-1 gap-3'>
        <div ref={wrapRef} className='min-h-0 min-w-0 flex-1'>
          {loading && aligned.labels.length === 0 ? (
            <div className='flex h-full items-center justify-center'>
              <Spin />
            </div>
          ) : aligned.labels.length === 0 ? (
            <div className='flex h-full items-center justify-center'>
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyDescription} />
            </div>
          ) : options ? (
            <UPlotChart id={id} options={options} data={aligned.frames as AlignedData} className={`h-full min-h-0 ${MONITORING_CURSOR_CLASS}`} />
          ) : null}
        </div>
        {legend.show ? (
          /* `w-max` hugs short names (200 / GET); the 12rem / 38% cap keeps the plot. Names that
             still overflow ellipsize from the left so the pod hash stays visible; `title` has all. */
          <div className={`best-looking-scroll shrink-0 text-base text-hint ${MONITORING_LEGEND_SIDE_CLASS}`}>
            {legend.items.map((label, idx) => {
              const hidden = isLegendNameHidden(isolate, label);
              return (
                <button
                  key={`${label}-${idx}`}
                  type='button'
                  onClick={() => setFocusedName((current) => isolateLegendName(current, label))}
                  className={`flex max-w-full cursor-pointer select-none items-center gap-2 border-0 bg-transparent p-0 text-left text-base leading-5 ${
                    hidden ? 'text-soft line-through opacity-40' : 'text-hint'
                  }`}
                >
                  {/* Colour only, same chip for every series: the plotted line is what says solid or
                      dashed. Matches the shared uPlot tooltip chip, which is also 12x4 solid. */}
                  <i className='inline-block h-1 w-3 shrink-0 rounded-sm' style={{ backgroundColor: colors[idx] }} />
                  <span className={MONITORING_LEGEND_NAME_CLASS} title={label}>
                    {label}
                  </span>
                </button>
              );
            })}
            {isolate ? (
              <button
                type='button'
                onClick={() => setFocusedName(undefined)}
                className='cursor-pointer select-none border-0 bg-transparent p-0 text-left text-base leading-5 text-link'
              >
                {t('monitoring.legend.show_all')}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
