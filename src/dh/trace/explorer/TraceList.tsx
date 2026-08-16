import React, { useEffect, useRef, useState } from 'react';
import { Badge, Empty, Table, Tooltip } from 'antd';
import { ColumnsType } from 'antd/lib/table';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import _ from 'lodash';
import moment from 'moment-timezone';
import { useTranslation } from 'react-i18next';
import { formatDuration } from '@/pages/traceCpt/utils/date';
import type { SearchTraceType } from '@/pages/traceCpt/type';
import { NS as LOG_TRACE_NS, ViewLogsLink } from '@/dh/logTrace';
import { searchTraceSummaries } from '../api';
import type { PharosTraceListResult, PharosTraceSummary } from '../contract';
import { TRACE_LIST_COLUMN_KEYS } from './columnKeys';

// 链路时间统一按东八区（Asia/Shanghai）24 小时制展示，避免 UTC 与 12 小时制歧义
const TRACE_TIME_ZONE = 'Asia/Shanghai';

interface IProps {
  search?: SearchTraceType;
  loading: boolean;
  onFetching: (v: boolean) => void;
  onOpenTrace: (traceId: string) => void;
}

export default function TraceList(props: IProps) {
  const { search, loading, onFetching, onOpenTrace } = props;
  const { t } = useTranslation('trace');
  const { t: tLog } = useTranslation(LOG_TRACE_NS);
  const [result, setResult] = useState<PharosTraceListResult>();
  const [failed, setFailed] = useState(false);
  // Sorting is client-side, so a slow earlier query must not overwrite a newer result.
  const requestSeq = useRef(0);

  useEffect(() => {
    if (!search) {
      setResult(undefined);
      setFailed(false);
      return;
    }
    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    setFailed(false);
    onFetching(true);
    searchTraceSummaries({
      data_source_id: search.data_source_id,
      plugin_type: search.plugin_type || 'jaeger',
      service: search.service,
      service_name: search.service_name,
      operation: search.operation,
      instance: search.instance,
      start_time_min: search.start_time_min,
      start_time_max: search.start_time_max,
      attributes: (search.attributes as unknown as Record<string, string>) || null,
      duration_max: search.duration_max,
      duration_min: search.duration_min,
      num_traces: search.num_traces,
    })
      .then((res) => {
        if (requestSeq.current !== seq) return;
        setResult(res);
      })
      .catch(() => {
        if (requestSeq.current !== seq) return;
        setResult(undefined);
        setFailed(true);
      })
      .finally(() => {
        if (requestSeq.current !== seq) return;
        onFetching(false);
      });
  }, [search]);

  const summaries = result?.summaries || [];
  const maxDuration = _.max(summaries.map((item) => item.durationUs)) || 1;

  const columns: ColumnsType<PharosTraceSummary> = [
    {
      key: TRACE_LIST_COLUMN_KEYS[0],
      title: t('list.columns.start_time'),
      dataIndex: 'startTimeUs',
      width: 168,
      defaultSortOrder: 'descend',
      sorter: (a, b) => a.startTimeUs - b.startTimeUs,
      render: (value: number) => {
        const time = moment(value / 1000).tz(TRACE_TIME_ZONE);
        return (
          <span className='text-main' title={time.format('YYYY-MM-DD HH:mm:ss.SSS')}>
            {time.format('MM-DD HH:mm:ss.SSS')}
          </span>
        );
      },
    },
    {
      key: TRACE_LIST_COLUMN_KEYS[1],
      title: t('list.columns.trace_id'),
      dataIndex: 'traceId',
      width: 150,
      render: (value: string) => (
        <a className='truncate' title={value}>
          {value.slice(0, 16)}
        </a>
      ),
    },
    {
      key: TRACE_LIST_COLUMN_KEYS[2],
      title: t('list.columns.operation'),
      dataIndex: 'rootInterface',
      ellipsis: true,
      render: (value: string) => (
        <span className='truncate text-title' title={value}>
          {value || '-'}
        </span>
      ),
    },
    {
      key: TRACE_LIST_COLUMN_KEYS[3],
      title: t('list.columns.status'),
      dataIndex: 'errorSpanCount',
      width: 110,
      sorter: (a, b) => a.errorSpanCount - b.errorSpanCount,
      render: (value: number, record) => (
        <span className='flex items-center gap-2'>
          {value > 0 ? (
            <Tooltip title={t('list.error_spans', { num: value })}>
              <span className='text-error'>
                <Badge status='error' />
                {t('list.status.error')}
              </span>
            </Tooltip>
          ) : (
            <span className='text-success'>
              <Badge status='success' />
              {t('list.status.ok')}
            </span>
          )}
          {record.orphanSpanCount > 0 && (
            <Tooltip title={t('list.partial', { num: record.orphanSpanCount })}>
              <ExclamationCircleOutlined className='text-warning' />
            </Tooltip>
          )}
        </span>
      ),
    },
    {
      key: TRACE_LIST_COLUMN_KEYS[4],
      title: t('list.columns.duration'),
      dataIndex: 'durationUs',
      width: 176,
      sorter: (a, b) => a.durationUs - b.durationUs,
      render: (value: number, record) => (
        <span className='flex items-center gap-2'>
          <span className='h-1 w-16 shrink-0 overflow-hidden rounded-lg bg-fc-200'>
            <span className={`block h-1 rounded-lg ${record.errorSpanCount > 0 ? 'bg-error' : 'bg-primary'}`} style={{ width: `${Math.max((value / maxDuration) * 100, 2)}%` }} />
          </span>
          <span className='text-title'>{formatDuration(value)}</span>
        </span>
      ),
    },
    {
      key: TRACE_LIST_COLUMN_KEYS[5],
      title: t('list.columns.service'),
      dataIndex: 'rootService',
      width: 160,
      ellipsis: true,
      render: (value: string) => (
        <span className='truncate text-main' title={value}>
          {value || '-'}
        </span>
      ),
    },
    {
      key: TRACE_LIST_COLUMN_KEYS[6],
      title: t('list.columns.type'),
      dataIndex: 'rootType',
      width: 96,
      ellipsis: true,
      render: (value: string) => (
        <span className='truncate text-main' title={value || undefined}>
          {value || '—'}
        </span>
      ),
    },
    {
      key: TRACE_LIST_COLUMN_KEYS[7],
      title: t('list.columns.spans'),
      dataIndex: 'spanCount',
      width: 100,
      align: 'right',
      sorter: (a, b) => a.spanCount - b.spanCount,
      render: (value: number, record) =>
        record.services.length > 0 ? (
          <Tooltip
            title={
              <div>
                <div className='text-hint'>{t('list.services_breakdown')}</div>
                {record.services.map((service) => (
                  <div key={service.name}>
                    {service.name} · {service.spanCount}
                  </div>
                ))}
              </div>
            }
          >
            <span className='text-main'>{value}</span>
          </Tooltip>
        ) : (
          <span className='text-main'>{value}</span>
        ),
    },
    {
      title: tLog('view_logs_col'),
      key: TRACE_LIST_COLUMN_KEYS[8],
      width: 72,
      fixed: 'right',
      render: (_value, record) => (
        <ViewLogsLink entry='list' pluginType={search?.plugin_type} traceId={record.traceId} startUs={record.startTimeUs} durationUs={record.durationUs} />
      ),
    },
  ];

  const emptyText = (() => {
    if (failed) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('list.load_failed')} />;
    if (!search) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('list.no_search')} />;
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <div>
            <div className='text-main'>{t('list.empty')}</div>
            <div className='mt-2 text-base text-hint'>{t('list.empty_hint')}</div>
          </div>
        }
      />
    );
  })();

  return (
    <div>
      <div className='mb-3 flex flex-wrap items-center gap-2 text-base text-hint'>
        <span className='text-title'>{t('list.total', { num: summaries.length })}</span>
        {summaries.length > 0 && <span>{t('list.scope_hint', { num: summaries.length })}</span>}
        {result?.truncated && <span className='text-warning'>{t('list.truncated')}</span>}
      </div>
      <Table<PharosTraceSummary>
        size='small'
        rowKey='traceId'
        loading={loading}
        columns={columns}
        dataSource={summaries}
        showSorterTooltip={false}
        scroll={{ x: 1400 }}
        locale={{ emptyText }}
        onRow={(record) => ({
          className: 'cursor-pointer',
          onClick: () => onOpenTrace(record.traceId),
        })}
        pagination={{
          size: 'small',
          defaultPageSize: 20,
          showSizeChanger: true,
          pageSizeOptions: ['20', '50', '100'],
          showTotal: (total) => t('list.total', { num: total }),
        }}
      />
    </div>
  );
}
