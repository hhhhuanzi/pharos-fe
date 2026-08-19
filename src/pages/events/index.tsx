import React, { useContext, useMemo, useState } from 'react';
import { Button, Space, Tooltip } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import queryString from 'query-string';
import { useTranslation } from 'react-i18next';
import { useHistory, useLocation } from 'react-router-dom';

import { CommonStateContext } from '@/App';
import PageLayout from '@/components/pageLayout';
import TimeRangePicker, { getDefaultValue, IRawTimeRange } from '@/components/TimeRangePicker';
import { buildEventCenterK8sPath, filterEventsByKeyword, parseServiceIdentity, summarizePodEvents } from '@/dh/service';

import EventKeywordSearch from './components/EventKeywordSearch';
import EventTimeline, { TIMELINE_LIMIT } from './components/EventTimeline';
import SourceDashboard from './components/SourceDashboard';
import { NS } from './constants';
import { PROM_LS, RANGE_LS, pickDatasourceId, readStoredId } from './storage';
import { useEventerEvents } from './useEventerEvents';

export default function EventCenterPage() {
  const { t } = useTranslation(NS);
  const history = useHistory();
  const location = useLocation();
  const { groupedDatasourceList } = useContext(CommonStateContext);
  const prometheusList = groupedDatasourceList.prometheus || [];
  const parsed = queryString.parse(location.search);
  const identity = parseServiceIdentity(parsed);
  const promId = pickDatasourceId(prometheusList, readStoredId(PROM_LS));
  const [range, setRange] = useState<IRawTimeRange>(() => getDefaultValue(RANGE_LS, { start: 'now-1h', end: 'now' }) || { start: 'now-1h', end: 'now' });
  const [refreshKey, setRefreshKey] = useState(0);
  const [keyword, setKeyword] = useState('');
  const [sourceQuery, setSourceQuery] = useState('');

  const query = useMemo(
    () => ({
      service: identity.service,
      clusters: identity.cluster ? [identity.cluster] : undefined,
      namespaces: identity.namespace ? [identity.namespace] : undefined,
    }),
    [identity.service, identity.cluster, identity.namespace],
  );

  const { events, loading, failed } = useEventerEvents(promId, range, query, refreshKey);
  const visible = useMemo(() => filterEventsByKeyword(events, keyword), [events, keyword]);
  const stats = useMemo(() => summarizePodEvents(events), [events]);
  const k8sPath = buildEventCenterK8sPath({
    service: identity.service,
    cluster: identity.cluster,
    namespace: identity.namespace,
  });

  const emptyDescription = !promId ? t('empty.no_prometheus') : failed ? t('empty.load_failed') : t('empty.timeline');

  const clearServiceFilter = () => {
    const { service: _service, cluster: _cluster, namespace: _namespace, ...rest } = parsed;
    history.replace({ pathname: location.pathname, search: queryString.stringify(rest) });
  };

  return (
    <PageLayout title={t('title')}>
      <div className='flex flex-col gap-4'>
        <div className='flex flex-wrap items-center justify-between gap-y-2 rounded-lg bg-fc-100 p-4 fc-border'>
          <Space wrap>
            <TimeRangePicker localKey={RANGE_LS} value={range} onChange={(val) => val && setRange(val)} dateFormat='YYYY-MM-DD HH:mm:ss' />
            <EventKeywordSearch value={keyword} onChange={setKeyword} placeholder={t('search.placeholder')} />
            <Tooltip title={t('refresh')}>
              <Button icon={<ReloadOutlined />} onClick={() => setRefreshKey((n) => n + 1)} />
            </Tooltip>
            {identity.service ? (
              <Button type='link' className='px-0' onClick={clearServiceFilter}>
                {t('filter.clear')}
              </Button>
            ) : null}
          </Space>
          <div className='text-sm text-hint'>{identity.service ? t('filter.service', { service: identity.service }) : t('hint')}</div>
        </div>

        <div>
          <div className='mb-3 text-l2 font-bold text-title'>{t('timeline.title')}</div>
          <EventTimeline
            events={visible}
            loading={loading}
            emptyDescription={emptyDescription}
            typeLabel={(type) => t(`type.${type}`)}
            moreHint={t('timeline.more', { count: TIMELINE_LIMIT })}
          />
        </div>

        <SourceDashboard stats={stats} k8sPath={k8sPath} sourceQuery={sourceQuery} onSourceQuery={setSourceQuery} />
      </div>
    </PageLayout>
  );
}
