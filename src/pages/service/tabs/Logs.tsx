import React, { useState } from 'react';
import { Spin } from 'antd';
import { useTranslation } from 'react-i18next';

import type { ServiceAssociation, ServiceIdentity } from '@/dh/service';
import { useServiceLogTarget } from '@/dh/serviceLog';
import Explorer from '@/pages/logExplorer/Explorer';

import { NS } from '../constants';
import TabEmpty from './TabEmpty';

interface Props {
  identity: Pick<ServiceIdentity, 'service' | 'env' | 'cluster' | 'namespace'>;
  association: ServiceAssociation;
  associationReady: boolean;
  promId?: number;
}

export default function Logs({ identity, association, associationReady, promId }: Props) {
  const { t } = useTranslation(NS);
  const [isInited, setIsInited] = useState(false);
  const target = useServiceLogTarget({
    service: identity.service,
    env: identity.env,
    namespace: identity.namespace,
    associationNamespaces: association.namespaces,
    associationReady,
    promId,
  });

  if (target.status === 'loading') {
    return (
      <div className='flex min-h-[240px] items-center justify-center rounded-lg bg-fc-100 p-4 fc-border'>
        <Spin />
      </div>
    );
  }

  if (target.status === 'missing_scope') {
    return <TabEmpty description={t('overview.logs_missing_scope')} />;
  }

  if (target.status === 'ambiguous_namespace') {
    return <TabEmpty description={t('overview.logs_ambiguous_namespace')} />;
  }

  if (target.status === 'pattern_missing') {
    return <TabEmpty description={t('overview.logs_index_pattern_missing', { pattern: target.indexPatternName })} />;
  }

  if (target.status === 'error' || !target.formValues) {
    return <TabEmpty description={t('overview.logs_index_pattern_load_failed')} />;
  }

  return (
    <div className='n9e h-[calc(100vh-200px)] min-h-[480px]'>
      <Explorer
        active
        tabKey='service-detail-logs'
        defaultFormValuesControl={{
          isInited,
          setIsInited: () => setIsInited(true),
          defaultFormValues: target.formValues,
        }}
      />
    </div>
  );
}
