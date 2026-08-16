import { useEffect, useMemo } from 'react';

import { rememberTraceDatasourceId } from './config';
import { parseTraceDeepLink, TraceDeepLink } from './deepLink';

/**
 * 解析链路探索页的直达参数，并把这次实际用到的数据源记下来。
 * 这样「多个 Jaeger 数据源时让用户选」只会发生一次，之后日志侧直接给唯一入口。
 */
export default function useTraceDeepLink(search: string): TraceDeepLink {
  const deepLink = useMemo(() => parseTraceDeepLink(search), [search]);

  useEffect(() => {
    if ((deepLink.traceId || deepLink.service) && deepLink.datasourceId !== undefined) {
      rememberTraceDatasourceId(deepLink.datasourceId);
    }
  }, [deepLink.traceId, deepLink.service, deepLink.datasourceId]);

  return deepLink;
}
