import React, { useContext, useEffect, useRef, useState } from 'react';
import { Spin, Tabs } from 'antd';
import queryString from 'query-string';
import { useTranslation } from 'react-i18next';
import { Redirect, useHistory, useLocation, useParams } from 'react-router-dom';

import { CommonStateContext } from '@/App';
import PageLayout from '@/components/pageLayout';
import { timeRangeUnix } from '@/components/TimeRangePicker';
import { EnvTag } from '@/dh/env';
import {
  buildServiceListPath,
  decodeServiceParam,
  fetchServiceOverview,
  parseServiceIdentity,
  type ServiceAssociation,
} from '@/dh/service';
import { BusinessTags, checkResultTeams, checkServiceTeamAccess, localCanViewAll, type NamedTeam } from '@/dh/serviceTeam';

import { DEFAULT_DETAIL_TAB, isDeferredDetailTab, isVisibleDetailTab, NS, PATH } from './constants';
import { JAEGER_LS, PROM_LS, pickDatasourceId, readStoredId } from './storage';
import TabEmpty from './tabs/TabEmpty';

import Events from './tabs/Events';
import Exceptions from './tabs/Exceptions';
import Flamegraph from './tabs/Flamegraph';
import Logs from './tabs/Logs';
import Monitoring from './tabs/Monitoring';
import Topology from './tabs/Topology';
import Traces from './tabs/Traces';

