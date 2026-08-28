import React, { useMemo } from 'react';
import moment from 'moment';
import { useTranslation } from 'react-i18next';

import TraceExplorer from '@/dh/trace/explorer';
import type { IRawTimeRange } from '@/components/TimeRangePicker';

import { NS } from '../constants';
import TabEmpty from './TabEmpty';

interface Props {
  service: string;
  jaegerId?: number;
  initTraceId?: string;
  /** Unix seconds; topology passes the same window as the graph. */
  initStartUnix?: number;
  initEndUnix?: number;
}

export default function Traces({ service, jaegerId, initTraceId, initStartUnix, initEndUnix }: Props) {
  const { t } = useTranslation(NS);
  const initRange: IRawTimeRange | undefined = useMemo(() => {
    if (initStartUnix == null || initEndUnix == null || initEndUnix <= initStartUnix) return undefined;
    return { start: moment.unix(initStartUnix), end: moment.unix(initEndUnix) };
  }, [initStartUnix, initEndUnix]);

  if (jaegerId == null) return <TabEmpty description={t('overview.no_jaeger')} />;
  return (
    <TraceExplorer lockService init={initTraceId} initService={service} initPluginId={jaegerId} initPluginType='jaeger' initRange={initRange} />
  );
}
