import { useEffect, useRef, useState } from 'react';

import { IRawTimeRange, timeRangeUnix } from '@/components/TimeRangePicker';
import { fetchGlobalEvents, type GlobalEventQuery, type K8sEvent } from '@/dh/service';

export function useEventerEvents(promId: number | undefined, range: IRawTimeRange, query: GlobalEventQuery, refreshKey: number) {
  const [events, setEvents] = useState<K8sEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const requestSeq = useRef(0);

  const service = query.service || '';
  const clustersKey = (query.clusters || []).join('\0');
  const namespacesKey = (query.namespaces || []).join('\0');

  useEffect(() => {
    if (promId == null) {
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
    fetchGlobalEvents(promId, query, start, end)
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
  }, [promId, range, service, clustersKey, namespacesKey, refreshKey]);

  return { events, loading, failed };
}
