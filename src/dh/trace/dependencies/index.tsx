import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Empty, Input, Select, Space, Spin, Table, Tooltip } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/lib/table';
import { useTranslation } from 'react-i18next';
import TimeRangePicker, { getDefaultValue, IRawTimeRange, timeRangeUnix } from '@/components/TimeRangePicker';
import InputGroupWithFormItem from '@/components/InputGroupWithFormItem';
import { CommonStateContext } from '@/App';
import { formatDuration } from '@/pages/traceCpt/utils/date';
import type { PharosServiceEdge } from '../contract';
import { edgeKey } from './promql';
import { fetchServiceGraph } from './query';
import ServiceGraphCanvas from './Graph';

const RANGE_LS = 'n9e-dh-service-graph-range';
const PROM_LS = 'n9e-dh-service-graph-prom-id';

function readStoredPromId(): number | undefined {
  const raw = localStorage.getItem(PROM_LS);
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function formatQps(requestCount: number, rangeSeconds: number): string {
  if (rangeSeconds <= 0) return '-';
  const qps = requestCount / rangeSeconds;
  if (qps >= 100) return qps.toFixed(0);
  if (qps >= 1) return qps.toFixed(1);
  return qps.toFixed(2);
}

function formatErrorRate(rate: number): string {
  return `${(rate * 100).toFixed(rate >= 0.1 ? 1 : 2)}%`;
}

/**
 * Track B (R-30): service-graph edges with RED, read from Prometheus `traces_service_graph_*`.
 * Official `/trace/dependencies` is a thin mount; this file owns the page body.
 */
export default function ServiceGraphPage() {
  const { t } = useTranslation('trace');
  const { groupedDatasourceList } = useContext(CommonStateContext);
  const prometheusList = groupedDatasourceList.prometheus || [];

  const [datasourceId, setDatasourceId] = useState<number | undefined>(() => {
    const stored = readStoredPromId();
    if (stored && prometheusList.some((ds) => ds.id === stored)) return stored;
    return prometheusList[0]?.id;
  });
  const [range, setRange] = useState<IRawTimeRange>(() => getDefaultValue(RANGE_LS, { start: 'now-1h', end: 'now' }) || { start: 'now-1h', end: 'now' });
  const [edges, setEdges] = useState<PharosServiceEdge[]>([]);
  const [rangeSeconds, setRangeSeconds] = useState(3600);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [serviceFilter, setServiceFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string>();
  const [focusService, setFocusService] = useState<string>();
  const requestSeq = useRef(0);

  useEffect(() => {
    if (datasourceId != null) return;
    const stored = readStoredPromId();
    if (stored && prometheusList.some((ds) => ds.id === stored)) {
      setDatasourceId(stored);
      return;
    }
    if (prometheusList[0]) setDatasourceId(prometheusList[0].id);
  }, [datasourceId, prometheusList]);

  useEffect(() => {
    if (datasourceId == null) {
      setEdges([]);
      setFailed(false);
      return;
    }
    const { start, end } = timeRangeUnix(range);
    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    setLoading(true);
    setFailed(false);
    fetchServiceGraph(datasourceId, start, end)
      .then((res) => {
        if (requestSeq.current !== seq) return;
        setEdges(res.edges);
        setRangeSeconds(Math.max(1, end - start));
      })
      .catch(() => {
        if (requestSeq.current !== seq) return;
        setEdges([]);
        setFailed(true);
      })
      .finally(() => {
        if (requestSeq.current !== seq) return;
        setLoading(false);
      });
  }, [datasourceId, range, refreshKey]);

  const visibleEdges = useMemo(() => {
    const q = serviceFilter.trim().toLowerCase();
    if (!q) return edges;
    return edges.filter((edge) => edge.client.toLowerCase().includes(q) || edge.server.toLowerCase().includes(q));
  }, [edges, serviceFilter]);

  const columns: ColumnsType<PharosServiceEdge> = [
    { title: t('graph.columns.client'), dataIndex: 'client', ellipsis: true },
    { title: t('graph.columns.server'), dataIndex: 'server', ellipsis: true },
    {
      title: t('graph.columns.connection'),
      dataIndex: 'connectionType',
      width: 120,
      render: (v: string) => v || '-',
    },
    {
      title: t('graph.columns.requests'),
      dataIndex: 'requestCount',
      width: 100,
      sorter: (a, b) => a.requestCount - b.requestCount,
      render: (v: number) => Math.round(v).toLocaleString(),
    },
    {
      title: t('graph.columns.qps'),
      key: 'qps',
      width: 80,
      render: (_: unknown, row) => formatQps(row.requestCount, rangeSeconds),
    },
    {
      title: t('graph.columns.error_rate'),
      dataIndex: 'errorRate',
      width: 100,
      defaultSortOrder: 'descend',
      sorter: (a, b) => a.errorRate - b.errorRate,
      render: (v: number) => <span className={v >= 0.05 ? 'text-error' : v >= 0.01 ? 'text-warning' : 'text-success'}>{formatErrorRate(v)}</span>,
    },
    {
      title: t('graph.columns.p95'),
      dataIndex: 'p95Seconds',
      width: 100,
      sorter: (a, b) => (a.p95Seconds || 0) - (b.p95Seconds || 0),
      render: (v?: number) => (v == null ? '-' : formatDuration(Math.round(v * 1e6))),
    },
  ];

  return (
    <div className='flex flex-col gap-4'>
      <div className='fc-border rounded-lg bg-fc-100 p-4'>
        <Space wrap>
          <InputGroupWithFormItem label={t('common:datasource.id')}>
            <Select
              showSearch
              optionFilterProp='children'
              style={{ minWidth: 180 }}
              placeholder={t('graph.prom_placeholder')}
              value={datasourceId}
              onChange={(id) => {
                setDatasourceId(id);
                localStorage.setItem(PROM_LS, String(id));
              }}
            >
              {prometheusList.map((ds) => (
                <Select.Option key={ds.id} value={ds.id}>
                  {ds.name}
                </Select.Option>
              ))}
            </Select>
          </InputGroupWithFormItem>
          <TimeRangePicker localKey={RANGE_LS} value={range} onChange={(val) => val && setRange(val)} dateFormat='YYYY-MM-DD HH:mm:ss' />
          <Input
            allowClear
            style={{ width: 200 }}
            placeholder={t('graph.filter_service')}
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
          />
          <Tooltip title={t('graph.refresh')}>
            <Button icon={<ReloadOutlined />} onClick={() => setRefreshKey((k) => k + 1)} />
          </Tooltip>
        </Space>
        <div className='mt-2 text-hint text-sm'>{t('graph.hint')}</div>
      </div>

      <div className='fc-border rounded-lg bg-fc-100 h-[480px]'>
        {datasourceId == null ? (
          <div className='flex h-full items-center justify-center'>
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('graph.no_prometheus')} />
          </div>
        ) : failed ? (
          <div className='flex h-full items-center justify-center'>
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('graph.load_failed')} />
          </div>
        ) : loading && edges.length === 0 ? (
          <div className='flex h-full items-center justify-center'>
            <Spin />
          </div>
        ) : visibleEdges.length === 0 ? (
          <div className='flex h-full items-center justify-center'>
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('graph.empty')} />
          </div>
        ) : (
          <ServiceGraphCanvas
            edges={visibleEdges}
            selectedId={selectedId}
            focusService={focusService}
            onSelectEdge={setSelectedId}
            onSelectService={setFocusService}
          />
        )}
      </div>

      <div className='fc-border rounded-lg bg-fc-100 p-4'>
        <div className='mb-2 text-title text-l1 font-bold'>{t('graph.table_title', { num: visibleEdges.length })}</div>
        <Table
          size='small'
          rowKey={(row) => edgeKey(row.client, row.server, row.connectionType)}
          columns={columns}
          dataSource={visibleEdges}
          loading={loading}
          pagination={visibleEdges.length > 50 ? { pageSize: 50, hideOnSinglePage: true } : false}
          rowClassName={(row) => (edgeKey(row.client, row.server, row.connectionType) === selectedId ? 'bg-fc-200' : '')}
          onRow={(row) => ({
            onClick: () => {
              const id = edgeKey(row.client, row.server, row.connectionType);
              setSelectedId((prev) => (prev === id ? undefined : id));
            },
          })}
        />
      </div>
    </div>
  );
}
