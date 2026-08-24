import React, { useMemo } from 'react';
import { Table } from 'antd';
import type { ColumnsType } from 'antd/lib/table';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { buildServiceDetailPath, serviceKey, type ServiceRow } from '@/dh/service';
import { BusinessTags, type ServiceTeamMeta } from '@/dh/serviceTeam';

import EnvTag from '../components/EnvTag';
import { NS } from '../constants';
import { errorRateClass, formatCount, formatErrorRate, formatLanguage, formatLatency, formatQps } from '../format';

interface Props {
  rows: ServiceRow[];
  loading: boolean;
  jaegerId?: number;
  teamMeta?: ServiceTeamMeta;
}

const TABLE_CLASS =
  'n9e-dh-service-table [&_.ant-table-thead>tr>th]:px-3 [&_.ant-table-thead>tr>th]:py-2 [&_.ant-table-tbody>tr>td]:px-3 [&_.ant-table-tbody>tr>td]:py-2';

export default function ServiceTable(props: Props) {
  const { rows, loading, jaegerId, teamMeta } = props;
  const { t } = useTranslation(NS);

  const columns: ColumnsType<ServiceRow> = useMemo(
    () => [
      {
        title: t('table.service'),
        dataIndex: 'name',
        ellipsis: true,
        width: 280,
        render: (name: string, row) => (
          <Link
            className='inline-flex max-w-full items-center truncate'
            title={name}
            to={buildServiceDetailPath(name, { ds: jaegerId, env: row.env })}
          >
            {name}
          </Link>
        ),
      },
      {
        title: t('table.env'),
        dataIndex: 'env',
        width: 112,
        render: (value?: string) => <EnvTag value={value} />,
      },
      {
        title: t('table.team'),
        key: 'team',
        width: 200,
        render: (_: unknown, row: ServiceRow) => <BusinessTags teams={teamMeta?.teamsByName[row.name]} />,
      },
      {
        title: t('table.language'),
        dataIndex: 'language',
        width: 96,
        render: (value?: string) => (
          <span className={`inline-flex items-center gap-2 ${value ? 'text-main' : 'text-soft'}`}>{formatLanguage(value)}</span>
        ),
      },
      {
        title: t('table.requests'),
        dataIndex: 'requestCount',
        width: 96,
        sorter: (a, b) => (a.requestCount ?? -1) - (b.requestCount ?? -1),
        render: (value?: number) => formatCount(value),
      },
      {
        title: t('table.qps'),
        dataIndex: 'qps',
        width: 88,
        sorter: (a, b) => (a.qps ?? -1) - (b.qps ?? -1),
        render: (value?: number) => formatQps(value),
      },
      {
        title: t('table.error_rate'),
        dataIndex: 'errorRate',
        width: 96,
        defaultSortOrder: 'descend',
        sorter: (a, b) => (a.errorRate ?? -1) - (b.errorRate ?? -1),
        render: (value?: number) => <span className={errorRateClass(value)}>{formatErrorRate(value)}</span>,
      },
      {
        title: t('table.p95'),
        dataIndex: 'p95Seconds',
        width: 96,
        sorter: (a, b) => (a.p95Seconds ?? -1) - (b.p95Seconds ?? -1),
        render: (value?: number) => formatLatency(value),
      },
      {
        title: t('table.p99'),
        dataIndex: 'p99Seconds',
        width: 96,
        sorter: (a, b) => (a.p99Seconds ?? -1) - (b.p99Seconds ?? -1),
        render: (value?: number) => formatLatency(value),
      },
    ],
    [jaegerId, t, teamMeta],
  );

  return (
    <div className={TABLE_CLASS}>
      <Table
        size='small'
        tableLayout='fixed'
        rowKey={(row) => serviceKey(row.name, row.env)}
        columns={columns}
        dataSource={rows}
        loading={loading}
        scroll={{ x: 1120 }}
        pagination={rows.length > 50 ? { pageSize: 50, hideOnSinglePage: true, showSizeChanger: true, pageSizeOptions: ['20', '50', '100'] } : false}
      />
    </div>
  );
}
