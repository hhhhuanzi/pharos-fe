import React, { useMemo } from 'react';
import { Empty, Spin, Table, Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { useAntdResizableHeader } from '@fc-components/use-antd-resizable-header';
import '@fc-components/use-antd-resizable-header/dist/style.css';
import { useTranslation } from 'react-i18next';

import { NS } from '@/pages/service/constants';

import { formatMonitoringValue } from '../format';
import type { MonitoringPanelDef, MonitoringTableColumn } from '../panels';
import type { MonitoringSeries } from '../query';
import { TONE_ABSENT, utilizationTone, type StatusToneOrAbsent } from '@/dh/status';
import {
  collectMonitoringJoinKeys,
  isWrappingTableColumn,
  joinKeyOf,
  MONITORING_TABLE_COMPACT_CELL_CLASS,
  MONITORING_TABLE_COMPACT_COLUMN_CLASS,
  MONITORING_TABLE_WRAP_CELL_CLASS,
  MONITORING_TABLE_WRAP_COLUMN_CLASS,
  monitoringTableColumnWidth,
} from '../tableRows';
import { lastPointValue } from '../values';
import type { PanelChartEntry } from './PanelChart';

interface Props {
  panel: MonitoringPanelDef;
  entries: PanelChartEntry[];
  loading: boolean;
}

/**
 * A rendered cell carries its own tone so the table speaks the same colour language as the cards.
 *
 * `text-main` is the table's ungraded body colour, the counterpart of the cards' `text-title`: only
 * the two utilization columns have thresholds behind them, so the other seven — pod, node, IP, QoS,
 * raw cores and bytes — stay plain. That is what keeps a ten-row table from turning into a wall of
 * green now that a normal reading is green: two graded columns out of nine, and the amber and red
 * rows still jump out of the green ones by hue.
 */
interface TableCell {
  text: string;
  tone: StatusToneOrAbsent | 'text-main';
}

interface TableRow {
  key: string;
  cells: Record<string, TableCell>;
}

const EM_DASH = '—';

function textCell(text: string): TableCell {
  return { text, tone: text === EM_DASH ? TONE_ABSENT : 'text-main' };
}

function seriesByRefId(entries: PanelChartEntry[]): Record<string, MonitoringSeries[]> {
  return entries.reduce<Record<string, MonitoringSeries[]>>((acc, entry) => {
    acc[entry.target.refId] = entry.series;
    return acc;
  }, {});
}

function cellValue(column: MonitoringTableColumn, rowKey: string, byRef: Record<string, MonitoringSeries[]>, joinLabel: string): TableCell {
  if (column.source === '__ratio__' && column.numRefId && column.denRefId) {
    const num = lastPointValue(byRef[column.numRefId]?.find((item) => joinKeyOf(item, joinLabel, false) === rowKey));
    const den = lastPointValue(byRef[column.denRefId]?.find((item) => joinKeyOf(item, joinLabel, false) === rowKey));
    if (num == null || den == null || den === 0) return textCell(EM_DASH);
    const ratio = num / den;
    // Usage over limit is the same reading as the summary card, so it gets the same thresholds and
    // the same three tones — including green, otherwise a pod would read as fine in the card and
    // ungraded in the table it links to. A missing limit stays a dash: a water level without a
    // limit is undefined, not zero.
    return { text: formatMonitoringValue(column.unit || 'percentUnit', ratio), tone: utilizationTone(ratio) };
  }
  if (column.source === '__value__' && column.refId) {
    const hit =
      byRef[column.refId]?.find((item) => joinKeyOf(item, joinLabel, false) === rowKey) || byRef[column.refId]?.find((item) => joinKeyOf(item, joinLabel, true) === rowKey);
    const value = lastPointValue(hit);
    return textCell(formatMonitoringValue(column.unit || 'short', value));
  }
  if (column.source === joinLabel) return textCell(rowKey);
  const refId = column.refId;
  if (!refId) return textCell(EM_DASH);
  const hit = byRef[refId]?.find((item) => joinKeyOf(item, joinLabel, false) === rowKey);
  const label = hit?.metric[column.source];
  return textCell(label && label.trim() ? label : EM_DASH);
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
        const row: TableRow = { key: `${joinKeyOf(item, joinLabel, false) || idx}`, cells: {} };
        columns.forEach((column) => {
          if (column.source === '__value__') {
            row.cells[column.id] = textCell(formatMonitoringValue(column.unit || 'short', lastPointValue(item)));
            return;
          }
          const label = item.metric[column.source];
          row.cells[column.id] = textCell(label && label.trim() ? label : EM_DASH);
        });
        const pod = row.cells.pod?.text;
        const reason = row.cells.reason?.text;
        if (pod && reason) row.key = `${pod}\0${reason}\0${idx}`;
        return row;
      });
    }
    return collectMonitoringJoinKeys(entries, joinLabel).map((key) => {
      const row: TableRow = { key, cells: {} };
      columns.forEach((column) => {
        row.cells[column.id] = cellValue(column, key, byRef, joinLabel);
      });
      return row;
    });
  }, [byRef, columns, entries, joinLabel, panel.tableMode]);

  return (
    <div className='fc-border flex flex-col rounded-lg bg-fc-100 p-4'>
      {/* Same level as the chart and stat panel titles. */}
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
      {loading && rows.length === 0 ? (
        <div className='flex h-[120px] items-center justify-center'>
          <Spin />
        </div>
      ) : rows.length === 0 ? (
        <div className='flex h-[120px] items-center justify-center'>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t(panel.tableEmptyKey || 'monitoring.chart_empty')} />
        </div>
      ) : (
        <MonitoringMetricTable rows={rows} columns={columns} panelId={panel.id} />
      )}
    </div>
  );
}

