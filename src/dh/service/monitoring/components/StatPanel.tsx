import React, { useMemo } from 'react';
import { Col, Empty, Row, Spin, Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

import { NS } from '@/pages/service/constants';

import { formatMonitoringValue, type MonitoringUnit } from '../format';
import type { MonitoringAbsentMode, MonitoringPanelDef, MonitoringTargetDef } from '../panels';
import { reduceSeries } from '../values';
import type { PanelChartEntry } from './PanelChart';

interface Props {
  panel: MonitoringPanelDef;
  entries: PanelChartEntry[];
  loading: boolean;
}

interface ResolvedMetric {
  target: MonitoringTargetDef;
  value?: number;
  empty: boolean;
}

function seriesFor(entries: PanelChartEntry[], refId: string) {
  return entries.find((entry) => entry.target.refId === refId)?.series || [];
}

function resolveMetric(target: MonitoringTargetDef, entries: PanelChartEntry[]): ResolvedMetric {
  const series = seriesFor(entries, target.refId);
  const value = reduceSeries(series, target.reduce);
  return { target, value, empty: series.length === 0 || value == null };
}

function absentText(absent: MonitoringAbsentMode | undefined, t: (key: string) => string): string {
  if (absent === 'uninstrumented') return t('monitoring.stat.uninstrumented');
  if (absent === 'zero') return formatMonitoringValue('count', 0);
  return '—';
}

function displayValue(metric: ResolvedMetric, fallbackUnit: MonitoringUnit, t: (key: string) => string): string {
  if (metric.empty) return absentText(metric.target.absent, t);
  return formatMonitoringValue(metric.target.unit || fallbackUnit, metric.value);
}

function errorRateClass(rate?: number): string {
  if (rate == null || !Number.isFinite(rate)) return 'text-soft';
  if (rate >= 0.05) return 'text-error';
  if (rate >= 0.01) return 'text-warning';
  return 'text-success';
}

function waterClass(ratio?: number): string {
  if (ratio == null || !Number.isFinite(ratio)) return 'text-soft';
  if (ratio >= 0.95) return 'text-error';
  if (ratio >= 0.85) return 'text-alert';
  if (ratio >= 0.7) return 'text-warning';
  return 'text-success';
}

function readyClass(ready?: number, desired?: number): string {
  if (ready == null || desired == null) return 'text-soft';
  if (desired <= 0) return 'text-soft';
  if (ready >= desired) return 'text-success';
  if (ready <= 0) return 'text-error';
  return 'text-warning';
}

function primaryClass(panel: MonitoringPanelDef, metrics: ResolvedMetric[]): string {
  if (panel.id === 'summary_traffic') {
    const qps = metrics[0];
    return qps && !qps.empty ? 'text-title' : 'text-soft';
  }
  if (panel.id === 'summary_ready' && panel.primaryAsPair) {
    return readyClass(metrics[0]?.value, metrics[1]?.value);
  }
  if (panel.id === 'summary_resource') {
    return waterClass(metrics[0]?.value);
  }
  return metrics[0] && !metrics[0].empty ? 'text-title' : 'text-soft';
}

function secondaryClass(target: MonitoringTargetDef, value?: number, empty?: boolean): string {
  if (empty) return 'text-soft';
  if (target.refId === 'error_rate') return errorRateClass(value);
  if (target.refId === 'cpu_water' || target.refId === 'mem_water' || target.refId === 'oom') {
    if (target.refId === 'oom') return (value || 0) > 0 ? 'text-error' : 'text-success';
    return waterClass(value);
  }
  if (target.refId === 'restarts') return (value || 0) > 0 ? 'text-warning' : 'text-title';
  return 'text-title';
}

export default function StatPanel({ panel, entries, loading }: Props) {
  const { t } = useTranslation(NS);
  const metrics = useMemo(() => panel.targets.map((target) => resolveMetric(target, entries)), [panel.targets, entries]);

  const primaryText = (() => {
    if (panel.primaryAsPair) {
      const left = metrics[0];
      const right = metrics[1];
      if (!left || !right || left.empty || right.empty) return absentText(left?.target.absent, t);
      return `${formatMonitoringValue(left.target.unit || panel.unit, left.value)} / ${formatMonitoringValue(
        right.target.unit || panel.unit,
        right.value,
      )}`;
    }
    return displayValue(metrics[0], panel.unit, t);
  })();

  const secondary = panel.primaryAsPair ? metrics.slice(2) : metrics.slice(1);
  const titleClass = `mb-3 text-l4 font-bold leading-none ${primaryClass(panel, metrics)}`;

  return (
    <div className='fc-border flex h-[164px] flex-col rounded-lg bg-fc-100 p-4'>
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
      <div className='min-h-0 flex-1'>
        {loading && metrics.every((item) => item.empty) ? (
          <div className='flex h-full items-center justify-center'>
            <Spin />
          </div>
        ) : !loading && metrics.every((item) => item.empty) && panel.targets.every((target) => target.absent !== 'uninstrumented' && target.absent !== 'zero') ? (
          <div className='flex h-full items-center justify-center'>
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('monitoring.chart_empty')} />
          </div>
        ) : (
          <>
            <div className={titleClass}>{primaryText}</div>
            {secondary.length ? (
              <Row gutter={8}>
                {secondary.map((item) => (
                  <Col key={item.target.refId} span={secondary.length === 1 ? 24 : 12}>
                    <div className='flex h-[66px] items-center rounded-lg bg-fc-50 p-3'>
                      <div className='min-w-0 flex-1'>
                        <div className='truncate text-hint' title={item.target.labelKey ? t(item.target.labelKey) : item.target.refId}>
                          {item.target.labelKey ? t(item.target.labelKey) : item.target.refId}
                        </div>
                        <div className={`font-bold ${secondaryClass(item.target, item.value, item.empty)}`}>
                          {displayValue(item, item.target.unit || panel.unit, t)}
                        </div>
                      </div>
                    </div>
                  </Col>
                ))}
              </Row>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
