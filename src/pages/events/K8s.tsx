import React, { useContext, useMemo, useState } from 'react';
import { Button, Radio, Space, Tooltip } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import queryString from 'query-string';
import { useTranslation } from 'react-i18next';
import { useHistory, useLocation } from 'react-router-dom';

import { CommonStateContext } from '@/App';
import PageLayout from '@/components/pageLayout';
import TimeRangePicker, { getDefaultValue, IRawTimeRange } from '@/components/TimeRangePicker';
import { buildEventCenterPath, filterEventsByCategory, parseServiceIdentity, summarizePodEvents, type PodEventCategory } from '@/dh/service';

import EventTable from './components/EventTable';
import EventTimeline, { TIMELINE_LIMIT } from './components/EventTimeline';
import PodStatsCards from './components/PodStatsCards';
import { NS } from './constants';
import { PROM_LS, RANGE_LS, pickDatasourceId, readStoredId } from './storage';
import { useEventerEvents } from './useEventerEvents';

type CategoryFilter = 'all' | PodEventCategory;

export default function EventCenterK8sPage() {
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
  const [category, setCategory] = useState<CategoryFilter>('all');

  const query = useMemo(
    () => ({
      service: identity.service,
      clusters: identity.cluster ? [identity.cluster] : undefined,
      namespaces: identity.namespace ? [identity.namespace] : undefined,
    }),
    [identity.service, identity.cluster, identity.namespace],
  );

  const { events, loading, failed } = useEventerEvents(promId, range, query, refreshKey);
  const stats = useMemo(() => summarizePodEvents(events), [events]);
  const visible = useMemo(() => filterEventsByCategory(events, category), [events, category]);
  const emptyDescription = !promId ? t('empty.no_prometheus') : failed ? t('empty.load_failed') : t('empty.k8s');

  const tableLabels = useMemo(
    () => ({
      time: t('table.time'),
      type: t('table.type'),
      reason: t('table.reason'),
      object: t('table.object'),
      namespace: t('table.namespace'),
      cluster: t('table.cluster'),
      count: t('table.count'),
      typeWarning: t('type.warning'),
      typeNormal: t('type.normal'),
    }),
    [t],
  );

  const clearServiceFilter = () => {
    const { service: _service, cluster: _cluster, namespace: _namespace, ...rest } = parsed;
    history.replace({ pathname: location.pathname, search: queryString.stringify(rest) });
  };

  return (
    <PageLayout
      title={t('k8s.title')}
      showBack
      backPath={buildEventCenterPath({
        service: identity.service,
        cluster: identity.cluster,
        namespace: identity.namespace,
      })}
    >
      <div className='flex flex-col gap-4'>
        <div className='flex flex-wrap items-center justify-between gap-y-2 rounded-lg bg-fc-100 p-4 fc-border'>
          <Space wrap>
            <TimeRangePicker localKey={RANGE_LS} value={range} onChange={(val) => val && setRange(val)} dateFormat='YYYY-MM-DD HH:mm:ss' />
            <Radio.Group value={category} onChange={(e) => setCategory(e.target.value)} buttonStyle='solid'>
              <Radio.Button value='all'>{t('category.all')}</Radio.Button>
              <Radio.Button value='restart'>{t('category.restart')}</Radio.Button>
              <Radio.Button value='crash'>{t('category.crash')}</Radio.Button>
              <Radio.Button value='pending'>{t('category.pending')}</Radio.Button>
            </Radio.Group>
            <Tooltip title={t('refresh')}>
              <Button icon={<ReloadOutlined />} onClick={() => setRefreshKey((n) => n + 1)} />
            </Tooltip>
            {identity.service ? (
              <Button type='link' className='px-0' onClick={clearServiceFilter}>
                {t('filter.clear')}
              </Button>
            ) : null}
          </Space>
          <div className='text-sm text-hint'>{identity.service ? t('filter.service', { service: identity.service }) : t('k8s.hint')}</div>
        </div>

        <PodStatsCards stats={stats} onSelect={setCategory} />

        <div>
          <div className='mb-3 text-l1 font-bold text-title'>{t('timeline.title')}</div>
          <EventTimeline
            events={visible}
            loading={loading}
            emptyDescription={emptyDescription}
            typeLabel={(type) => t(`type.${type}`)}
            moreHint={t('timeline.more', { count: TIMELINE_LIMIT })}
          />
        </div>

        <div>
          <div className='mb-3 text-l1 font-bold text-title'>{t('table.title')}</div>
          <EventTable events={visible} loading={loading} labels={tableLabels} emptyText={emptyDescription} />
        </div>
      </div>
    </PageLayout>
  );
}
