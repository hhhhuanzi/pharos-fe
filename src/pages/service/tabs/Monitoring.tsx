import React from 'react';
import { useTranslation } from 'react-i18next';

import TimeRangePicker, { getDefaultValue, IRawTimeRange } from '@/components/TimeRangePicker';

import { NS } from '../constants';
import { MONITORING_RANGE_LS } from '../storage';
import TabEmpty from './TabEmpty';

interface Props {
  service: string;
}

export default function Monitoring({ service }: Props) {
  const { t } = useTranslation(NS);
  const [range, setRange] = React.useState<IRawTimeRange>(
    () => getDefaultValue(MONITORING_RANGE_LS, { start: 'now-1h', end: 'now' }) || { start: 'now-1h', end: 'now' },
  );

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-center justify-between gap-y-2 rounded-lg bg-fc-100 p-4 fc-border'>
        <TimeRangePicker localKey={MONITORING_RANGE_LS} value={range} onChange={(val) => val && setRange(val)} dateFormat='YYYY-MM-DD HH:mm:ss' />
        <div className='text-sm text-hint'>{t('monitoring.hint')}</div>
      </div>
      <TabEmpty description={t('tab.monitoring_empty_named', { service })} />
    </div>
  );
}
