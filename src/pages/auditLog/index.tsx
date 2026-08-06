import React, { useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAntdTable } from 'ahooks';
import { Input, Select, Table, Tag, Modal, Space, Descriptions } from 'antd';
import moment from 'moment';

import PageLayout from '@/components/pageLayout';
import TimeRangePicker, { parseRange, getDefaultValue, IRawTimeRange } from '@/components/TimeRangePicker';
import { CommonStateContext } from '@/App';
import usePagination from '@/components/usePagination';

import { PATH, OBJECT_TYPE_OPTIONS, RISK_LEVEL_OPTIONS, RISK_LEVEL_COLOR } from './constants';
import { getAuditLogs, AuditLogItem } from './services';
import RequestBodyView from './RequestBodyView';
import './locale';

const CACHE_KEY = 'audit_log_range';

function resolveRiskLevel(val?: string) {
  if (val === 'high' || val === 'medium' || val === 'low') return val;
  return 'low';
}

export default function AuditLog() {
  const { t } = useTranslation('auditLog');
  const { perms } = useContext(CommonStateContext);
  // 没有 /audit-log 权限点的用户，后端会强制把查询范围收窄到自己的操作记录
  // （见 center/router/router_dh_audit.go），这里只是同步隐藏用不上的筛选项
  const hasFullAccess = !!perms?.includes(PATH);

  const [range, setRange] = useState<IRawTimeRange>(getDefaultValue(CACHE_KEY, { start: 'now-24h', end: 'now' }));
  const [username, setUsername] = useState<string>('');
  const [objectType, setObjectType] = useState<string | undefined>(undefined);
  const [riskLevel, setRiskLevel] = useState<string | undefined>(undefined);
  const [detailRecord, setDetailRecord] = useState<AuditLogItem | undefined>(undefined);
  const pagination = usePagination({ pageSizeLocalstorageKey: 'audit_log_table_pagesize', defaultPageSize: 30 });

  const { tableProps } = useAntdTable(
    ({ current, pageSize }) => {
      const parsedRange = parseRange(range);
      return getAuditLogs({
        p: current,
        limit: pageSize,
        username: hasFullAccess && username ? username : undefined,
        object_type: objectType,
        risk_level: riskLevel,
        stime: moment(parsedRange.start).unix(),
        etime: moment(parsedRange.end).unix(),
      }).then((res) => {
        return {
          total: res.dat.total,
          list: res.dat.list,
        };
      });
    },
    {
      refreshDeps: [range, username, objectType, riskLevel, hasFullAccess],
      defaultPageSize: 30,
      debounceWait: 300,
    },
  );

  const columns = [
    {
      title: t('columns.create_at'),
      dataIndex: 'create_at',
      width: 170,
      render: (val: number) => moment(val * 1000).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: t('columns.username'),
      dataIndex: 'username',
      width: 120,
      ellipsis: true,
    },
    {
      title: t('columns.remote_addr'),
      dataIndex: 'remote_addr',
      width: 140,
    },
    {
      title: t('columns.object_type'),
      dataIndex: 'object_type',
      width: 120,
      render: (val: string) => t(`object_type.${val}`, val),
    },
    {
      title: t('columns.resource'),
      dataIndex: 'action_label',
      ellipsis: true,
      render: (_val: string, record: AuditLogItem) => {
        const moduleName = record.module || t(`object_type.${record.object_type}`, record.object_type);
        const actionName = record.action_label || t(`action.${record.action}`, record.action);
        const text = moduleName && actionName ? `${moduleName} / ${actionName}` : moduleName || actionName || '-';
        return (
          <span title={text} className='truncate'>
            {text}
          </span>
        );
      },
    },
    {
      title: t('columns.status_code'),
      dataIndex: 'status_code',
      width: 90,
    },
    {
      title: t('columns.risk_level'),
      dataIndex: 'risk_level',
      width: 90,
      render: (val: string) => {
        const level = resolveRiskLevel(val);
        return <Tag color={RISK_LEVEL_COLOR[level]}>{t(`risk_level.${level}`)}</Tag>;
      },
    },
    {
      title: t('columns.operate'),
      dataIndex: 'operate',
      width: 90,
      render: (_val: unknown, record: AuditLogItem) => (
        <a
          onClick={() => {
            setDetailRecord(record);
          }}
        >
          {t('detail.view')}
        </a>
      ),
    },
  ];

  return (
    <PageLayout title={t('title')}>
      {/* 单层 n9e 容器：承接 PageLayout `&+div` 的 height/padding，避免筛选栏被撑成整页空白 */}
      <div className='n9e'>
        <div className='flex flex-wrap justify-between gap-y-2 rounded-lg bg-fc-100 p-4 fc-border'>
          <Space wrap>
            <TimeRangePicker localKey={CACHE_KEY} value={range} onChange={(val) => val && setRange(val)} />
            {hasFullAccess && (
              <Input
                className='w-[200px]'
                allowClear
                placeholder={t('filter.username_placeholder')}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            )}
            <Select
              allowClear
              className='min-w-[160px]'
              placeholder={t('filter.object_type_placeholder')}
              value={objectType}
              onChange={(val: string | undefined) => setObjectType(val)}
              dropdownMatchSelectWidth={false}
            >
              {OBJECT_TYPE_OPTIONS.map((item) => (
                <Select.Option key={item} value={item}>
                  {t(`object_type.${item}`)}
                </Select.Option>
              ))}
            </Select>
            <Select
              allowClear
              className='min-w-[120px]'
              placeholder={t('filter.risk_level_placeholder')}
              value={riskLevel}
              onChange={(val: string | undefined) => setRiskLevel(val)}
              dropdownMatchSelectWidth={false}
            >
              {RISK_LEVEL_OPTIONS.map((item) => (
                <Select.Option key={item} value={item}>
                  {t(`risk_level.${item}`)}
                </Select.Option>
              ))}
            </Select>
          </Space>
        </div>
        {!hasFullAccess && <div className='mt-2 text-base text-hint'>{t('self_view_tip')}</div>}
        <div className='mt-4'>
          <Table
            size='small'
            rowKey='id'
            scroll={{ x: 'max-content' }}
            columns={columns}
            {...tableProps}
            pagination={{
              ...pagination,
              ...tableProps.pagination,
            }}
          />
        </div>
      </div>
      <Modal
        title={t('detail.title')}
        visible={!!detailRecord}
        footer={null}
        width={720}
        onCancel={() => setDetailRecord(undefined)}
        destroyOnClose
      >
        {detailRecord && (
          <div className='flex flex-col gap-4'>
            <div>
              <div className='mb-3 text-l1 font-bold text-title'>{t('detail.basic')}</div>
              <Descriptions size='small' column={2}>
                <Descriptions.Item label={t('columns.username')}>{detailRecord.username || '-'}</Descriptions.Item>
                <Descriptions.Item label={t('columns.remote_addr')}>{detailRecord.remote_addr || '-'}</Descriptions.Item>
                <Descriptions.Item label={t('columns.create_at')}>
                  {moment(detailRecord.create_at * 1000).format('YYYY-MM-DD HH:mm:ss')}
                </Descriptions.Item>
                <Descriptions.Item label={t('columns.status_code')}>{detailRecord.status_code || '-'}</Descriptions.Item>
                <Descriptions.Item label={t('columns.resource')}>
                  {`${detailRecord.module || t(`object_type.${detailRecord.object_type}`, detailRecord.object_type)} / ${
                    detailRecord.action_label || t(`action.${detailRecord.action}`, detailRecord.action)
                  }`}
                </Descriptions.Item>
                <Descriptions.Item label={t('columns.risk_level')}>
                  <Tag color={RISK_LEVEL_COLOR[resolveRiskLevel(detailRecord.risk_level)]}>
                    {t(`risk_level.${resolveRiskLevel(detailRecord.risk_level)}`)}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label={t('detail.object_id')}>{detailRecord.object_id || '-'}</Descriptions.Item>
                <Descriptions.Item label={t('columns.method')}>{detailRecord.method || '-'}</Descriptions.Item>
                <Descriptions.Item label={t('detail.path')} span={2}>
                  <span className='break-all text-hint'>{detailRecord.path || '-'}</span>
                </Descriptions.Item>
                <Descriptions.Item label={t('detail.user_agent')} span={2}>
                  <span className='break-all text-hint'>{detailRecord.user_agent || '-'}</span>
                </Descriptions.Item>
              </Descriptions>
            </div>
            <div>
              <div className='mb-3 text-l1 font-bold text-title'>{t('detail.request_body')}</div>
              <RequestBodyView raw={detailRecord.request_body} />
            </div>
          </div>
        )}
      </Modal>
    </PageLayout>
  );
}
