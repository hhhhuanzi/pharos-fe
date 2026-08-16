import React from 'react';
import { Button, Empty, Input, Select, Space, Tooltip } from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

import InputGroupWithFormItem from '@/components/InputGroupWithFormItem';
import TimeRangePicker, { IRawTimeRange } from '@/components/TimeRangePicker';
import { TOP_N_OPTIONS, type NamedSeries, type ServiceRow } from '@/dh/service';

import { NS } from '../constants';
import { RANGE_LS, TOP_N_LS } from '../storage';
import ServiceTable from './ServiceTable';
import TabEmpty from './TabEmpty';
import TopCharts from './TopCharts';

interface DatasourceOption {
  id: number;
  name: string;
}

interface Props {
  prometheusList: DatasourceOption[];
  promId?: number;
  onPromIdChange: (id: number) => void;
  jaegerId?: number;
  range: IRawTimeRange;
  onRangeChange: (range: IRawTimeRange) => void;
  search: string;
  onSearchChange: (value: string) => void;
  topN: number;
  onTopNChange: (n: number) => void;
  rows: ServiceRow[];
  qps: NamedSeries[];
  errorRate: NamedSeries[];
  p95: NamedSeries[];
  qpsNames: string[];
  errorNames: string[];
  p95Names: string[];
  loading: boolean;
  seriesLoading: boolean;
  failed: boolean;
  onRefresh: () => void;
}

export default function Overview(props: Props) {
  const {
    prometheusList,
    promId,
    onPromIdChange,
    jaegerId,
    range,
    onRangeChange,
    search,
    onSearchChange,
    topN,
    onTopNChange,
    rows,
    qps,
    errorRate,
    p95,
    qpsNames,
    errorNames,
    p95Names,
    loading,
    seriesLoading,
    failed,
    onRefresh,
  } = props;
  const { t } = useTranslation(NS);

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap justify-between gap-y-2 rounded-lg bg-fc-100 p-4 fc-border'>
        <Space wrap>
          {prometheusList.length > 1 && (
            <InputGroupWithFormItem label={t('common:datasource.id')}>
              <Select showSearch optionFilterProp='children' style={{ minWidth: 180 }} value={promId} onChange={onPromIdChange}>
                {prometheusList.map((ds) => (
                  <Select.Option key={ds.id} value={ds.id}>
                    {ds.name}
                  </Select.Option>
                ))}
              </Select>
            </InputGroupWithFormItem>
          )}
          <TimeRangePicker localKey={RANGE_LS} value={range} onChange={(val) => val && onRangeChange(val)} dateFormat='YYYY-MM-DD HH:mm:ss' />
          <Input
            allowClear
            prefix={<SearchOutlined />}
            style={{ width: 220 }}
            placeholder={t('overview.search_placeholder')}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          <InputGroupWithFormItem label={t('overview.top_n')}>
            <Select
              style={{ width: 88 }}
              value={topN}
              onChange={(n: number) => {
                onTopNChange(n);
                localStorage.setItem(TOP_N_LS, String(n));
              }}
            >
              {TOP_N_OPTIONS.map((n) => (
                <Select.Option key={n} value={n}>
                  {n}
                </Select.Option>
              ))}
            </Select>
          </InputGroupWithFormItem>
          <Tooltip title={t('overview.refresh')}>
            <Button icon={<ReloadOutlined />} onClick={onRefresh} />
          </Tooltip>
        </Space>
        <div className='text-sm text-hint'>{t('overview.hint')}</div>
      </div>

      {failed ? (
        <TabEmpty description={t('overview.load_failed')} />
      ) : (
        <>
          <TopCharts qps={qps} errorRate={errorRate} p95={p95} qpsNames={qpsNames} errorNames={errorNames} p95Names={p95Names} loading={seriesLoading} />
          {rows.length === 0 && !loading ? (
            <div className='flex min-h-[240px] items-center justify-center rounded-lg bg-fc-100 p-4 fc-border'>
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('overview.table_empty')} />
            </div>
          ) : (
            <ServiceTable rows={rows} loading={loading} jaegerId={jaegerId} />
          )}
        </>
      )}
    </div>
  );
}
