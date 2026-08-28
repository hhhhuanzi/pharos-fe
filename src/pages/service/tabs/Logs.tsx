import React, { useMemo, useState } from 'react';
import { Spin } from 'antd';
import { useTranslation } from 'react-i18next';

import type { NamedTeam } from '@/dh/serviceTeam';
import { ServiceLogLockProvider, useServiceLogTarget, type ServiceLogLock } from '@/dh/serviceLog';
import Explorer from '@/pages/logExplorer/Explorer';

import { NS } from '../constants';
import TabEmpty from './TabEmpty';

interface Props {
  service?: string;
  env?: string;
  teams?: NamedTeam[];
}

export default function Logs({ service, env, teams }: Props) {
  const { t } = useTranslation(NS);
  const [isInited, setIsInited] = useState(false);
  const target = useServiceLogTarget({ service, env, teams });

  // 服务下钻只查「所属业务 + 环境」这一个索引模式，把它作为锁传给内嵌 Explorer；
  // 全局日志分析入口不挂 Provider，能力不变。
  const lock = useMemo<ServiceLogLock | undefined>(() => {
    const formValues = target.formValues;
    if (target.status !== 'ready' || !formValues) return undefined;
    return {
      datasourceValue: formValues.datasourceValue,
      indexPatternId: formValues.query.index_pattern,
      indexPatternName: formValues.query.index,
    };
  }, [target.status, target.formValues]);

  if (target.status === 'loading') {
    return (
      <div className='flex min-h-[240px] items-center justify-center rounded-lg bg-fc-100 p-4 fc-border'>
        <Spin />
      </div>
    );
  }

  if (target.status === 'unbound') {
    return <TabEmpty description={t('overview.logs_unbound')} />;
  }

  if (target.status === 'ambiguous_team') {
    return <TabEmpty description={t('overview.logs_ambiguous_team')} />;
  }

  if (target.status === 'invalid_team_name') {
    return <TabEmpty description={t('overview.logs_invalid_team_name')} />;
  }

  if (target.status === 'missing_env') {
    return <TabEmpty description={t('overview.logs_missing_env')} />;
  }

  if (target.status === 'pattern_missing') {
    return <TabEmpty description={t('overview.logs_index_pattern_missing', { pattern: target.indexPatternName })} />;
  }

  if (target.status === 'pattern_forbidden') {
    return <TabEmpty description={t('overview.logs_index_pattern_forbidden', { pattern: target.indexPatternName })} />;
  }

  if (target.status === 'error' || !target.formValues || !lock) {
    return <TabEmpty description={t('overview.logs_index_pattern_load_failed')} />;
  }

  return (
    <ServiceLogLockProvider lock={lock}>
      <div className='n9e flex h-[calc(100vh-200px)] min-h-[480px] flex-col gap-2'>
        <div className='text-sm text-hint'>{t('overview.logs_locked_hint', { pattern: lock.indexPatternName })}</div>
        <div className='min-h-0 flex-1'>
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
      </div>
    </ServiceLogLockProvider>
  );
}