function omitColumnEllipsis(column: Record<string, unknown>): Record<string, unknown> {
  const next = { ...column };
  delete next.ellipsis;
  return next;
}

function MonitoringMetricTable({ rows, columns, panelId }: { rows: TableRow[]; columns: MonitoringTableColumn[]; panelId: string }) {
  const { t } = useTranslation(NS);
  const tableColumns = useMemo(
    () =>
      columns.map((column) => {
        const wrap = isWrappingTableColumn(column.id);
        const title = t(column.titleKey);
        const values = rows.map((row) => row.cells[column.id]?.text ?? EM_DASH);
        return {
          title,
          dataIndex: ['cells', column.id],
          key: column.id,
          width: monitoringTableColumnWidth(column.id, title, values),
          className: wrap ? MONITORING_TABLE_WRAP_COLUMN_CLASS : MONITORING_TABLE_COMPACT_COLUMN_CLASS,
          render: (cell?: TableCell) => {
            const text = cell?.text ?? EM_DASH;
            return <span className={`${cell?.tone || TONE_ABSENT} ${wrap ? MONITORING_TABLE_WRAP_CELL_CLASS : MONITORING_TABLE_COMPACT_CELL_CLASS}`}>{text}</span>;
          },
        };
      }),
    [columns, rows, t],
  );

  const { components, resizableColumns, tableWidth } = useAntdResizableHeader({
    // Hook types dataIndex as string | number; antd 4 accepts string[] for nested cells.
    columns: tableColumns as never,
    columnsState: {
      persistenceType: 'localStorage',
      persistenceKey: `dh-service-monitoring-table-v2-${panelId}`,
    },
    cache: false,
  });

  return (
    <Table
      size='small'
      rowKey='key'
      pagination={rows.length > 10 ? { pageSize: 10 } : false}
      dataSource={rows}
      components={components}
      columns={resizableColumns.map((column) => omitColumnEllipsis(column as Record<string, unknown>))}
      scroll={{ x: tableWidth }}
      className='[&_td]:overflow-visible'
    />
  );
}
