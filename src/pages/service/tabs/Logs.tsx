import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getLogExplorerTarget, getLogTraceConfig } from '@/dh/logTrace/config';
import { buildServiceLogQuery, type ServiceIdentity } from '@/dh/service';
import Explorer from '@/pages/logExplorer/Explorer';
import getFormValuesBySearchParams from '@/pages/logExplorer/utils/getFormValuesBySearchParams';

import { NS } from '../constants';
import TabEmpty from './TabEmpty';

interface Props {
  identity: Pick<ServiceIdentity, 'service' | 'cluster' | 'namespace'>;
}

function buildEmbeddedLogFormValues(identity: Props['identity']) {
  if (!identity.service) return undefined;
  const target = getLogExplorerTarget(getLogTraceConfig());
  if (!target) return undefined;
  const params: Record<string, string> = {
    data_source_name: 'elasticsearch',
    data_source_id: String(target.datasourceId),
    query: buildServiceLogQuery(identity),
  };
  if (target.indexPattern != null) {
    params.index_pattern = String(target.indexPattern);
  } else if (target.index) {
    params.index = target.index;
  }
  const formValues = getFormValuesBySearchParams(params);
  if (!formValues) return undefined;
  return {
    ...formValues,
    refreshFlag: 'refreshFlag_service_embed',
  };
}

export default function Logs({ identity }: Props) {
  const { t } = useTranslation(NS);
  const initialFormValues = useMemo(
    () => buildEmbeddedLogFormValues(identity),
    [identity.service, identity.cluster, identity.namespace],
  );
  const [isInited, setIsInited] = useState(false);
  const [formValues, setFormValues] = useState(initialFormValues);

  if (!formValues) {
    return <TabEmpty description={t('overview.logs_missing_config')} />;
  }

  return (
    <div className='n9e h-[calc(100vh-200px)] min-h-[480px]'>
      <Explorer
        active
        tabKey='service-detail-logs'
        defaultFormValuesControl={{
          isInited,
          setIsInited: () => setIsInited(true),
          defaultFormValues: formValues,
          setDefaultFormValues: (newValues) => {
            setIsInited(true);
            setFormValues(newValues);
          },
        }}
      />
    </div>
  );
}