export default function ServiceDetailPage() {
  const { t } = useTranslation(NS);
  const history = useHistory();
  const location = useLocation();
  const params = useParams<{ service: string }>();
  const service = decodeServiceParam(params.service);
  const { groupedDatasourceList, profile } = useContext(CommonStateContext);
  const jaegerList = groupedDatasourceList.jaeger || [];
  const prometheusList = groupedDatasourceList.prometheus || [];

  const parsed = queryString.parse(location.search);
  const tab = isVisibleDetailTab(parsed.tab) ? parsed.tab : DEFAULT_DETAIL_TAB;
  const identity = parseServiceIdentity({ ...parsed, service });
  const tracesStartUnix = Number(parsed.start);
  const tracesEndUnix = Number(parsed.end);
  const tracesRangeOk = Number.isFinite(tracesStartUnix) && Number.isFinite(tracesEndUnix) && tracesStartUnix > 0 && tracesEndUnix > tracesStartUnix;
  const initTraceId = typeof parsed.traceId === 'string' ? parsed.traceId.trim() || undefined : undefined;

  const jaegerId = pickDatasourceId(jaegerList, identity.ds ?? readStoredId(JAEGER_LS));
  const promId = pickDatasourceId(prometheusList, readStoredId(PROM_LS));
  const [association, setAssociation] = useState<ServiceAssociation>({ clusters: [], namespaces: [] });
  const [associationReady, setAssociationReady] = useState(false);
  const [access, setAccess] = useState<'loading' | 'ok' | 'denied'>('loading');
  const [teamBindings, setTeamBindings] = useState<NamedTeam[]>([]);
  const requestSeq = useRef(0);
  const accessSeq = useRef(0);

  useEffect(() => {
    if (jaegerId != null) localStorage.setItem(JAEGER_LS, String(jaegerId));
  }, [jaegerId]);

  useEffect(() => {
    if (!service) {
      setAccess('denied');
      return;
    }
    const seq = accessSeq.current + 1;
    accessSeq.current = seq;
    setAccess('loading');
    checkServiceTeamAccess(service, identity.env, localCanViewAll(profile))
      .then((res) => {
        if (accessSeq.current !== seq) return;
        setTeamBindings(checkResultTeams(res));
        setAccess(res.visible ? 'ok' : 'denied');
      })
      .catch(() => {
        if (accessSeq.current !== seq) return;
        setAccess('denied');
      });
  }, [service, identity.env, profile]);

  useEffect(() => {
    if (access !== 'ok' || !service || promId == null) {
      setAssociation({ clusters: [], namespaces: [] });
      setAssociationReady(access !== 'loading');
      return;
    }
    const { start, end } = timeRangeUnix({ start: 'now-1h', end: 'now' });
    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    setAssociationReady(false);
    fetchServiceOverview(promId, service, start, end, identity.env)
      .then((res) => {
        if (requestSeq.current !== seq) return;
        setAssociation(res.association);
      })
      .catch(() => {
        if (requestSeq.current !== seq) return;
        setAssociation({ clusters: [], namespaces: [] });
      })
      .finally(() => {
        if (requestSeq.current !== seq) return;
        setAssociationReady(true);
      });
  }, [access, service, promId, identity.env]);

  useEffect(() => {
    if (!isDeferredDetailTab(parsed.tab) || isVisibleDetailTab(parsed.tab)) return;
    const { tab: _tab, ...rest } = parsed;
    history.replace({
      pathname: location.pathname,
      search: queryString.stringify({
        ...rest,
        tab: DEFAULT_DETAIL_TAB,
        ds: identity.ds ?? jaegerId,
      }),
    });
  }, [parsed.tab, location.pathname, history, identity.ds, jaegerId]);

  const replaceTab = (key: string) => {
    const { tab: _tab, traceId: _traceId, ...rest } = parsed;
    history.replace({
      pathname: location.pathname,
      search: queryString.stringify({
        ...rest,
        tab: key,
        ds: identity.ds ?? jaegerId,
      }),
    });
  };

  const cluster = identity.cluster || (association.clusters.length ? association.clusters.join(', ') : undefined);
  const namespace = identity.namespace || (association.namespaces.length ? association.namespaces.join(', ') : undefined);
  const meta = [cluster ? `${t('identity.cluster')}: ${cluster}` : null, namespace ? `${t('identity.namespace')}: ${namespace}` : null].filter(Boolean);

  if (!service) {
    return <Redirect to={buildServiceListPath()} />;
  }

  if (access === 'loading') {
    return (
      <PageLayout title={service} showBack backPath={PATH}>
        <div className='flex min-h-[240px] items-center justify-center'>
          <Spin />
        </div>
      </PageLayout>
    );
  }

  if (access === 'denied') {
    return (
      <PageLayout title={service} showBack backPath={PATH}>
        <TabEmpty description={t('team.forbidden')} />
      </PageLayout>
    );
  }

  return (
    <PageLayout title={service} showBack backPath={PATH}>
      <div className='flex flex-col gap-4'>
        {identity.env || meta.length || teamBindings.length ? (
          <div className='flex flex-wrap items-center gap-2 text-sm text-hint'>
            {identity.env ? (
              <span className='flex items-center gap-2'>
                {`${t('identity.env')}:`}
                <EnvTag value={identity.env} />
              </span>
            ) : null}
            {meta.length ? <span>{meta.join(' · ')}</span> : null}
            {teamBindings.length ? (
              <span className='flex items-center gap-2'>
                {`${t('table.team')}:`}
                <BusinessTags teams={teamBindings} />
              </span>
            ) : null}
          </div>
        ) : null}
        <Tabs activeKey={tab} onChange={replaceTab}>
          <Tabs.TabPane tab={t('tab.monitoring')} key='monitoring'>
            <Monitoring
              service={service}
              clusters={identity.cluster ? [identity.cluster] : association.clusters}
              namespaces={identity.namespace ? [identity.namespace] : association.namespaces}
            />
          </Tabs.TabPane>
          <Tabs.TabPane tab={t('tab.topology')} key='topology'>
            {/* antd 4 keeps visited panes at display:none; Graph must not measure at 0×0. */}
            {tab === 'topology' ? (
              <Topology
                key={`${service}-${identity.env ?? ''}`}
                focusService={service}
                env={identity.env}
                cluster={identity.cluster || (association.clusters.length === 1 ? association.clusters[0] : undefined)}
                namespace={identity.namespace || (association.namespaces.length === 1 ? association.namespaces[0] : undefined)}
              />
            ) : null}
          </Tabs.TabPane>
          {isVisibleDetailTab('events') ? (
            <Tabs.TabPane tab={t('tab.events')} key='events'>
              <Events
                service={service}
                promId={promId}
                clusters={identity.cluster ? [identity.cluster] : association.clusters}
                namespaces={identity.namespace ? [identity.namespace] : association.namespaces}
              />
            </Tabs.TabPane>
          ) : null}
          {isVisibleDetailTab('flamegraph') ? (
            <Tabs.TabPane tab={t('tab.flamegraph')} key='flamegraph'>
              <Flamegraph service={service} />
            </Tabs.TabPane>
          ) : null}
          <Tabs.TabPane tab={t('tab.logs')} key='logs'>
            <Logs key={`${service}-${identity.env ?? ''}`} service={service} env={identity.env} teams={teamBindings} />
          </Tabs.TabPane>
          <Tabs.TabPane tab={t('tab.traces')} key='traces'>
            <Traces
              key={`${service}-${identity.env ?? ''}-${initTraceId ?? ''}-${tracesRangeOk ? `${tracesStartUnix}-${tracesEndUnix}` : ''}`}
              service={service}
              env={identity.env}
              jaegerId={jaegerId}
              initTraceId={initTraceId}
              initStartUnix={tracesRangeOk ? tracesStartUnix : undefined}
              initEndUnix={tracesRangeOk ? tracesEndUnix : undefined}
            />
          </Tabs.TabPane>
          {isVisibleDetailTab('exceptions') ? (
            <Tabs.TabPane tab={t('tab.exceptions')} key='exceptions'>
              <Exceptions service={service} />
            </Tabs.TabPane>
          ) : null}
        </Tabs>
      </div>
    </PageLayout>
  );
}
