import React from 'react';
import PageLayout from '@/components/pageLayout';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { useTraceDeepLink } from '@/dh/logTrace';
import Trace from './index';
import Dependencies from './Dependencies';
import './locale';

export { Dependencies };

export default function index() {
  const { t } = useTranslation('trace');
  const deepLink = useTraceDeepLink(useLocation().search);

  return (
    <PageLayout title={t('title')}>
      <div>
        <div className='fc-border rounded-lg p-4'>
          <Trace init={deepLink.traceId} initPluginId={deepLink.datasourceId} initPluginType={deepLink.pluginType} />
        </div>
      </div>
    </PageLayout>
  );
}
