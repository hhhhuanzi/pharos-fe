import React, { useEffect, useState } from 'react';
import { Button, Select, Spin } from 'antd';
import { useTranslation } from 'react-i18next';
import _ from 'lodash';
import { getTraceSearch, getTracePagedSearch } from '../services';
import { SearchTraceType, Trace, TraceResponse, TraceSortItem } from '../type';
import Detail from '../Detail';
import LabelField from '../components/LabelField';
import ResultItem from './ResultItem';
import { sortTraces, transformTraceData } from '../utils';
import ScatterBulleChart from '../components/ScatterBubbleChart/ScatterBubbleChart';
import '../index.less';

/** SkyWalking paginated list page size (see `queryBasicTraces` paging). */
const SW_PAGE_SIZE = 20;

interface IProps {
  search?: SearchTraceType;
  onFetching: (v: boolean) => void;
  loading: boolean;
}

/** Transform a page of full `TraceResponse`s into `Trace`s (with spans/services), skipping any that fail. */
function toTraceList(responses: TraceResponse[]): Trace[] {
  return responses.reduce<Trace[]>((acc, res) => {
    try {
      const trace = transformTraceData(res);
      if (trace) acc.push(trace);
    } catch (e) {
      console.log(e);
    }
    return acc;
  }, []);
}

function SelectSort(props: { onChange: (v: keyof typeof TraceSortItem) => void }) {
  const { t } = useTranslation('trace');
  const [value, setValue] = useState('MOST_RECENT');

  const handleChange = (v) => {
    setValue(v);
    props.onChange(v);
  };

  return (
    <LabelField label='Sort'>
      <Select style={{ width: 130 }} value={value} onChange={handleChange}>
        {(Object.keys(TraceSortItem) as Array<keyof typeof TraceSortItem>).map((key) => (
          <Select.Option value={key} key={key}>
            {t(`sort.${key}`)}
          </Select.Option>
        ))}
      </Select>
    </LabelField>
  );
}

export default function TraceResult(props: IProps) {
  const { search, onFetching, loading } = props;
  const { t } = useTranslation('trace');
  const [curTrace, setCurTrace] = useState<Trace>();
  const [traces, setTraces] = useState<Trace[]>([]);
  const [maxTraceDuration, setMaxTraceDuration] = useState(0);
  const [sort, setSort] = useState<keyof typeof TraceSortItem>();
  // SkyWalking paginated list state (Jaeger keeps its one-shot query).
  const [pageNum, setPageNum] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const isSkyWalking = search?.plugin_type === 'skywalking';

  /**
   * SkyWalking: fetch one page of full traces (basicTraces ids -> per-trace full fetch).
   * `reset` starts a fresh query, otherwise appends (load more), de-duplicating by traceID.
   */
  const loadSkyWalkingPage = (page: number, reset: boolean) => {
    if (!search) return;
    if (reset) {
      onFetching(true);
    } else {
      setLoadingMore(true);
    }
    getTracePagedSearch({ ...search, page_num: page, page_size: SW_PAGE_SIZE })
      .then((res) => {
        const mapped = toTraceList(res.traces);
        setTraces((prev) => {
          const base = reset ? [] : prev;
          const merged = _.uniqBy([...base, ...mapped], 'traceID');
          return sortTraces(merged, sort || 'MOST_RECENT');
        });
        setHasMore(res.hasMore);
        setPageNum(page);
        if (reset) setCurTrace(undefined);
      })
      .catch((e) => {
        console.log(e);
      })
      .finally(() => {
        if (reset) {
          onFetching(false);
        } else {
          setLoadingMore(false);
        }
      });
  };

  useEffect(() => {
    if (!search) return;
    setHasMore(false);
    if (isSkyWalking) {
      loadSkyWalkingPage(1, true);
      return;
    }
    // Jaeger (and others): unchanged one-shot full-trace search.
    onFetching(true);
    getTraceSearch(search)
      .then((res) => {
        try {
          setTraces(sortTraces(toTraceList(res), sort || 'MOST_RECENT'));
        } catch (e) {
          console.log(e);
        }
        // setMaxTraceDuration(calcMaxDuration(res));
        setCurTrace(undefined);
        onFetching(false);
      })
      .catch((e) => {
        onFetching(false);
      });
  }, [search]);

  const handleSort = (v: keyof typeof TraceSortItem) => {
    setSort(v);
    setTraces(sortTraces(traces, v));
  };

  /**
   * Open a trace: both Jaeger and SkyWalking list rows now carry the full trace (spans loaded
   * per page), so the detail waterfall can render directly without an extra fetch.
   */
  const handleSelectTrace = (trace: Trace) => {
    setCurTrace(trace);
  };

  return curTrace ? (
    <Detail trace={curTrace} onBack={() => setCurTrace(undefined)} />
  ) : (
    <Spin spinning={loading}>
      {traces.length > 0 && (
        <div className='tracing-search-chart'>
          <ScatterBulleChart data={traces} elClick={handleSelectTrace} />
        </div>
      )}
      <div className='tracing-search-result'>
        <div className='tracing-search-result--headerOverview'>
          <h2>
            {traces.length} Trace{traces.length > 1 && 's'}
          </h2>
          <SelectSort onChange={handleSort} />
        </div>
        {traces.map((trace) => (
          <ResultItem trace={trace} key={trace.traceID} maxTraceDuration={maxTraceDuration} onClick={handleSelectTrace} />
        ))}
        {isSkyWalking && hasMore && (
          <div className='flex justify-center mt-4'>
            <Button loading={loadingMore} onClick={() => loadSkyWalkingPage(pageNum + 1, false)}>
              {t('load_more')}
            </Button>
          </div>
        )}
      </div>
    </Spin>
  );
}
