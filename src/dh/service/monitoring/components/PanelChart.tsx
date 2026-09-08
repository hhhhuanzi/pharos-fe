import React, { useContext, useMemo, useRef } from 'react';
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
import { buildMonitoringYAxis } from '../axis';
import {
  buildMonitoringChartAxes,
  buildMonitoringChartCursor,
  buildMonitoringChartSeries,
  buildMonitoringLegendLayout,
  buildMonitoringSeriesColors,
  monitoringFillOpacity,
  monitoringSeriesStroke,
  MONITORING_CURSOR_CLASS,
  type MonitoringSeriesReference,
} from '../chartTheme';
import { formatMonitoringValue, monitoringSeriesName } from '../format';
import type { MonitoringPanelDef, MonitoringSectionQuery } from '../panels';
import type { MonitoringSeries } from '../query';

export interface PanelChartEntry {
  target: MonitoringSectionQuery;
  series: MonitoringSeries[];
}

interface Props {
  panel: MonitoringPanelDef;
  entries: PanelChartEntry[];
  loading: boolean;
  emptyDescription: string;
}

interface ResolvedSeries extends NamedSeries {
  reference?: MonitoringSeriesReference;
}

export default function PanelChart({ panel, entries, loading, emptyDescription }: Props) {
  const { t } = useTranslation(NS);
  const { darkMode } = useContext(CommonStateContext);
  const wrapRef = useRef<HTMLDivElement>(null);
  const size = useSize(wrapRef);
  const width = size?.width || 0;
  const height = size?.height || 0;
  const id = `n9e-dh-service-monitoring-${panel.id}`;

  const resolved = useMemo<ResolvedSeries[]>(
    () =>
      entries.flatMap(({ target, series }) =>
        series.map((item) => ({
          // `sum(rate(...))` collapses every dimension, so QPS / error rate / P95 come back with no
          // labels at all and uPlot falls back to its own "Value" placeholder in the tooltip. The
          // panel title is what that single series actually is.
          name: monitoringSeriesName(item.metric, target.nameLabels, target.nameKey ? t(target.nameKey) : undefined, target.nameRewrite) || t(panel.titleKey),
          points: item.points,
          reference: target.reference,
        })),
      ),
    [entries, panel.titleKey, t],
  );

  const aligned = useMemo(() => alignServiceSeries(resolved), [resolved]);
  // `resolved`, `aligned.labels`, `colors` and `strokes` stay index-aligned, so the plot and the
  // legend cannot show the same series in two different colours or two different weights.
  const references = useMemo(() => resolved.map((item) => item.reference), [resolved]);
  const strokes = useMemo(() => resolved.map((item) => monitoringSeriesStroke(item.reference)), [resolved]);
  const colors = useMemo(() => buildMonitoringSeriesColors(references, hexPalette, darkMode), [references, darkMode]);
  const fillOpacity = useMemo(() => monitoringFillOpacity(references.filter((reference) => reference === undefined).length), [references]);
  // Reference lines are weighted differently from measured data, so they are collected apart.
  const yAxis = useMemo(() => {
    const values: Array<number | null> = [];
    const references: Array<number | null> = [];
    aligned.frames.slice(1).forEach((row, idx) => {
      const bucket = resolved[idx]?.reference ? references : values;
      row.forEach((value) => bucket.push(value));
    });
    return buildMonitoringYAxis({ unit: panel.unit, mode: panel.yAxis, values, references });
  }, [aligned.frames, panel.unit, panel.yAxis, resolved]);

  const options: Options | undefined = useMemo(() => {
    if (width <= 0 || height <= 0 || aligned.labels.length === 0 || aligned.times.length === 0) return undefined;
    const formatValue = (value: unknown) => formatMonitoringValue(panel.unit, Number(value));
    // Weight and dash are stamped by `buildMonitoringChartSeries` from the same `strokes` the
    // legend swatches use, so the label is all this needs to carry.
    const baseSeries: Series[] = resolved.map((item) => ({ label: item.name }));
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
      cursor: buildMonitoringChartCursor(),
      scales: scalesBuilder({ yRange: yAxis.range }),
      series: buildMonitoringChartSeries(baseSeries, colors, fillOpacity, strokes),
      axes: buildMonitoringChartAxes(darkMode, formatValue, yAxis.incrs),
    };
  }, [aligned.labels, aligned.times.length, colors, darkMode, fillOpacity, height, id, panel.unit, resolved, strokes, width, yAxis]);

  const legend = useMemo(() => buildMonitoringLegendLayout(aligned.labels, panel.legend), [aligned.labels, panel.legend]);
  const onSide = legend.placement === 'right';

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
      {/* Same plot + same legend markup either way; only the axis the two are stacked along changes. */}
      <div className={`flex min-h-0 flex-1 ${onSide ? 'gap-3' : 'flex-col'}`}>
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
          /* Side column: `w-max` keeps it exactly as wide as its widest name, so the replicas trend
             spends ~60px rather than a gutter sized for the worst case, and the 38% cap stops a long
             name from starving the plot — past it names ellipsize and keep the full text in `title`.
             Bottom: wraps and is capped at two rows. Both scroll rather than show a "+N more" row,
             so every series stays reachable on a busy panel. */
          <div
            className={`best-looking-scroll shrink-0 text-base text-hint ${
              onSide ? 'flex min-h-0 w-max max-w-[38%] flex-col gap-1' : 'mt-2 flex max-h-12 flex-wrap items-center gap-x-3 gap-y-1'
            }`}
          >
            {legend.items.map((label, idx) => (
              <span key={`${label}-${idx}`} className='flex max-w-full items-center gap-2 leading-5'>
                {/* Colour only, same chip for every series: the plotted line is what says solid or
                    dashed. Matches the shared uPlot tooltip chip, which is also 12x4 solid. */}
                <i className='inline-block h-1 w-3 shrink-0 rounded-sm' style={{ backgroundColor: colors[idx] }} />
                <span className='truncate' title={label}>
                  {label}
                </span>
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
