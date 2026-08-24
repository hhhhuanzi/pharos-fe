import React, { useState } from 'react';
import { message, Radio, Space } from 'antd';
import { useTranslation } from 'react-i18next';
import Search from './Search';
import Detail from '@/pages/traceCpt/Detail';
import { getTraceByID } from '@/pages/traceCpt/services';
import { transformTraceData } from '@/pages/traceCpt/utils';
import type { SearchTraceIDType, SearchTraceType, Trace } from '@/pages/traceCpt/type';
import { ViewLogsLink } from '@/dh/logTrace';
import type { IRawTimeRange } from '@/components/TimeRangePicker';
import type { TracePluginType } from '../types';
import { SpanFlamegraph } from '../spanFlamegraph';
import TraceList from './TraceList';
import { isSpanFlamegraphSwitchVisible } from './visibility';
import '@/pages/traceCpt/index.less';

type DetailView = 'waterfall' | 'span-flame';

interface IProps {
  init?: string;
  initPluginId?: number;
  initPluginType?: TracePluginType;
  initService?: string;
  initTags?: string;
  initRange?: IRawTimeRange;
  /** Service-detail embed: pin type + datasource + service (do not hide the selects). */
  lockService?: boolean;
}

/**
 * Pharos trace explorer (R-28): the search result list is a table rather than a card feed, so a
 * single screen carries far more traces. The detail view reuses the upstream waterfall.
 * Span flamegraph Radio is gated by `isSpanFlamegraphSwitchVisible` (1.2.0 off).
 */
export default function TraceExplorer(props: IProps) {
  const { init, initPluginId, initPluginType, initService, initTags, initRange, lockService } = props;
  const { t } = useTranslation('trace');
  const [search, setSearch] = useState<SearchTraceType>();
  const [curTrace, setCurTrace] = useState<Trace>();
  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activePluginType, setActivePluginType] = useState<TracePluginType | undefined>(initPluginType);
  const [detailView, setDetailView] = useState<DetailView>('waterfall');

  const openTrace = async (params: SearchTraceIDType) => {
    if (!params.traceID) return;
    setActivePluginType(params.plugin_type || initPluginType);
    setDetailLoading(true);
    try {
      const res = await getTraceByID(params);
      const first = Array.isArray(res) ? res[0] : res;
      const trace = first ? transformTraceData(first) : null;
      if (trace) {
        setDetailView('waterfall');
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
      <div className='fc-border rounded-lg bg-fc-100 p-3'>
        <Search
          init={init}
          initPluginId={initPluginId}
          initPluginType={initPluginType}
          initService={initService}
          initTags={initTags}
          initRange={initRange}
          lockService={lockService}
          onSearch={handleSearch}
          resultLoading={listLoading || detailLoading}
        />
      </div>
      <div className='mt-4'>
        {curTrace ? (
          <Detail
            trace={curTrace}
            onBack={() => {
              setDetailView('waterfall');
              setCurTrace(undefined);
            }}
            extra={
              <Space className='ml-2' size={8}>
                {isSpanFlamegraphSwitchVisible() && (
                  <Radio.Group
                    value={detailView}
                    buttonStyle='solid'
                    onChange={(e) => setDetailView(e.target.value)}
                  >
                    <Radio.Button value='waterfall'>{t('span_flame.waterfall')}</Radio.Button>
                    <Radio.Button value='span-flame'>{t('span_flame.title')}</Radio.Button>
                  </Radio.Group>
                )}
                <ViewLogsLink
                  entry='detail'
                  pluginType={activePluginType}
                  traceId={curTrace.traceID}
                  startUs={curTrace.startTime}
                  durationUs={curTrace.duration}
                />
              </Space>
            }
            body={
              isSpanFlamegraphSwitchVisible() && detailView === 'span-flame' ? (
                <SpanFlamegraph key={curTrace.traceID} trace={curTrace} />
              ) : undefined
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
