import React from 'react';
import PageLayout from '@/components/pageLayout';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { useTraceDeepLink } from '@/dh/logTrace';
import TraceExplorer from '@/dh/trace/explorer';
import Dependencies from './Dependencies';
import './locale';

export { Dependencies };

export default function index() {
  const { t } = useTranslation('trace');
  const deepLink = useTraceDeepLink(useLocation().search);

  return (
    <PageLayout title={t('title')}>
      <div>
        <TraceExplorer
          init={deepLink.traceId}
          initPluginId={deepLink.datasourceId}
          initPluginType={deepLink.pluginType}
          initService={deepLink.service}
          initTags={deepLink.tags}
        />
      </div>
    </PageLayout>
  );
}
