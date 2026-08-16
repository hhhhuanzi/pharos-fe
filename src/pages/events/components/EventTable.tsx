import React, { useMemo } from 'react';
import { Table } from 'antd';
import type { ColumnsType } from 'antd/lib/table';
import moment from 'moment';

import { formatEventObject, type K8sEvent } from '@/dh/service';

function formatEventTime(unix?: number): string {
  if (unix == null || !Number.isFinite(unix) || unix <= 0) return '—';
  return moment.unix(unix).format('YYYY-MM-DD HH:mm:ss');
}

function formatCount(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString();
}

export interface EventTableLabels {
  time: string;
  type: string;
  reason: string;
  object: string;
  namespace: string;
  cluster: string;
  count: string;
  typeWarning: string;
  typeNormal: string;
}

interface Props {
  events: K8sEvent[];
  loading?: boolean;
  labels: EventTableLabels;
  emptyText?: string;
}

export default function EventTable(props: Props) {
  const { events, loading, labels, emptyText } = props;

  const columns: ColumnsType<K8sEvent> = useMemo(
    () => [
      {
        title: labels.time,
        dataIndex: 'lastSeenUnix',
        width: 170,
        render: (value?: number) => formatEventTime(value),
      },
      {
        title: labels.type,
        dataIndex: 'type',
        width: 100,
        render: (value: K8sEvent['type']) => (
          <span className={value === 'warning' ? 'text-warning' : 'text-main'}>{value === 'warning' ? labels.typeWarning : labels.typeNormal}</span>
        ),
      },
      {
        title: labels.reason,
        dataIndex: 'reason',
        width: 140,
        ellipsis: true,
        render: (value: string) => (
          <span className='truncate' title={value}>
            {value || '—'}
          </span>
        ),
      },
      {
        title: labels.object,
        key: 'object',
        ellipsis: true,
        render: (_: unknown, row: K8sEvent) => {
          const text = formatEventObject(row);
          return (
            <span className='truncate' title={text}>
              {text}
            </span>
          );
        },
      },
      {
        title: labels.namespace,
        dataIndex: 'namespace',
        width: 140,
        ellipsis: true,
        render: (value?: string) => (
          <span className={value ? 'truncate text-main' : 'text-soft'} title={value}>
            {value || '—'}
          </span>
        ),
      },
      {
        title: labels.cluster,
        dataIndex: 'cluster',
        width: 140,
        ellipsis: true,
        render: (value?: string) => (
          <span className={value ? 'truncate text-main' : 'text-soft'} title={value}>
            {value || '—'}
          </span>
        ),
      },
      {
        title: labels.count,
        dataIndex: 'count',
        width: 80,
        sorter: (a, b) => a.count - b.count,
        render: (value: number) => formatCount(value),
      },
    ],
    [labels],
  );

  return (
    <Table
      size='small'
      rowKey='id'
      columns={columns}
      dataSource={events}
      loading={loading}
      scroll={{ x: 960 }}
      locale={emptyText ? { emptyText } : undefined}
      pagination={events.length > 50 ? { pageSize: 50, hideOnSinglePage: true, showSizeChanger: true, pageSizeOptions: ['20', '50', '100'] } : false}
    />
  );
}
