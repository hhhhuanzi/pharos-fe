import React from 'react';
import { Button, Select, Space, Tooltip } from 'antd';
import { QuestionCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

import TimeRangePicker, { type IRawTimeRange } from '@/components/TimeRangePicker';
import { NS } from '@/pages/service/constants';
import { MONITORING_RANGE_LS } from '@/pages/service/storage';

import type { MonitoringDatasource } from '../datasource';
import { scopeOptionKey, type MonitoringScopeOption } from '../scope';

interface Props {
  range: IRawTimeRange;
  onRangeChange: (range: IRawTimeRange) => void;
  datasourceList: MonitoringDatasource[];
  datasourceId?: number;
  onDatasourceChange: (id: number) => void;
  scopeOptions: MonitoringScopeOption[];
  activeScope?: MonitoringScopeOption;
  onScopeChange: (key: string) => void;
  onRefresh: () => void;
}

function scopeLabel(option: MonitoringScopeOption): string {
  return option.namespace ? `${option.cluster} / ${option.namespace}` : option.cluster;
}

export default function Toolbar(props: Props) {
  const { t } = useTranslation(NS);
  const { range, onRangeChange, datasourceList, datasourceId, onDatasourceChange, scopeOptions, activeScope, onScopeChange, onRefresh } = props;

  return (
    <div className='flex flex-wrap items-center justify-between gap-y-2 rounded-lg bg-fc-100 p-4 fc-border'>
      <Space wrap>
        <TimeRangePicker localKey={MONITORING_RANGE_LS} value={range} onChange={(val) => val && onRangeChange(val)} dateFormat='YYYY-MM-DD HH:mm:ss' />
        <Space size={4}>
          <span className='text-base text-hint'>{t('monitoring.datasource')}</span>
          <Tooltip title={t('monitoring.datasource_hint')}>
            <QuestionCircleOutlined className='text-soft' />
          </Tooltip>
          <Select
            value={datasourceId}
            onChange={onDatasourceChange}
            placeholder={t('overview.no_prometheus')}
            showSearch
            optionFilterProp='children'
            style={{ minWidth: 160 }}
          >
            {datasourceList.map((item) => (
              <Select.Option key={item.id} value={item.id}>
                {item.name}
              </Select.Option>
            ))}
          </Select>
        </Space>
        <Space size={4}>
          <span className='text-base text-hint'>{t('monitoring.scope')}</span>
          {scopeOptions.length > 1 ? (
            <Select
              value={activeScope ? scopeOptionKey(activeScope) : undefined}
              onChange={onScopeChange}
              style={{ minWidth: 220 }}
            >
              {scopeOptions.map((option) => (
                <Select.Option key={scopeOptionKey(option)} value={scopeOptionKey(option)}>
                  {scopeLabel(option)}
                </Select.Option>
              ))}
            </Select>
          ) : (
            <span className='text-base text-main'>{activeScope ? scopeLabel(activeScope) : t('identity.unset')}</span>
          )}
        </Space>
        <Tooltip title={t('overview.refresh')}>
          <Button icon={<ReloadOutlined />} onClick={onRefresh} />
        </Tooltip>
      </Space>
      <div className='text-sm text-hint'>{t('monitoring.hint')}</div>
    </div>
  );
}
