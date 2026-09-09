import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Col, Empty, Row } from 'antd';
import { useTranslation } from 'react-i18next';

import { timeRangeUnix, type IRawTimeRange } from '@/components/TimeRangePicker';
import { NS } from '@/pages/service/constants';
import { toPromRange } from '@/dh/service/red';

import { rateWindow } from '../../series';
import { fetchMonitoringInstantBatch, fetchMonitoringRangeBatch } from '../api';
import { padMissingG1OldSeries } from '../gcPad';
import { collectExportedInstances, pickDefaultExportedInstance, type MonitoringInstanceOption } from '../instancePicker';
import { buildSectionQueries, type MonitoringSectionDef, type MonitoringSectionQuery } from '../panels';
import type { MonitoringSeries } from '../query';
import type { MonitoringScope } from '../selectors';
import { adaptiveStep } from '../step';
import { applyWindowTopkToRangeQueries, isWindowTopkRefId, windowTopkInstantQueries } from '../windowTopk';
import InstanceSelect from './InstanceSelect';
import MetricTable from './MetricTable';
import PanelChart, { type PanelChartEntry } from './PanelChart';
import StatPanel from './StatPanel';

interface Props {
  section: MonitoringSectionDef;
  scope: MonitoringScope;
  datasourceId: number;
  range: IRawTimeRange;
  refreshKey: number;
  onRangeChange?: (range: IRawTimeRange) => void;
}

type SeriesByRefId = Record<string, MonitoringSeries[]>;

function mergeResults(results: Array<{ refId: string; series: MonitoringSeries[] }>): SeriesByRefId {
  return results.reduce<SeriesByRefId>((acc, result) => ({ ...acc, [result.refId]: result.series }), {});
}

/**
 * Range + instant in one batch, except window-topk panels: rank at range end first, then the
 * range query is rewritten to those names so the legend cannot grow past k.
 */
async function fetchSectionQueryResults(
  datasourceId: number,
  queries: MonitoringSectionQuery[],
  windows: { start: number; end: number; step: number },
  signalKey: string,
): Promise<SeriesByRefId> {
  const rankQueries = windowTopkInstantQueries(queries);
  const instantQueries = queries.filter((item) => item.instant).map((item) => ({ refId: item.batchRefId, query: item.query }));
  const rangeItems = queries.filter((item) => !item.instant);
  const independentRange = rangeItems.filter((item) => !item.windowTopkQuery);
  const rankedRange = rangeItems.filter((item) => item.windowTopkQuery);

  const [rangeResults, instantResults] = await Promise.all([
    fetchMonitoringRangeBatch(
      datasourceId,
      independentRange.map((item) => ({ refId: item.batchRefId, query: item.query })),
      windows.start,
      windows.end,
      windows.step,
      `${signalKey}-range`,
    ),
    fetchMonitoringInstantBatch(datasourceId, [...instantQueries, ...rankQueries], windows.end, `${signalKey}-instant`),
  ]);

  const rankedRangeResults =
    rankedRange.length === 0
      ? []
      : await fetchMonitoringRangeBatch(
          datasourceId,
          applyWindowTopkToRangeQueries(rankedRange, instantResults),
          windows.start,
          windows.end,
          windows.step,
          `${signalKey}-window-topk-range`,
        );

  return mergeResults([...rangeResults, ...rankedRangeResults, ...instantResults.filter((item) => !isWindowTopkRefId(item.refId))]);
}

function splitSectionQueries(queries: MonitoringSectionQuery[], section: MonitoringSectionDef): { base: MonitoringSectionQuery[]; pinned: MonitoringSectionQuery[] } {
  const pinnedIds = new Set(section.panels.filter((panel) => panel.instanceFilter === 'exported_instance').map((panel) => panel.id));
  return {
    base: queries.filter((item) => !pinnedIds.has(item.panelId)),
    pinned: queries.filter((item) => pinnedIds.has(item.panelId)),
  };
}

