import React, { useState } from 'react';
import { message } from 'antd';
import { useTranslation } from 'react-i18next';
import Search from '@/pages/traceCpt/Search';
import Detail from '@/pages/traceCpt/Detail';
import { getTraceByID } from '@/pages/traceCpt/services';
import { transformTraceData } from '@/pages/traceCpt/utils';
import type { SearchTraceIDType, SearchTraceType, Trace } from '@/pages/traceCpt/type';
import { ViewLogsLink } from '@/dh/logTrace';
import type { TracePluginType } from '../types';
import TraceList from './TraceList';
import '@/pages/traceCpt/index.less';

interface IProps {
  init?: string;
  initPluginId?: number;
  initPluginType?: TracePluginType;
}

/**
 * Pharos trace explorer (R-28): the search result list is a table rather than a card feed, so a
 * single screen carries far more traces. The detail view still reuses the upstream waterfall.
 */
export default function TraceExplorer(props: IProps) {
  const { init, initPluginId, initPluginType } = props;
  const { t } = useTranslation('trace');
  const [search, setSearch] = useState<SearchTraceType>();
  const [curTrace, setCurTrace] = useState<Trace>();
  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activePluginType, setActivePluginType] = useState<TracePluginType | undefined>(initPluginType);

  const openTrace = async (params: SearchTraceIDType) => {
    if (!params.traceID) return;
    setActivePluginType(params.plugin_type || initPluginType);
    setDetailLoading(true);
    try {
      const res = await getTraceByID(params);
      const first = Array.isArray(res) ? res[0] : res;
      const trace = first ? transformTraceData(first) : null;
      if (trace) {
        setCurTrace(trace);
      } else {
        message.warning(t('list.trace_not_found'));
      }
    } catch (e) {
      message.warning(t('list.trace_not_found'));
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSearch = (value: SearchTraceType | SearchTraceIDType) => {
    if ('traceID' in value) {
      setCurTrace(undefined);
      openTrace(value);
      return;
    }
    setCurTrace(undefined);
    setActivePluginType(value.plugin_type);
    setSearch(value);
  };

  return (
    <div className='tracing'>
      <div className='fc-border rounded-lg bg-fc-100 p-4'>
        <Search init={init} initPluginId={initPluginId} initPluginType={initPluginType} onSearch={handleSearch} resultLoading={listLoading || detailLoading} />
      </div>
      <div className='mt-4'>
        {curTrace ? (
          <Detail
            trace={curTrace}
            onBack={() => setCurTrace(undefined)}
            extra={
              <ViewLogsLink
                entry='detail'
                pluginType={activePluginType}
                traceId={curTrace.traceID}
                startUs={curTrace.startTime}
                durationUs={curTrace.duration}
              />
            }
          />
        ) : (
          <TraceList
            search={search}
            loading={listLoading || detailLoading}
            onFetching={setListLoading}
            onOpenTrace={(traceID) => {
              if (!search) return;
              openTrace({ traceID, data_source_id: search.data_source_id, plugin_type: search.plugin_type });
            }}
          />
        )}
      </div>
    </div>
  );
}
