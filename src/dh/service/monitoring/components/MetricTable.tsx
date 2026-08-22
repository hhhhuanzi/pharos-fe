import React, { useMemo } from 'react';
import { Empty, Spin, Table, Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

import { NS } from '@/pages/service/constants';

import { formatMonitoringValue, shortExportedInstance } from '../format';
import type { MonitoringPanelDef, MonitoringTableColumn } from '../panels';
import type { MonitoringSeries } from '../query';
import { lastPointValue } from '../values';
import type { PanelChartEntry } from './PanelChart';

interface Props {
  panel: MonitoringPanelDef;
  entries: PanelChartEntry[];
  loading: boolean;
}

type TableRow = Record<string, string | number | undefined> & { key: string };

function seriesByRefId(entries: PanelChartEntry[]): Record<string, MonitoringSeries[]> {
  return entries.reduce<Record<string, MonitoringSeries[]>>((acc, entry) => {
    acc[entry.target.refId] = entry.series;
    return acc;
  }, {});
}

function joinKeyOf(series: MonitoringSeries, joinLabel: string, rewritePodFromInstance: boolean): string | undefined {
  const direct = series.metric[joinLabel];
  if (direct && direct.trim()) return direct.trim();
  if (rewritePodFromInstance && series.metric.exported_instance) {
    return shortExportedInstance(series.metric.exported_instance);
  }
  return undefined;
}

function cellValue(
  column: MonitoringTableColumn,
  rowKey: string,
  byRef: Record<string, MonitoringSeries[]>,
  joinLabel: string,
): string {
  if (column.source === '__ratio__' && column.numRefId && column.denRefId) {
    const num = lastPointValue(byRef[column.numRefId]?.find((item) => joinKeyOf(item, joinLabel, false) === rowKey));
    const den = lastPointValue(byRef[column.denRefId]?.find((item) => joinKeyOf(item, joinLabel, false) === rowKey));
    if (num == null || den == null || den === 0) return '—';
    return formatMonitoringValue(column.unit || 'percentUnit', num / den);
  }
  if (column.source === '__value__' && column.refId) {
    const hit =
      byRef[column.refId]?.find((item) => joinKeyOf(item, joinLabel, false) === rowKey) ||
      byRef[column.refId]?.find((item) => joinKeyOf(item, joinLabel, true) === rowKey);
    const value = lastPointValue(hit);
    return formatMonitoringValue(column.unit || 'short', value);
  }
  if (column.source === joinLabel) return rowKey;
  const refId = column.refId;
  if (!refId) return '—';
  const hit = byRef[refId]?.find((item) => joinKeyOf(item, joinLabel, false) === rowKey);
  const label = hit?.metric[column.source];
  return label && label.trim() ? label : '—';
}

export default function MetricTable({ panel, entries, loading }: Props) {
  const { t } = useTranslation(NS);
  const joinLabel = panel.joinLabel || 'pod';
  const columns = panel.columns || [];
  const byRef = useMemo(() => seriesByRefId(entries), [entries]);

  const rows = useMemo<TableRow[]>(() => {
    if (panel.tableMode === 'series') {
      const first = entries[0]?.series || [];
      return first.map((item, idx) => {
        const row: TableRow = { key: `${joinKeyOf(item, joinLabel, false) || idx}` };
        columns.forEach((column) => {
          if (column.source === '__value__') {
            row[column.id] = formatMonitoringValue(column.unit || 'short', lastPointValue(item));
            return;
          }
          const label = item.metric[column.source];
          row[column.id] = label && label.trim() ? label : '—';
        });
        if (row.pod && row.reason) row.key = `${row.pod}\0${row.reason}\0${idx}`;
        return row;
      });
    }
    const keys = new Set<string>();
    entries.forEach((entry) => {
      const rewrite = entry.target.nameRewrite === 'exportedInstancePod';
      entry.series.forEach((item) => {
        const key = joinKeyOf(item, joinLabel, rewrite);
        if (key) keys.add(key);
      });
    });
    return Array.from(keys)
      .sort((a, b) => a.localeCompare(b))
      .map((key) => {
        const row: TableRow = { key };
        columns.forEach((column) => {
          row[column.id] = cellValue(column, key, byRef, joinLabel);
        });
        return row;
      });
  }, [byRef, columns, entries, joinLabel, panel.tableMode]);

  return (
    <div className='fc-border flex flex-col rounded-lg bg-fc-100 p-4'>
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
      {loading && rows.length === 0 ? (
        <div className='flex h-[120px] items-center justify-center'>
          <Spin />
        </div>
      ) : rows.length === 0 ? (
        <div className='flex h-[120px] items-center justify-center'>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t(panel.tableEmptyKey || 'monitoring.chart_empty')} />
        </div>
      ) : (
        <Table
          size='small'
          rowKey='key'
          pagination={rows.length > 10 ? { pageSize: 10 } : false}
          dataSource={rows}
          columns={columns.map((column) => ({
            title: t(column.titleKey),
            dataIndex: column.id,
            key: column.id,
            ellipsis: true,
            render: (value: string) => (
              <span title={value} className={value === '—' ? 'text-soft' : 'text-main'}>
                {value}
              </span>
            ),
          }))}
        />
      )}
    </div>
  );
}
