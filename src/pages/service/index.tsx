import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { message, Tabs } from 'antd';
import queryString from 'query-string';
import { useTranslation } from 'react-i18next';
import { useHistory, useLocation } from 'react-router-dom';

import { CommonStateContext } from '@/App';
import PageLayout from '@/components/pageLayout';
import { getDefaultValue, IRawTimeRange, timeRangeUnix } from '@/components/TimeRangePicker';
import {
  DEFAULT_TOP_N,
  dedupeRefs,
  fetchServiceCatalog,
  fetchServiceTopSeries,
  filterRowsByServiceName,
  pickTopServices,
  type NamedSeries,
  type ServiceRow,
} from '@/dh/service';
import { emptyServiceTeamMeta, loadFilteredServiceCatalog, localCanViewAll, type ServiceTeamMeta } from '@/dh/serviceTeam';

import { DEFAULT_LIST_TAB, isListTab, NS } from './constants';
import { JAEGER_LS, PROM_LS, RANGE_LS, pickDatasourceId, readStoredId, readStoredTopN } from './storage';
import Overview from './tabs/Overview';
import Topology from './tabs/Topology';

export default function ServicePage() {
  const { t } = useTranslation(NS);
  const history = useHistory();
  const location = useLocation();
  const { groupedDatasourceList, profile } = useContext(CommonStateContext);
  const jaegerList = groupedDatasourceList.jaeger || [];
  const prometheusList = groupedDatasourceList.prometheus || [];

  const parsed = queryString.parse(location.search);
  const tab = isListTab(parsed.tab) ? parsed.tab : DEFAULT_LIST_TAB;

  const [rows, setRows] = useState<ServiceRow[]>([]);
  const [teamMeta, setTeamMeta] = useState<ServiceTeamMeta>(emptyServiceTeamMeta);
  const [qps, setQps] = useState<NamedSeries[]>([]);
  const [errorRate, setErrorRate] = useState<NamedSeries[]>([]);
  const [p95, setP95] = useState<NamedSeries[]>([]);
  const [loading, setLoading] = useState(false);
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState('');
  const [topN, setTopN] = useState(() => readStoredTopN(DEFAULT_TOP_N));
  const [refreshKey, setRefreshKey] = useState(0);
  const [range, setRange] = useState<IRawTimeRange>(() => getDefaultValue(RANGE_LS, { start: 'now-1h', end: 'now' }) || { start: 'now-1h', end: 'now' });
  const requestSeq = useRef(0);
  const seriesSeq = useRef(0);

  const jaegerId = pickDatasourceId(jaegerList, readStoredId(JAEGER_LS));
  const [promId, setPromId] = useState<number | undefined>(() => pickDatasourceId(prometheusList, readStoredId(PROM_LS)));

  useEffect(() => {
    if (promId != null) return;
    const next = pickDatasourceId(prometheusList, readStoredId(PROM_LS));
    if (next != null) setPromId(next);
  }, [promId, prometheusList]);

  useEffect(() => {
    if (jaegerId != null) localStorage.setItem(JAEGER_LS, String(jaegerId));
  }, [jaegerId]);

  const onTabChange = (key: string) => {
    history.replace({
      pathname: location.pathname,
      search: queryString.stringify({
        ...parsed,
        tab: key,
      }),
    });
  };

  useEffect(() => {
    const { start, end } = timeRangeUnix(range);
    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    setLoading(true);
    setFailed(false);
    fetchServiceCatalog(promId, jaegerId, start, end)
      .then(async (res) => {
        if (requestSeq.current !== seq) return;
        // 先挂目录行，让图表立刻开查；团队过滤失败不能把 Prom 查询拖死。
        setRows(res.rows);
        setFailed(res.promFailed && res.jaegerFailed);
        const filtered = await loadFilteredServiceCatalog(res.rows, localCanViewAll(profile));
        if (requestSeq.current !== seq) return;
        setRows(filtered.rows);
        setTeamMeta(filtered.meta);
        if (filtered.unavailable) {
          message.warning(t('team.unavailable'));
        }
      })
      .catch(() => {
        if (requestSeq.current !== seq) return;
        setRows([]);
        setTeamMeta(emptyServiceTeamMeta());
        setFailed(true);
      })
      .finally(() => {
        if (requestSeq.current !== seq) return;
        setLoading(false);
      });
  }, [promId, jaegerId, range, refreshKey, profile]);

  const qpsRefs = useMemo(() => pickTopServices(rows, topN, 'requestCount'), [rows, topN]);
  const errorRefs = useMemo(() => pickTopServices(rows, topN, 'errorRate'), [rows, topN]);
  const p95Refs = useMemo(() => pickTopServices(rows, topN, 'p95Seconds'), [rows, topN]);
  const seriesRefs = useMemo(() => dedupeRefs(qpsRefs, errorRefs, p95Refs), [qpsRefs, errorRefs, p95Refs]);
  /** Chart lines are keyed per service + environment, so the legend keeps the two apart. */
  const qpsNames = useMemo(() => qpsRefs.map((ref) => ref.key), [qpsRefs]);
  const errorNames = useMemo(() => errorRefs.map((ref) => ref.key), [errorRefs]);
  const p95Names = useMemo(() => p95Refs.map((ref) => ref.key), [p95Refs]);
  const seriesKey = useMemo(() => seriesRefs.map((ref) => ref.key).join('|'), [seriesRefs]);
  const visibleRows = useMemo(() => filterRowsByServiceName(rows, search), [rows, search]);

  useEffect(() => {
    if (promId == null || seriesRefs.length === 0) {
      setQps([]);
      setErrorRate([]);
      setP95([]);
      setSeriesLoading(false);
      return;
    }
    const { start, end } = timeRangeUnix(range);
    const seq = seriesSeq.current + 1;
    seriesSeq.current = seq;
    setSeriesLoading(true);
    fetchServiceTopSeries(promId, seriesRefs, start, end)
      .then((res) => {
        if (seriesSeq.current !== seq) return;
        setQps(res.qps);
        setErrorRate(res.errorRate);
        setP95(res.p95);
      })
      .catch(() => {
        if (seriesSeq.current !== seq) return;
        setQps([]);
        setErrorRate([]);
        setP95([]);
      })
      .finally(() => {
        if (seriesSeq.current !== seq) return;
        setSeriesLoading(false);
      });
  }, [promId, range, seriesKey]);

  return (
    <PageLayout title={t('title')}>
      <Tabs activeKey={tab} onChange={onTabChange}>
        <Tabs.TabPane tab={t('tab.overview')} key='overview'>
          <Overview
            prometheusList={prometheusList}
            promId={promId}
            onPromIdChange={(id) => {
              setPromId(id);
              localStorage.setItem(PROM_LS, String(id));
            }}
            jaegerId={jaegerId}
            range={range}
            onRangeChange={setRange}
            search={search}
            onSearchChange={setSearch}
            topN={topN}
            onTopNChange={setTopN}
            rows={visibleRows}
            qps={qps}
            errorRate={errorRate}
            p95={p95}
            qpsNames={qpsNames}
            errorNames={errorNames}
            p95Names={p95Names}
            loading={loading}
            seriesLoading={seriesLoading}
            failed={failed}
            onRefresh={() => setRefreshKey((k) => k + 1)}
            teamMeta={teamMeta}
          />
        </Tabs.TabPane>
        <Tabs.TabPane tab={t('tab.global_topology')} key='topology'>
          {/* Same as Detail: do not keep Graph mounted under display:none. */}
          {tab === 'topology' ? <Topology /> : null}
        </Tabs.TabPane>
      </Tabs>
    </PageLayout>
  );
}
