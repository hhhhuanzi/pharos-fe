import React, { useEffect, useMemo, useState } from 'react';
import { Table } from 'antd';
import type { ColumnsType } from 'antd/lib/table';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import usePagination from '@/components/usePagination';
import { EnvTag } from '@/dh/env';
import { buildServiceDetailPath, serviceKey, type ServiceRow } from '@/dh/service';
import { BusinessTags, type ServiceTeamMeta } from '@/dh/serviceTeam';

import { NS } from '../constants';
import { errorRateClass, formatCount, formatErrorRate, formatLanguage, formatLatency, formatQps } from '../format';
import { TABLE_PAGESIZE_LS } from '../storage';

interface Props {
  rows: ServiceRow[];
  loading: boolean;
  jaegerId?: number;
  teamMeta?: ServiceTeamMeta;
  search: string;
}

const TABLE_CLASS =
  'n9e-dh-service-table [&_.ant-table-thead>tr>th]:px-3 [&_.ant-table-thead>tr>th]:py-2 [&_.ant-table-tbody>tr>td]:px-3 [&_.ant-table-tbody>tr>td]:py-2';

export default function ServiceTable(props: Props) {
  const { rows, loading, jaegerId, teamMeta, search } = props;
  const { t } = useTranslation(NS);
  const pagination = usePagination({ pageSizeLocalstorageKey: TABLE_PAGESIZE_LS });
  const [current, setCurrent] = useState(1);

  useEffect(() => {
    setCurrent(1);
  }, [search]);

  const pageSize = pagination.pageSize;
  const maxPage = Math.max(1, Math.ceil(rows.length / pageSize) || 1);
  const page = Math.min(current, maxPage);

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
        pagination={{
          ...pagination,
          current: page,
          total: rows.length,
          onChange: (next) => setCurrent(next),
        }}
      />
    </div>
  );
}
