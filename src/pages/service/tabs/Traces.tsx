import React from 'react';
import { useTranslation } from 'react-i18next';

import TraceExplorer from '@/dh/trace/explorer';

import { NS } from '../constants';
import TabEmpty from './TabEmpty';

interface Props {
  service: string;
  jaegerId?: number;
}

export default function Traces({ service, jaegerId }: Props) {
  const { t } = useTranslation(NS);
  if (jaegerId == null) return <TabEmpty description={t('overview.no_jaeger')} />;
  return (
    <TraceExplorer lockService initService={service} initPluginId={jaegerId} initPluginType='jaeger' />
  );
}
