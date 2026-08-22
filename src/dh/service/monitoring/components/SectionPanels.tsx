import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Col, Empty, Row } from 'antd';
import { useTranslation } from 'react-i18next';

import { timeRangeUnix, type IRawTimeRange } from '@/components/TimeRangePicker';
import { NS } from '@/pages/service/constants';
import { toPromRange } from '@/dh/service/red';

import { rateWindow } from '../../series';
import { fetchMonitoringInstantBatch, fetchMonitoringRangeBatch } from '../api';
import { buildSectionQueries, type MonitoringSectionDef } from '../panels';
import type { MonitoringSeries } from '../query';
import type { MonitoringScope } from '../selectors';
import { adaptiveStep } from '../step';
import MetricTable from './MetricTable';
import PanelChart, { type PanelChartEntry } from './PanelChart';
import StatPanel from './StatPanel';

interface Props {
  section: MonitoringSectionDef;
  scope: MonitoringScope;
  datasourceId: number;
  range: IRawTimeRange;
  refreshKey: number;
}

type SeriesByRefId = Record<string, MonitoringSeries[]>;

function mergeResults(results: Array<{ refId: string; series: MonitoringSeries[] }>): SeriesByRefId {
  return results.reduce<SeriesByRefId>((acc, result) => ({ ...acc, [result.refId]: result.series }), {});
}

/**
 * Queries one section as a single batch (range + instant). Mounted only while its
 * `Collapse.Panel` is open, so a collapsed section costs nothing.
 */
export default function SectionPanels({ section, scope, datasourceId, range, refreshKey }: Props) {
  const { t } = useTranslation(NS);
  const [seriesByRefId, setSeriesByRefId] = useState<SeriesByRefId>({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const requestSeq = useRef(0);

  const request = useMemo(() => {
    const { start, end } = timeRangeUnix(range);
    const step = adaptiveStep(start, end);
    const queries = buildSectionQueries(section, scope, rateWindow(step), toPromRange(Math.max(1, end - start)));
    return {
      start,
      end,
      step,
      rangeQueries: queries.filter((item) => !item.instant),
      instantQueries: queries.filter((item) => item.instant),
      queries,
    };
  }, [section, scope.service, scope.cluster, range, refreshKey]);

  useEffect(() => {
    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    if (section.emptyKey && section.panels.length === 0) {
      setSeriesByRefId({});
      setFailed(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setFailed(false);
    const rangeTask = fetchMonitoringRangeBatch(
      datasourceId,
      request.rangeQueries.map((item) => ({ refId: item.batchRefId, query: item.query })),
      request.start,
      request.end,
      request.step,
      `dh-service-monitoring-${section.id}-range`,
    );
    const instantTask = fetchMonitoringInstantBatch(
      datasourceId,
      request.instantQueries.map((item) => ({ refId: item.batchRefId, query: item.query })),
      request.end,
      `dh-service-monitoring-${section.id}-instant`,
    );
    Promise.all([rangeTask, instantTask])
      .then(([rangeResults, instantResults]) => {
        if (requestSeq.current !== seq) return;
        setSeriesByRefId(mergeResults([...rangeResults, ...instantResults]));
        setLoading(false);
      })
      .catch(() => {
        if (requestSeq.current !== seq) return;
        setSeriesByRefId({});
        setFailed(true);
        setLoading(false);
      });
  }, [datasourceId, request, section.id, section.emptyKey, section.panels.length]);

  const entriesByPanel = useMemo(
    () =>
      request.queries.reduce<Record<string, PanelChartEntry[]>>((acc, query) => {
        const entry: PanelChartEntry = { target: query, series: seriesByRefId[query.batchRefId] || [] };
        acc[query.panelId] = [...(acc[query.panelId] || []), entry];
        return acc;
      }, {}),
    [request, seriesByRefId],
  );

  if (section.emptyKey && section.panels.length === 0) {
    return (
      <div className='flex min-h-[160px] items-center justify-center rounded-lg bg-fc-100 p-4 fc-border'>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t(section.emptyKey)} />
      </div>
    );
  }

  const emptyDescription = failed ? t('monitoring.load_failed') : t('monitoring.chart_empty');
  const hasAnySeries = request.queries.some((query) => (seriesByRefId[query.batchRefId] || []).length > 0);

  if (!loading && !failed && section.fallbackEmptyKey && !hasAnySeries) {
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
        return (
          <Col key={panel.id} span={panel.span}>
            {kind === 'stat' ? (
              <StatPanel panel={panel} entries={entries} loading={loading} />
            ) : kind === 'table' ? (
              <MetricTable panel={panel} entries={entries} loading={loading} />
            ) : (
              <PanelChart panel={panel} entries={entries} loading={loading} emptyDescription={emptyDescription} />
            )}
          </Col>
        );
      })}
    </Row>
  );
}
