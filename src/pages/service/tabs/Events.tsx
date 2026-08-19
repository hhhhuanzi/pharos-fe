import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Radio, Space, Table, Tooltip } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/lib/table';
import moment from 'moment';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import TimeRangePicker, { getDefaultValue, timeRangeUnix } from '@/components/TimeRangePicker';
import {
  buildEventCenterPath,
  countEventsByType,
  fetchServiceEvents,
  filterEventsByKeyword,
  filterEventsByType,
  formatEventObject,
  type K8sEvent,
  type K8sEventTypeFilter,
} from '@/dh/service';
import EventTimeline, { TIMELINE_LIMIT } from '@/pages/events/components/EventTimeline';

import EventKeywordSearch from '@/pages/events/components/EventKeywordSearch';

import { NS } from '../constants';
import { formatCount } from '../format';
import { EVENTS_RANGE_LS } from '../storage';

interface Props {
  service: string;
  promId?: number;
  clusters: string[];
  namespaces: string[];
}

function formatEventTime(unix?: number): string {
  if (unix == null || !Number.isFinite(unix) || unix <= 0) return '—';
  return moment.unix(unix).format('YYYY-MM-DD HH:mm:ss');
}

function typeClass(type: K8sEvent['type']): string {
  return type === 'warning' ? 'text-warning' : 'text-main';
}

export default function Events(props: Props) {
  const { service, promId, clusters, namespaces } = props;
  const { t } = useTranslation(NS);
  const [events, setEvents] = useState<K8sEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [typeFilter, setTypeFilter] = useState<K8sEventTypeFilter>('all');
  const [refreshKey, setRefreshKey] = useState(0);
  const [keyword, setKeyword] = useState('');
  const [range, setRange] = useState(() => getDefaultValue(EVENTS_RANGE_LS, { start: 'now-1h', end: 'now' }) || { start: 'now-1h', end: 'now' });
  const requestSeq = useRef(0);

  useEffect(() => {
    if (!service || promId == null) {
      setEvents([]);
      setFailed(false);
      setLoading(false);
      return;
    }
    const { start, end } = timeRangeUnix(range);
    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    setLoading(true);
    setFailed(false);
    fetchServiceEvents(promId, { service, clusters, namespaces }, start, end)
      .then((res) => {
        if (requestSeq.current !== seq) return;
        setEvents(res.events);
      })
      .catch(() => {
        if (requestSeq.current !== seq) return;
        setEvents([]);
        setFailed(true);
      })
      .finally(() => {
        if (requestSeq.current !== seq) return;
        setLoading(false);
      });
  }, [service, promId, range, clusters.join('\0'), namespaces.join('\0'), refreshKey]);

  const visible = useMemo(() => filterEventsByKeyword(filterEventsByType(events, typeFilter), keyword), [events, typeFilter, keyword]);
  const counts = useMemo(() => countEventsByType(events), [events]);

  const columns: ColumnsType<K8sEvent> = useMemo(
    () => [
      {
        title: t('events.time'),
        dataIndex: 'lastSeenUnix',
        width: 170,
        render: (value?: number) => formatEventTime(value),
      },
      {
        title: t('events.type'),
        dataIndex: 'type',
        width: 100,
        render: (value: K8sEvent['type']) => <span className={typeClass(value)}>{t(`events.type_${value}`)}</span>,
      },
      {
        title: t('events.reason'),
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
        title: t('events.object'),
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
        title: t('identity.namespace'),
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
        title: t('identity.cluster'),
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
        title: t('events.count'),
        dataIndex: 'count',
        width: 80,
        sorter: (a, b) => a.count - b.count,
        render: (value: number) => formatCount(value),
      },
    ],
    [t],
  );

  const emptyDescription = !promId ? t('overview.no_prometheus') : failed ? t('events.load_failed') : t('tab.events_empty_named', { service });
  const centerPath = buildEventCenterPath({
    service,
    cluster: clusters[0],
    namespace: namespaces[0],
  });

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-center justify-between gap-y-2 rounded-lg bg-fc-100 p-4 fc-border'>
        <Space wrap>
          <TimeRangePicker localKey={EVENTS_RANGE_LS} value={range} onChange={(val) => val && setRange(val)} dateFormat='YYYY-MM-DD HH:mm:ss' />
          <EventKeywordSearch value={keyword} onChange={setKeyword} placeholder={t('events.search_placeholder')} />
          <Radio.Group value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} buttonStyle='solid'>
            <Radio.Button value='all'>{t('events.type_all')}</Radio.Button>
            <Radio.Button value='warning'>{t('events.type_warning')}</Radio.Button>
            <Radio.Button value='normal'>{t('events.type_normal')}</Radio.Button>
          </Radio.Group>
          <Tooltip title={t('overview.refresh')}>
            <Button icon={<ReloadOutlined />} onClick={() => setRefreshKey((n) => n + 1)} />
          </Tooltip>
          <Link to={centerPath}>
            <Button type='link' className='px-0'>
              {t('events.open_center')}
            </Button>
          </Link>
        </Space>
        <div className='text-sm text-hint'>{t('events.hint')}</div>
      </div>

      <div>
        <div className='mb-3 text-l1 font-bold text-title'>{t('events.timeline')}</div>
        <EventTimeline
          events={visible}
          loading={loading}
          emptyDescription={emptyDescription}
          typeLabel={(type) => t(`events.type_${type}`)}
          moreHint={t('events.timeline_more', { count: TIMELINE_LIMIT })}
        />
      </div>

      {events.length > 0 ? (
        <div className='flex flex-wrap gap-4 text-base'>
          <span className='text-warning'>
            {t('events.type_warning')} {counts.warning}
          </span>
          <span className='text-main'>
            {t('events.type_normal')} {counts.normal}
          </span>
        </div>
      ) : null}

      <Table
        size='small'
        rowKey='id'
        columns={columns}
        dataSource={visible}
        loading={loading}
        scroll={{ x: 960 }}
        locale={{ emptyText: emptyDescription }}
        pagination={visible.length > 50 ? { pageSize: 50, hideOnSinglePage: true, showSizeChanger: true, pageSizeOptions: ['20', '50', '100'] } : false}
      />
    </div>
  );
}
