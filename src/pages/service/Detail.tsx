import React, { useContext, useEffect, useRef, useState } from 'react';
import { Button, Space, Tabs, message } from 'antd';
import queryString from 'query-string';
import { useTranslation } from 'react-i18next';
import { Link, Redirect, useHistory, useLocation, useParams } from 'react-router-dom';

import { CommonStateContext } from '@/App';
import PageLayout from '@/components/pageLayout';
import TimeRangePicker, { getDefaultValue, IRawTimeRange, timeRangeUnix } from '@/components/TimeRangePicker';
import {
  buildServiceListPath,
  buildServiceTraceDeepLink,
  decodeServiceParam,
  fetchServiceOverview,
  parseServiceIdentity,
  resolveServiceLogDeepLink,
  type ServiceAssociation,
} from '@/dh/service';

import { DEFAULT_DETAIL_TAB, isDetailTab, NS, PATH } from './constants';
import { JAEGER_LS, PROM_LS, RANGE_LS, pickDatasourceId, readStoredId } from './storage';
import Events from './tabs/Events';
import Exceptions from './tabs/Exceptions';
import Flamegraph from './tabs/Flamegraph';
import Topology from './tabs/Topology';

export default function ServiceDetailPage() {
  const { t } = useTranslation(NS);
  const history = useHistory();
  const location = useLocation();
  const params = useParams<{ service: string }>();
  const service = decodeServiceParam(params.service);
  const { groupedDatasourceList } = useContext(CommonStateContext);
  const jaegerList = groupedDatasourceList.jaeger || [];
  const prometheusList = groupedDatasourceList.prometheus || [];

  const parsed = queryString.parse(location.search);
  const tab = isDetailTab(parsed.tab) ? parsed.tab : DEFAULT_DETAIL_TAB;
  const identity = parseServiceIdentity({ ...parsed, service });

  const jaegerId = pickDatasourceId(jaegerList, identity.ds ?? readStoredId(JAEGER_LS));
  const promId = pickDatasourceId(prometheusList, readStoredId(PROM_LS));
  const [range, setRange] = useState<IRawTimeRange>(() => getDefaultValue(RANGE_LS, { start: 'now-1h', end: 'now' }) || { start: 'now-1h', end: 'now' });
  const [association, setAssociation] = useState<ServiceAssociation>({ clusters: [], namespaces: [] });
  const requestSeq = useRef(0);

  useEffect(() => {
    if (jaegerId != null) localStorage.setItem(JAEGER_LS, String(jaegerId));
  }, [jaegerId]);

  useEffect(() => {
    if (!service || promId == null) {
      setAssociation({ clusters: [], namespaces: [] });
      return;
    }
    const { start, end } = timeRangeUnix(range);
    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    fetchServiceOverview(promId, service, start, end)
      .then((res) => {
        if (requestSeq.current !== seq) return;
        setAssociation(res.association);
      })
      .catch(() => {
        if (requestSeq.current !== seq) return;
        setAssociation({ clusters: [], namespaces: [] });
      });
  }, [service, promId, range]);

  const replaceTab = (key: string) => {
    const { tab: _tab, ...rest } = parsed;
    history.replace({
      pathname: location.pathname,
      search: queryString.stringify({
        ...rest,
        tab: key,
        ds: identity.ds ?? jaegerId,
      }),
    });
  };

  const jumpIdentity = { service, cluster: identity.cluster, namespace: identity.namespace, ds: identity.ds ?? jaegerId };
  const traceUrl = buildServiceTraceDeepLink(jumpIdentity);
  const logUrl = resolveServiceLogDeepLink(jumpIdentity);
  const handleJumpLogs = () => {
    if (logUrl) return;
    message.warning(
      <div>
        <div>{t('overview.logs_missing_config')}</div>
        <div className='mt-1'>{t('overview.logs_missing_config_hint')}</div>
      </div>,
      8,
    );
  };

  const cluster = identity.cluster || (association.clusters.length ? association.clusters.join(', ') : undefined);
  const namespace = identity.namespace || (association.namespaces.length ? association.namespaces.join(', ') : undefined);

  if (!service) {
    return <Redirect to={buildServiceListPath()} />;
  }

  return (
    <PageLayout title={service} showBack backPath={PATH}>
      <div className='flex flex-col gap-4'>
        <div className='flex flex-wrap items-center justify-between gap-y-2 rounded-lg bg-fc-100 p-4 fc-border'>
          <Space wrap>
            <TimeRangePicker localKey={RANGE_LS} value={range} onChange={(val) => val && setRange(val)} dateFormat='YYYY-MM-DD HH:mm:ss' />
            {traceUrl ? (
              <Link to={traceUrl}>
                <Button type='link' className='px-0'>
                  {t('overview.jump_traces')}
                </Button>
              </Link>
            ) : (
              <Button type='link' className='px-0' disabled>
                {t('overview.jump_traces')}
              </Button>
            )}
            {logUrl ? (
              <Link to={logUrl}>
                <Button type='link' className='px-0'>
                  {t('overview.jump_logs')}
                </Button>
              </Link>
            ) : (
              <Button type='link' className='px-0' onClick={handleJumpLogs}>
                {t('overview.jump_logs')}
              </Button>
            )}
          </Space>
          <div className='text-sm text-hint'>
            {cluster ? `${t('identity.cluster')}: ${cluster}` : null}
            {cluster && namespace ? ' · ' : null}
            {namespace ? `${t('identity.namespace')}: ${namespace}` : null}
          </div>
        </div>
        <Tabs activeKey={tab} onChange={replaceTab}>
          <Tabs.TabPane tab={t('tab.topology')} key='topology'>
            <Topology focusService={service} />
          </Tabs.TabPane>
          <Tabs.TabPane tab={t('tab.events')} key='events'>
            <Events
              service={service}
              promId={promId}
              range={range}
              clusters={identity.cluster ? [identity.cluster] : association.clusters}
              namespaces={identity.namespace ? [identity.namespace] : association.namespaces}
            />
          </Tabs.TabPane>
          <Tabs.TabPane tab={t('tab.flamegraph')} key='flamegraph'>
            <Flamegraph service={service} />
          </Tabs.TabPane>
          <Tabs.TabPane tab={t('tab.exceptions')} key='exceptions'>
            <Exceptions service={service} />
          </Tabs.TabPane>
        </Tabs>
      </div>
    </PageLayout>
  );
}
