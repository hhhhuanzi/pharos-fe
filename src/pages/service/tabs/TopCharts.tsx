import React, { useContext, useMemo, useRef } from 'react';
import { Col, Empty, Row, Spin } from 'antd';
import { useSize } from 'ahooks';
import { useTranslation } from 'react-i18next';
import type { AlignedData, Options } from 'uplot';

import UPlotChart, { axisBuilder, cursorBuider, paddingSide, scalesBuilder, seriesBuider, tooltipPlugin } from '@/components/UPlotChart';
import { CommonStateContext } from '@/App';
import { hexPalette } from '@/pages/dashboard/config';
import { alignServiceSeries, filterSeriesByNames, type NamedSeries } from '@/dh/service';

import { NS } from '../constants';
import { formatErrorRate, formatLatency, formatQps } from '../format';

type ChartKind = 'p95' | 'qps' | 'errorRate';

interface ChartCardProps {
  title: string;
  kind: ChartKind;
  series: NamedSeries[];
  names: string[];
  loading: boolean;
}

function formatPoint(kind: ChartKind, val: number): string {
  if (kind === 'p95') return formatLatency(val);
  if (kind === 'errorRate') return formatErrorRate(val);
  return formatQps(val);
}

function ChartCard(props: ChartCardProps) {
  const { title, kind, series, names, loading } = props;
  const { t } = useTranslation(NS);
  const { darkMode } = useContext(CommonStateContext);
  const wrapRef = useRef<HTMLDivElement>(null);
  const size = useSize(wrapRef);
  const width = size?.width || 0;
  const visible = useMemo(() => filterSeriesByNames(series, names), [series, names]);
  const aligned = useMemo(() => alignServiceSeries(visible), [visible]);
  const id = `n9e-dh-service-top-${kind}`;

  const options: Options | undefined = useMemo(() => {
    if (width <= 0 || aligned.labels.length === 0) return undefined;
    return {
      width,
      height: 160,
      padding: [paddingSide, paddingSide, paddingSide, paddingSide],
      legend: { show: false },
      plugins: [
        tooltipPlugin({
          id,
          mode: 'all',
          sort: 'desc',
          pointValueformatter: (val) => formatPoint(kind, Number(val)),
        }),
      ],
      cursor: cursorBuider({}),
      scales: scalesBuilder({}),
      series: seriesBuider({
        baseSeries: aligned.labels.map((label) => ({ label })),
        colors: hexPalette,
        width: 2,
        pathsType: 'spline',
        points: { show: false },
        fillOpacity: 0,
        spanGaps: true,
      }),
      axes: [
        axisBuilder({
          isTime: true,
          theme: darkMode ? 'dark' : 'light',
        }),
        axisBuilder({
          scaleKey: 'y',
          theme: darkMode ? 'dark' : 'light',
          formatValue: (v) => formatPoint(kind, Number(v)),
        }),
      ],
    };
  }, [aligned.labels, darkMode, kind, width]);

  return (
    <div className='fc-border flex h-[220px] flex-col rounded-lg bg-fc-100 p-4'>
      <div className='mb-3 shrink-0 text-base font-normal leading-none text-hint'>{title}</div>
      <div ref={wrapRef} className='min-h-0 flex-1'>
        {loading && visible.length === 0 ? (
          <div className='flex h-full items-center justify-center'>
            <Spin />
          </div>
        ) : visible.length === 0 ? (
          <div className='flex h-full items-center justify-center'>
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('overview.chart_empty')} />
          </div>
        ) : options ? (
          <UPlotChart id={id} options={options} data={aligned.frames as AlignedData} className='h-full min-h-0' />
        ) : null}
      </div>
    </div>
  );
}

interface Props {
  qps: NamedSeries[];
  errorRate: NamedSeries[];
  p95: NamedSeries[];
  qpsNames: string[];
  errorNames: string[];
  p95Names: string[];
  loading: boolean;
}

export default function TopCharts(props: Props) {
  const { t } = useTranslation(NS);
  return (
    <Row gutter={16}>
      <Col span={8}>
        <ChartCard title={t('overview.chart_p95')} kind='p95' series={props.p95} names={props.p95Names} loading={props.loading} />
      </Col>
      <Col span={8}>
        <ChartCard title={t('overview.chart_qps')} kind='qps' series={props.qps} names={props.qpsNames} loading={props.loading} />
      </Col>
      <Col span={8}>
        <ChartCard title={t('overview.chart_error')} kind='errorRate' series={props.errorRate} names={props.errorNames} loading={props.loading} />
      </Col>
    </Row>
  );
}
