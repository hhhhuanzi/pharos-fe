import React from 'react';
import { Button, Space, Tooltip } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

import TimeRangePicker, { type IRawTimeRange } from '@/components/TimeRangePicker';
import { NS } from '@/pages/service/constants';
import { MONITORING_RANGE_LS } from '@/pages/service/storage';

interface Props {
  range: IRawTimeRange;
  onRangeChange: (range: IRawTimeRange) => void;
  onRefresh: () => void;
}

export default function Toolbar(props: Props) {
  const { t } = useTranslation(NS);
  const { range, onRangeChange, onRefresh } = props;

  return (
    <div className='flex flex-wrap items-center rounded-lg bg-fc-100 p-4 fc-border'>
      <Space wrap>
        <TimeRangePicker localKey={MONITORING_RANGE_LS} value={range} onChange={(val) => val && onRangeChange(val)} dateFormat='YYYY-MM-DD HH:mm:ss' />
        <Tooltip title={t('overview.refresh')}>
          <Button icon={<ReloadOutlined />} onClick={onRefresh} />
        </Tooltip>
      </Space>
    </div>
  );
}
