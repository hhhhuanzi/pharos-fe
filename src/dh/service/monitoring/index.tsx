import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Collapse, Empty, Spin } from 'antd';
import { useTranslation } from 'react-i18next';

import { CommonStateContext } from '@/App';
import { getDefaultValue, timeRangeUnix, type IRawTimeRange } from '@/components/TimeRangePicker';
import { valueAsString } from '@/components/TimeRangePicker/utils';
import { NS } from '@/pages/service/constants';
import { MONITORING_RANGE_LS } from '@/pages/service/storage';

import { fetchMonitoringScopes } from './api';
import { pickMonitoringDatasourceId, readMonitoringDatasourceId, type MonitoringDatasource } from './datasource';
import { MONITORING_SECTIONS } from './panels';
import { isMonitoringIdentityPending, resolveScopeOption, type MonitoringScopeOption } from './scope';
import type { MonitoringScope } from './selectors';
import SectionPanels from './components/SectionPanels';
import Toolbar from './components/Toolbar';

export interface ServiceMonitoringProps {
  service: string;
  /** Header environment. Spanmetrics queries use it; K8s queries use the env's cluster/ns. */
  env?: string;
  /**
   * Preferred scope from the current environment's association.
   * `undefined` means association is still loading — do not pick another env's pair.
   */
  clusters?: string[];
  namespaces?: string[];
}

const DEFAULT_RANGE: IRawTimeRange = { start: 'now-1h', end: 'now' };
const RANGE_DATE_FORMAT = 'YYYY-MM-DD HH:mm:ss';

function persistMonitoringRange(next: IRawTimeRange) {
  try {
    localStorage.setItem(
      MONITORING_RANGE_LS,
      JSON.stringify({
        start: valueAsString(next.start, RANGE_DATE_FORMAT),
        end: valueAsString(next.end, RANGE_DATE_FORMAT),
      }),
    );
  } catch {
    // quota / private mode — the in-memory range still updates
  }
}

/**
 * The page is 6+ screens tall, so a section header that scrolls away leaves no way to tell
 * which section is on screen. Pinning each header inside its own item makes them hand over
 * to each other while scrolling. The bar needs an opaque fill or panels show through it.
 */
const SECTION_COLLAPSE_CLASS = [
  '[&>.ant-collapse-item]:mb-4 [&>.ant-collapse-item:last-child]:mb-0',
  // -top-4 cancels the scroll container's 16px padding, so nothing shows above a pinned header.
  '[&_.ant-collapse-header]:sticky [&_.ant-collapse-header]:-top-4 [&_.ant-collapse-header]:z-10',
  '[&_.ant-collapse-header]:items-center [&_.ant-collapse-header]:rounded-lg [&_.ant-collapse-header]:bg-fc-200 [&_.ant-collapse-header]:py-2',
  '[&_.ant-collapse-header]:border-0 [&_.ant-collapse-header]:border-l-4 [&_.ant-collapse-header]:border-solid [&_.ant-collapse-header]:border-l-primary',
  '[&_.ant-collapse-content-box]:px-0 [&_.ant-collapse-content-box]:pb-0',
].join(' ');

function EmptyState({ description }: { description: string }) {
  return (
    <div className='flex min-h-[240px] items-center justify-center rounded-lg bg-fc-100 p-4 fc-border'>
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={description} />
    </div>
  );
}

