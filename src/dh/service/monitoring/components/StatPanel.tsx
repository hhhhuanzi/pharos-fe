import React, { useMemo } from 'react';
import { Spin, Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

import { NS } from '@/pages/service/constants';

import { formatMonitoringValue, type MonitoringUnit } from '../format';
import type { MonitoringAbsentMode, MonitoringPanelDef, MonitoringTargetDef } from '../panels';
import { errorRateTone, oomTone, readyTone, restartTone, TONE_ABSENT, utilizationTone, type StatusToneOrAbsent } from '@/dh/status';
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

/** Numbers with no threshold behind them are values, not grades; see `../tone`. */
const TONE_UNGRADED = 'text-title';

/** One column of a card. Columns are peers: same label style, same number size, equal width. */
interface MetricCell {
  refId: string;
  label: string;
  value: string;
  suffix: string;
  tone: StatusToneOrAbsent | typeof TONE_UNGRADED;
}

function seriesFor(entries: PanelChartEntry[], refId: string) {
  return entries.find((entry) => entry.target.refId === refId)?.series || [];
}

function readMetric(target: MonitoringTargetDef, entries: PanelChartEntry[]): ResolvedMetric {
  const series = seriesFor(entries, target.refId);
  const value = reduceSeries(series, target.reduce);
  return { target, value, empty: series.length === 0 || value == null };
}

/**
 * Turns "the query matched nothing" into "the event never happened" for the queries where those are
 * the same statement — a `reason="OOMKilled"` matcher publishes no series until a container is
 * actually OOM-killed, so a healthy service returns nothing and used to render as a grey dash,
 * telling people their monitoring was broken when it was their service that was fine.
 *
 * The rewrite is deliberately guarded rather than blind: it only applies while the target's
 * `absentZeroRequires` sibling did return data, which proves the exporter behind the empty query is
 * being scraped at all. See `../panels`.
 */
function withAbsentZero(metric: ResolvedMetric, panelMetrics: ResolvedMetric[]): ResolvedMetric {
  if (!metric.empty || metric.target.absent !== 'zero') return metric;
  const guardRefId = metric.target.absentZeroRequires;
  if (guardRefId && panelMetrics.find((item) => item.target.refId === guardRefId)?.empty !== false) return metric;
  return { ...metric, value: 0, empty: false };
}

function resolveMetrics(panel: MonitoringPanelDef, entries: PanelChartEntry[]): ResolvedMetric[] {
  const read = panel.targets.map((target) => readMetric(target, entries));
  return read.map((metric) => withAbsentZero(metric, read));
}

/** Only reached for queries whose empty result really is unknown — `absent: 'zero'` is resolved away. */
function absentText(absent: MonitoringAbsentMode | undefined, t: (key: string) => string): string {
  if (absent === 'uninstrumented') return t('monitoring.stat.uninstrumented');
  return '—';
}

function displayValue(metric: ResolvedMetric, fallbackUnit: MonitoringUnit, t: (key: string) => string): string {
  if (metric.empty) return absentText(metric.target.absent, t);
  return formatMonitoringValue(metric.target.unit || fallbackUnit, metric.value);
}

/** Leading number (including a `a / b` pair) plus whatever unit follows it. */
const NUMBER_HEAD = /^(-?[\d.,]+(?:\s*\/\s*-?[\d.,]+)?)\s*(.*)$/;

/** Splits `5.46 ms` into number and unit so the unit can render one step down, never as a number. */
function splitValue(text: string): { value: string; suffix: string } {
  const matched = NUMBER_HEAD.exec(text);
  if (!matched) return { value: text, suffix: '' };
  return { value: matched[1], suffix: matched[2] };
}

/**
 * Thresholds and their reasoning live in `../tone`, shared with the pod table. The tone functions
 * handle the absent case themselves, so an empty reading is not short-circuited here.
 *
 * Everything else falls through ungraded on purpose: QPS and P95 have no threshold, so colouring
 * them would dress a plain number up as a verdict and cost green the meaning it just gained.
 */
function metricTone(metric: ResolvedMetric): StatusToneOrAbsent | typeof TONE_UNGRADED {
  const { refId } = metric.target;
  if (refId === 'error_rate') return errorRateTone(metric.value);
  if (refId === 'cpu_water' || refId === 'mem_water') return utilizationTone(metric.value);
  if (refId === 'restarts') return restartTone(metric.value);
  if (refId === 'oom') return oomTone(metric.value);
  return metric.empty ? TONE_ABSENT : TONE_UNGRADED;
}

function labelFor(target: MonitoringTargetDef, t: (key: string) => string): string {
  return target.labelKey ? t(target.labelKey) : target.refId;
}

function buildCells(panel: MonitoringPanelDef, metrics: ResolvedMetric[], t: (key: string) => string): MetricCell[] {
  const toCell = (metric: ResolvedMetric): MetricCell => ({
    refId: metric.target.refId,
    label: labelFor(metric.target, t),
    ...splitValue(displayValue(metric, metric.target.unit || panel.unit, t)),
    tone: metricTone(metric),
  });

  const [left, right] = metrics;
  if (!panel.primaryAsPair || !left || !right) return metrics.map(toCell);

  const paired = left.empty || right.empty;
  const pairText = paired
    ? absentText(left.target.absent, t)
    : `${formatMonitoringValue(left.target.unit || panel.unit, left.value)} / ${formatMonitoringValue(right.target.unit || panel.unit, right.value)}`;
  const pairCell: MetricCell = {
    refId: left.target.refId,
    label: labelFor(left.target, t),
    ...splitValue(pairText),
    tone: paired ? TONE_ABSENT : readyTone(left.value, right.value),
  };
  return [pairCell, ...metrics.slice(2).map(toCell)];
}

export default function StatPanel({ panel, entries, loading }: Props) {
  const { t } = useTranslation(NS);
  const metrics = useMemo(() => resolveMetrics(panel, entries), [panel, entries]);
  const cells = useMemo(() => buildCells(panel, metrics, t), [panel, metrics, t]);
  const title = t(panel.titleKey);

  return (
    <div className='fc-border flex h-[120px] flex-col rounded-lg bg-fc-100 p-4'>
      {/* Same level as a chart panel title. It used to be 12px hint — identical to the metric labels
          underneath it, so the card name and its columns flattened into one another. */}
      <div className='flex shrink-0 items-center gap-2 text-l1 font-medium leading-none text-title'>
        <span className='truncate' title={title}>
          {title}
        </span>
        {panel.hintKey ? (
          <Tooltip title={t(panel.hintKey)}>
            <QuestionCircleOutlined className='shrink-0 text-soft' />
          </Tooltip>
        ) : null}
      </div>
      <div className='mt-3 flex min-h-0 flex-1 items-center gap-4'>
        {loading && metrics.every((item) => item.empty) ? (
          <div className='flex h-full w-full items-center justify-center'>
            <Spin size='small' />
          </div>
        ) : (
          cells.map((cell) => (
            <div key={cell.refId} data-metric={cell.refId} className='flex min-w-0 flex-1 flex-col gap-2'>
              <div className='truncate text-base font-normal text-hint' title={cell.label}>
                {cell.label}
              </div>
              <div className='flex items-baseline whitespace-nowrap'>
                <span className={`text-l4 font-bold leading-none ${cell.tone}`}>{cell.value}</span>
                {cell.suffix ? <span className={`text-base font-normal leading-none text-hint ${cell.suffix === '%' ? '' : 'ml-1'}`}>{cell.suffix}</span> : null}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