/**
 * Queries one section as a single batch (range + instant). Mounted only while its
 * `Collapse.Panel` is open, so a collapsed section costs nothing.
 *
 * Instance-filtered JVM pool / non-heap charts share one Pod pick: the picker
 * query lists `exported_instance`, then those panels are queried with that equality only.
 * GC stays all-pod; a missing G1 Old is padded to 0 after fetch.
 */
export default function SectionPanels({ section, scope, datasourceId, range, refreshKey, onRangeChange }: Props) {
  const { t } = useTranslation(NS);
  const [seriesByRefId, setSeriesByRefId] = useState<SeriesByRefId>({});
  const [baseLoading, setBaseLoading] = useState(true);
  const [pinnedLoading, setPinnedLoading] = useState(false);
  const [instanceLoading, setInstanceLoading] = useState(Boolean(section.instancePicker));
  const [failed, setFailed] = useState(false);
  const [instanceOptions, setInstanceOptions] = useState<MonitoringInstanceOption[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string | undefined>();
  const requestSeq = useRef(0);
  const pinnedSeq = useRef(0);
  const pickerSeq = useRef(0);

  const windows = useMemo(() => {
    const { start, end } = timeRangeUnix(range);
    const step = adaptiveStep(start, end);
    return { start, end, step, rate: rateWindow(step), rangeWindow: toPromRange(Math.max(1, end - start)) };
  }, [range, refreshKey]);

  const scopeKey = `${scope.service}\0${scope.cluster}\0${scope.namespace || ''}\0${scope.env || ''}`;
  const baseQueries = useMemo(
    () => splitSectionQueries(buildSectionQueries(section, scope, windows.rate, windows.rangeWindow), section).base,
    [section, scopeKey, windows.rate, windows.rangeWindow],
  );
  const pinnedQueries = useMemo(
    () => (selectedInstance ? splitSectionQueries(buildSectionQueries(section, scope, windows.rate, windows.rangeWindow, selectedInstance), section).pinned : []),
    [section, scopeKey, windows.rate, windows.rangeWindow, selectedInstance],
  );
  const queries = useMemo(() => [...baseQueries, ...pinnedQueries], [baseQueries, pinnedQueries]);

  useEffect(() => {
    if (!section.instancePicker) {
      setInstanceOptions([]);
      setSelectedInstance(undefined);
      setInstanceLoading(false);
      return;
    }
    const seq = pickerSeq.current + 1;
    pickerSeq.current = seq;
    setInstanceLoading(true);
    fetchMonitoringInstantBatch(
      datasourceId,
      [{ refId: `${section.id}.instance_picker`, query: section.instancePicker.build(scope) }],
      windows.end,
      `dh-service-monitoring-${section.id}-instance-picker`,
    )
      .then((results) => {
        if (pickerSeq.current !== seq) return;
        const options = collectExportedInstances(results[0]?.series || []);
        setInstanceOptions(options);
        setSelectedInstance((current) => pickDefaultExportedInstance(options, current));
        setInstanceLoading(false);
      })
      .catch(() => {
        if (pickerSeq.current !== seq) return;
        setInstanceOptions([]);
        setSelectedInstance(undefined);
        setInstanceLoading(false);
      });
  }, [datasourceId, section.id, section.instancePicker, scope.service, scope.cluster, scope.namespace, scope.env, windows.end, refreshKey]);

  useEffect(() => {
    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    if (section.emptyKey && section.panels.length === 0) {
      setSeriesByRefId({});
      setFailed(false);
      setBaseLoading(false);
      return;
    }
    setBaseLoading(true);
    setFailed(false);
    fetchSectionQueryResults(datasourceId, baseQueries, windows, `dh-service-monitoring-${section.id}`)
      .then((next) => {
        if (requestSeq.current !== seq) return;
        setSeriesByRefId((prev) => ({ ...prev, ...next }));
        setBaseLoading(false);
      })
      .catch(() => {
        if (requestSeq.current !== seq) return;
        setSeriesByRefId({});
        setFailed(true);
        setBaseLoading(false);
      });
  }, [datasourceId, baseQueries, windows.start, windows.end, windows.step, section.id, section.emptyKey, section.panels.length]);

  useEffect(() => {
    if (!selectedInstance || pinnedQueries.length === 0) {
      setPinnedLoading(false);
      return;
    }
    const seq = pinnedSeq.current + 1;
    pinnedSeq.current = seq;
    setPinnedLoading(true);
    fetchSectionQueryResults(datasourceId, pinnedQueries, windows, `dh-service-monitoring-${section.id}-instance`)
      .then((next) => {
        if (pinnedSeq.current !== seq) return;
        setSeriesByRefId((prev) => ({ ...prev, ...next }));
        setPinnedLoading(false);
      })
      .catch(() => {
        if (pinnedSeq.current !== seq) return;
        setSeriesByRefId((prev) => {
          const cleared = { ...prev };
          pinnedQueries.forEach((item) => {
            cleared[item.batchRefId] = [];
          });
          return cleared;
        });
        setPinnedLoading(false);
      });
  }, [datasourceId, pinnedQueries, selectedInstance, windows.start, windows.end, windows.step, section.id]);

  const padGcPanelIds = useMemo(() => new Set(section.panels.filter((panel) => panel.padMissingGc === 'g1Old').map((panel) => panel.id)), [section.panels]);

  const entriesByPanel = useMemo(
    () =>
      queries.reduce<Record<string, PanelChartEntry[]>>((acc, query) => {
        const raw = seriesByRefId[query.batchRefId] || [];
        const series = padGcPanelIds.has(query.panelId) ? padMissingG1OldSeries(raw) : raw;
        const entry: PanelChartEntry = { target: query, series };
        acc[query.panelId] = [...(acc[query.panelId] || []), entry];
        return acc;
      }, {}),
    [padGcPanelIds, queries, seriesByRefId],
  );

  const renderInstanceSelect = () =>
    section.instancePicker && instanceOptions.length > 0 ? <InstanceSelect value={selectedInstance} options={instanceOptions} onChange={setSelectedInstance} /> : null;

  if (section.emptyKey && section.panels.length === 0) {
    return (
      <div className='flex min-h-[160px] items-center justify-center rounded-lg bg-fc-100 p-4 fc-border'>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t(section.emptyKey)} />
      </div>
    );
  }

  const emptyDescription = failed ? t('monitoring.load_failed') : t('monitoring.chart_empty');
  const hasAnySeries = queries.some((query) => (seriesByRefId[query.batchRefId] || []).length > 0);

  if (!baseLoading && !failed && section.fallbackEmptyKey && !hasAnySeries && !instanceLoading) {
    return (
      <div className='flex min-h-[160px] items-center justify-center rounded-lg bg-fc-100 p-4 fc-border'>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t(section.fallbackEmptyKey)} />
      </div>
    );
  }

  return (
    <Row gutter={[16, 16]}>
      {section.panels.map((panel) => {
        const kind = panel.kind || 'chart';
        const entries = entriesByPanel[panel.id] || [];
        const loading = panel.instanceFilter ? instanceLoading || (Boolean(selectedInstance) && pinnedLoading) : baseLoading;
        return (
          <Col key={panel.id} span={24} xl={panel.span}>
            {kind === 'stat' ? (
              <StatPanel panel={panel} entries={entries} loading={loading} />
            ) : kind === 'table' ? (
              <MetricTable panel={panel} entries={entries} loading={loading} />
            ) : (
              <PanelChart
                panel={panel}
                entries={entries}
                loading={loading}
                emptyDescription={emptyDescription}
                onRangeChange={onRangeChange}
                titleExtra={panel.instanceFilter ? renderInstanceSelect() : undefined}
              />
            )}
          </Col>
        );
      })}
    </Row>
  );
}