export default function ServiceMonitoring({ service, env, clusters, namespaces }: ServiceMonitoringProps) {
  const { t } = useTranslation(NS);
  const { groupedDatasourceList } = useContext(CommonStateContext);
  const datasourceList: MonitoringDatasource[] = groupedDatasourceList.prometheus || [];
  const datasourceIds = datasourceList.map((item) => item.id).join(',');

  const [range, setRange] = useState<IRawTimeRange>(() => getDefaultValue(MONITORING_RANGE_LS, DEFAULT_RANGE) || DEFAULT_RANGE);
  const [datasourceId, setDatasourceId] = useState<number | undefined>();
  const [scopeOptions, setScopeOptions] = useState<MonitoringScopeOption[]>([]);
  const [scopeLoading, setScopeLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const scopeSeq = useRef(0);

  // The datasource list arrives asynchronously, so re-pick until the current choice is in it.
  useEffect(() => {
    setDatasourceId((current) =>
      current != null && datasourceList.some((item) => item.id === current) ? current : pickMonitoringDatasourceId(datasourceList, readMonitoringDatasourceId()),
    );
  }, [datasourceIds]);

  useEffect(() => {
    if (!service || datasourceId == null) {
      setScopeOptions([]);
      return;
    }
    const { end } = timeRangeUnix(range);
    const seq = scopeSeq.current + 1;
    scopeSeq.current = seq;
    setScopeLoading(true);
    fetchMonitoringScopes(datasourceId, service, end)
      .then((options) => {
        if (scopeSeq.current !== seq) return;
        setScopeOptions(options);
      })
      .catch(() => {
        if (scopeSeq.current !== seq) return;
        setScopeOptions([]);
      })
      .finally(() => {
        if (scopeSeq.current !== seq) return;
        setScopeLoading(false);
      });
  }, [service, datasourceId, range, refreshKey]);

  const preferredCluster = clusters?.length === 1 ? clusters[0] : undefined;
  const preferredNamespace = namespaces?.length === 1 ? namespaces[0] : undefined;
  const identityPending = isMonitoringIdentityPending(env, clusters);

  const activeScopeOption = useMemo(() => {
    if (identityPending) return undefined;
    return resolveScopeOption(scopeOptions, { cluster: preferredCluster, namespace: preferredNamespace });
  }, [scopeOptions, identityPending, preferredCluster, preferredNamespace]);

  const scope = useMemo((): MonitoringScope | undefined => {
    if (!activeScopeOption) return undefined;
    const next: MonitoringScope = { service, cluster: activeScopeOption.cluster };
    if (activeScopeOption.namespace) next.namespace = activeScopeOption.namespace;
    if (env) next.env = env;
    return next;
  }, [service, env, activeScopeOption]);

  const handleRangeChange = useCallback((next: IRawTimeRange) => {
    persistMonitoringRange(next);
    setRange(next);
  }, []);

  const renderBody = () => {
    if (!datasourceList.length) return <EmptyState description={t('overview.no_prometheus')} />;
    if (datasourceId == null) return <EmptyState description={t('monitoring.no_datasource')} />;
    if (identityPending || (scopeLoading && !scope)) {
      return (
        <div className='flex min-h-[240px] items-center justify-center rounded-lg bg-fc-100 p-4 fc-border'>
          <Spin />
        </div>
      );
    }
    if (!scope) return <EmptyState description={t('monitoring.no_scope', { service })} />;
    return (
      <Collapse
        ghost
        destroyInactivePanel
        className={SECTION_COLLAPSE_CLASS}
        defaultActiveKey={MONITORING_SECTIONS.filter((section) => section.defaultOpen).map((section) => section.id)}
      >
        {MONITORING_SECTIONS.map((section) => (
          // No forceRender on purpose: an unmounted panel is how sections stay lazy.
          // 16px bold is the top of this tab's hierarchy: panel titles sit at 14px medium and every
          // label inside a card at 12px. It previously matched the panel titles exactly, which left
          // the bar and the left rule as the only thing separating a section from its contents.
          <Collapse.Panel key={section.id} header={<span className='text-l2 font-bold text-title'>{t(section.titleKey)}</span>}>
            <SectionPanels section={section} scope={scope} datasourceId={datasourceId} range={range} refreshKey={refreshKey} onRangeChange={handleRangeChange} />
          </Collapse.Panel>
        ))}
      </Collapse>
    );
  };

  return (
    <div className='flex flex-col gap-4'>
      <Toolbar range={range} onRangeChange={handleRangeChange} onRefresh={() => setRefreshKey((key) => key + 1)} />
      {renderBody()}
    </div>
  );
}
