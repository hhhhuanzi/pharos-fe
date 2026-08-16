import React, { useMemo } from 'react';
import { Table } from 'antd';
import type { ColumnsType } from 'antd/lib/table';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { buildServiceDetailPath, type ServiceRow } from '@/dh/service';

import { NS } from '../constants';
import { errorRateClass, formatCount, formatErrorRate, formatLanguage, formatLatency, formatQps } from '../format';

interface Props {
  rows: ServiceRow[];
  loading: boolean;
  jaegerId?: number;
}

export default function ServiceTable(props: Props) {
  const { rows, loading, jaegerId } = props;
  const { t } = useTranslation(NS);

  const columns: ColumnsType<ServiceRow> = useMemo(
    () => [
      {
        title: t('table.service'),
        dataIndex: 'name',
        ellipsis: true,
        render: (name: string) => (
          <Link className='truncate' title={name} to={buildServiceDetailPath(name, { ds: jaegerId })}>
            {name}
          </Link>
        ),
      },
      {
        title: t('table.language'),
        dataIndex: 'language',
        width: 100,
        render: (value?: string) => <span className={value ? 'text-main' : 'text-soft'}>{formatLanguage(value)}</span>,
      },
      {
        title: t('table.requests'),
        dataIndex: 'requestCount',
        width: 110,
        sorter: (a, b) => (a.requestCount ?? -1) - (b.requestCount ?? -1),
        render: (value?: number) => formatCount(value),
      },
      {
        title: t('table.qps'),
        dataIndex: 'qps',
        width: 90,
        sorter: (a, b) => (a.qps ?? -1) - (b.qps ?? -1),
        render: (value?: number) => formatQps(value),
      },
      {
        title: t('table.error_rate'),
        dataIndex: 'errorRate',
        width: 100,
        defaultSortOrder: 'descend',
        sorter: (a, b) => (a.errorRate ?? -1) - (b.errorRate ?? -1),
        render: (value?: number) => <span className={errorRateClass(value)}>{formatErrorRate(value)}</span>,
      },
      {
        title: t('table.p95'),
        dataIndex: 'p95Seconds',
        width: 100,
        sorter: (a, b) => (a.p95Seconds ?? -1) - (b.p95Seconds ?? -1),
        render: (value?: number) => formatLatency(value),
      },
      {
        title: t('table.p99'),
        dataIndex: 'p99Seconds',
        width: 100,
        sorter: (a, b) => (a.p99Seconds ?? -1) - (b.p99Seconds ?? -1),
        render: (value?: number) => formatLatency(value),
      },
    ],
    [jaegerId, t],
  );

  return (
    <Table
      size='small'
      rowKey='name'
      columns={columns}
      dataSource={rows}
      loading={loading}
      scroll={{ x: 960 }}
      pagination={rows.length > 50 ? { pageSize: 50, hideOnSinglePage: true, showSizeChanger: true, pageSizeOptions: ['20', '50', '100'] } : false}
    />
  );
}
