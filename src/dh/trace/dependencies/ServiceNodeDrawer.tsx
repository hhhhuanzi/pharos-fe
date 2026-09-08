import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Drawer, Empty, Spin, Table } from 'antd';
import type { ColumnsType } from 'antd/lib/table';
import { useTranslation } from 'react-i18next';
import { errorRateTone } from '@/dh/status';
import { formatDuration } from '@/pages/traceCpt/utils/date';
import { searchTraces } from '../api';
import type { PharosServiceEdge } from '../contract';
import type { TracePluginType } from '../types';
import { formatErrorRatePercent, formatQps } from './graphVisual';
import { neighborRows, type NeighborRow } from './hop';
import { aggregateServiceResources, type ServiceResourceField, type ServiceResourceFieldId } from './servicePeer';
import { PEER_TRACE_LIMIT } from './virtualPeerQuery';

interface Props {
  nodeId?: string;
  edges: PharosServiceEdge[];
  /** Services the current user may see; resource attributes are only queried for these. */
  allowedServices: ReadonlySet<string>;
  dataSourceId?: number;
  pluginType: TracePluginType;
  startMs: number;
  endMs: number;
  rangeSeconds: number;
  onClose: () => void;
}

function fieldLabelKey(id: ServiceResourceFieldId): string {
  return `graph.node.fields.${id}`;
}

export default function ServiceNodeDrawer(props: Props) {
  const { nodeId, edges, allowedServices, dataSourceId, pluginType, startMs, endMs, rangeSeconds, onClose } = props;
  const { t } = useTranslation('trace');
  const [loading, setLoading] = useState(false);
  const [resources, setResources] = useState<ServiceResourceField[]>();
  const [traceCount, setTraceCount] = useState(0);
  const [error, setError] = useState<string>();
  const requestSeq = useRef(0);

  /**
   * The neighbour table comes from already team-filtered edges, so it stays. Resource attributes
   * come from the node's own traces, which only its owners may read — an unknown whitelist keeps
   * them hidden instead of falling back to querying.
   */
  const traceAllowed = Boolean(nodeId) && allowedServices.has(nodeId || '');

  const neighbors = useMemo(() => (nodeId ? neighborRows(nodeId, edges) : []), [nodeId, edges]);
  const upstream = useMemo(() => neighbors.filter((row) => row.direction === 'upstream'), [neighbors]);
  const downstream = useMemo(() => neighbors.filter((row) => row.direction === 'downstream'), [neighbors]);

  const resetLocalState = () => {
    setLoading(false);
    setResources(undefined);
    setTraceCount(0);
    setError(undefined);
  };

  useEffect(() => {
    if (!nodeId || dataSourceId == null || !traceAllowed) {
      setLoading(false);
      setResources(undefined);
      setTraceCount(0);
      setError(undefined);
      return;
    }

    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    setLoading(true);
    setError(undefined);
    setResources(undefined);
    setTraceCount(0);
    searchTraces({
      data_source_id: dataSourceId,
      plugin_type: pluginType,
      service: nodeId,
      start_time_min: startMs,
      start_time_max: endMs,
      num_traces: PEER_TRACE_LIMIT,
      attributes: null,
    })
      .then((traces) => {
        if (requestSeq.current !== seq) return;
        setTraceCount(traces.length);
        setResources(aggregateServiceResources(traces));
      })
      .catch((e: unknown) => {
        if (requestSeq.current !== seq) return;
        setResources(undefined);
        setError(e && typeof e === 'object' && 'message' in e && typeof e.message === 'string' ? e.message : t('graph.node.load_failed'));
      })
      .finally(() => {
        if (requestSeq.current !== seq) return;
        setLoading(false);
      });
  }, [nodeId, dataSourceId, pluginType, startMs, endMs, traceAllowed, t]);

  const handleClose = () => {
    requestSeq.current += 1;
    resetLocalState();
    onClose();
  };

  const neighborColumns: ColumnsType<NeighborRow> = [
    {
      title: t('graph.node.peer'),
      dataIndex: 'name',
      ellipsis: true,
      render: (name: string) => (
        <span className='text-main' title={name}>
          {name}
        </span>
      ),
    },
    {
      title: t('graph.columns.error_rate'),
      dataIndex: 'errorRate',
      width: 80,
      render: (v: number) => <span className={errorRateTone(v)}>{formatErrorRatePercent(v)}</span>,
    },
    {
      title: t('graph.columns.qps'),
      key: 'qps',
      width: 72,
      render: (_: unknown, row) => formatQps(row.requestCount, rangeSeconds),
    },
    {
      title: t('graph.columns.p95'),
      dataIndex: 'p95Seconds',
      width: 80,
      render: (v?: number) => (v == null ? '-' : formatDuration(Math.round(v * 1e6))),
    },
  ];

  return (
    <Drawer title={nodeId ? t('graph.node.title', { name: nodeId }) : undefined} visible={Boolean(nodeId)} onClose={handleClose} width={560} destroyOnClose>
      {nodeId ? (
        <div className='flex flex-col gap-4'>
          <div className='text-base text-hint'>{t('graph.node.hint')}</div>
          {neighbors.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('graph.node.empty_neighbors')} />
          ) : (
            <>
              {upstream.length > 0 ? (
                <div>
                  <div className='mb-3 text-l1 font-bold text-title'>{t('graph.node.upstream')}</div>
                  <Table size='small' rowKey={(row) => `up-${row.name}-${row.connectionType}`} columns={neighborColumns} dataSource={upstream} pagination={false} />
                </div>
              ) : null}
              {downstream.length > 0 ? (
                <div>
                  <div className='mb-3 text-l1 font-bold text-title'>{t('graph.node.downstream')}</div>
                  <Table size='small' rowKey={(row) => `down-${row.name}-${row.connectionType}`} columns={neighborColumns} dataSource={downstream} pagination={false} />
                </div>
              ) : null}
            </>
          )}
          <div>
            <div className='mb-3 text-l1 font-bold text-title'>{t('graph.node.resources')}</div>
            <div className='mb-3 text-base text-hint'>{t('graph.node.resources_hint')}</div>
            {!traceAllowed ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('graph.node.resources_restricted')} />
            ) : dataSourceId == null ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('graph.node.no_jaeger')} />
            ) : error ? (
              <Alert type='error' showIcon message={error} />
            ) : loading ? (
              <div className='flex justify-center py-6'>
                <Spin />
              </div>
            ) : !resources || resources.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('graph.node.resources_empty')} />
            ) : (
              <>
                <div className='mb-3 text-base text-soft'>{t('graph.node.traces_sampled', { traces: traceCount })}</div>
                <div className='flex flex-col gap-3'>
                  {resources.map((row) => (
                    <div key={row.id} className='flex gap-3'>
                      <div className='w-24 shrink-0 text-base text-hint'>{t(fieldLabelKey(row.id))}</div>
                      <div className='min-w-0 flex-1'>
                        <div className='break-all text-base text-main'>{row.values.join(', ')}</div>
                        <div className='text-base text-soft'>{row.sourceKeys.join(' / ')}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </Drawer>
  );
}
