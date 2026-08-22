import React, { useContext, useMemo, useRef } from 'react';
import { Empty, Spin, Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { useSize } from 'ahooks';
import { useTranslation } from 'react-i18next';
import type { AlignedData, Options, Series } from 'uplot';

import UPlotChart, { axisBuilder, cursorBuider, paddingSide, scalesBuilder, seriesBuider, tooltipPlugin } from '@/components/UPlotChart';
import { CommonStateContext } from '@/App';
import { hexPalette } from '@/pages/dashboard/config';
import { NS } from '@/pages/service/constants';

import { alignServiceSeries, errorRateYMax, type NamedSeries } from '../../series';
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

const LEGEND_LIMIT = 8;

interface ResolvedSeries extends NamedSeries {
  dashed: boolean;
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
          name: monitoringSeriesName(item.metric, target.nameLabels, target.nameKey ? t(target.nameKey) : undefined, target.nameRewrite),
          points: item.points,
          dashed: Boolean(target.dashed),
        })),
      ),
    [entries, t],
  );

  const aligned = useMemo(() => alignServiceSeries(resolved), [resolved]);
  const colors = useMemo(() => aligned.labels.map((_label, idx) => hexPalette[idx % hexPalette.length]), [aligned.labels]);
  const yMax = useMemo(
    () => (panel.unit === 'percentUnit' ? errorRateYMax(aligned.frames.slice(1).flat()) : undefined),
    [aligned.frames, panel.unit],
  );

  const options: Options | undefined = useMemo(() => {
    if (width <= 0 || height <= 0 || aligned.labels.length === 0 || aligned.times.length === 0) return undefined;
    const formatValue = (value: unknown) => formatMonitoringValue(panel.unit, Number(value));
    const baseSeries: Series[] = resolved.map((item) => (item.dashed ? { label: item.name, dash: [6, 4] } : { label: item.name }));
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
      cursor: cursorBuider({}),
      scales: scalesBuilder(yMax != null ? { yRange: [0, yMax] } : {}),
      series: seriesBuider({
        baseSeries,
        colors,
        width: 2,
        pathsType: 'linear',
        points: { show: false },
        fillOpacity: 0,
        spanGaps: true,
      }),
      axes: [
        axisBuilder({ isTime: true, theme: darkMode ? 'dark' : 'light' }),
        axisBuilder({
          scaleKey: 'y',
          theme: darkMode ? 'dark' : 'light',
          formatValue,
        }),
      ],
    };
  }, [aligned.labels, aligned.times.length, colors, darkMode, height, id, panel.unit, resolved, width, yMax]);

  const legend = aligned.labels.slice(0, LEGEND_LIMIT);
  const legendRest = aligned.labels.length - legend.length;

  return (
    <div className='fc-border flex h-[300px] flex-col rounded-lg bg-fc-100 p-4'>
      <div className='mb-3 flex shrink-0 items-center gap-2 text-base font-normal leading-none text-hint'>
        <span className='truncate' title={t(panel.titleKey)}>
          {t(panel.titleKey)}
        </span>
        {panel.hintKey ? (
          <Tooltip title={t(panel.hintKey)}>
            <QuestionCircleOutlined className='text-soft' />
          </Tooltip>
        ) : null}
      </div>
      <div ref={wrapRef} className='min-h-0 flex-1'>
        {loading && aligned.labels.length === 0 ? (
          <div className='flex h-full items-center justify-center'>
            <Spin />
          </div>
        ) : aligned.labels.length === 0 ? (
          <div className='flex h-full items-center justify-center'>
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyDescription} />
          </div>
        ) : options ? (
          <UPlotChart id={id} options={options} data={aligned.frames as AlignedData} className='h-full min-h-0' />
        ) : null}
      </div>
      {legend.length ? (
        <div className='mt-2 flex shrink-0 flex-wrap gap-x-3 gap-y-1 text-base text-hint'>
          {legend.map((label, idx) => (
            <span key={`${label}-${idx}`} className='flex max-w-[220px] items-center gap-2'>
              <i className='inline-block h-1 w-3 shrink-0 rounded-lg' style={{ backgroundColor: colors[idx] }} />
              <span className='truncate' title={label}>
                {label}
              </span>
            </span>
          ))}
          {legendRest > 0 ? <span className='text-soft'>{t('monitoring.legend_more', { count: legendRest })}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
