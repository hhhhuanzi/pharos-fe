import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Collapse, Drawer, Empty, Spin, Table } from 'antd';
import type { ColumnsType } from 'antd/lib/table';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { buildTraceDeepLink } from '@/dh/logTrace';
import type { PharosServiceEdge } from '../contract';
import type { TracePluginType } from '../types';
import { adjacentClients } from './hop';
import type { CuratedPeerFieldId, PeerAttrRow, PeerInstance } from './virtualPeer';
import { formatPeerInstance } from './virtualPeer';
import { instanceTypeLabel } from './wellKnownPorts';
import { fetchVirtualPeerMeta, type VirtualPeerQueryResult } from './virtualPeerQuery';

interface Props {
  nodeId?: string;
  displayName?: string;
  edges: PharosServiceEdge[];
  dataSourceId?: number;
  pluginType: TracePluginType;
  startMs: number;
  endMs: number;
  onClose: () => void;
}

function fieldLabelKey(id: CuratedPeerFieldId): string {
  return `graph.virtual.fields.${id}`;
}

export default function VirtualPeerDrawer(props: Props) {
  const { nodeId, displayName, edges, dataSourceId, pluginType, startMs, endMs, onClose } = props;
  const titleName = displayName || nodeId;
  const { t } = useTranslation('trace');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VirtualPeerQueryResult>();
  const [error, setError] = useState<string>();
  const requestSeq = useRef(0);

  const clients = useMemo(() => (nodeId ? adjacentClients(nodeId, edges) : []), [nodeId, edges]);
  const clientKey = clients.join('\n');
  const siblingKey = useMemo(
    () =>
      edges
        .filter((edge) => edge.connectionType === 'database')
        .map((edge) => edge.server)
        .sort()
        .join('\n'),
    [edges],
  );

  const resetLocalState = () => {
    setLoading(false);
    setResult(undefined);
    setError(undefined);
  };

  useEffect(() => {
    if (!nodeId || dataSourceId == null || clients.length === 0) {
      setLoading(false);
      setResult(undefined);
      setError(undefined);
      return;
    }

    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    setLoading(true);
    setError(undefined);
    setResult(undefined);
    fetchVirtualPeerMeta({
      dataSourceId,
      pluginType,
      clients,
      nodeName: nodeId,
      edges,
      startMs,
      endMs,
    })
      .then((next) => {
        if (requestSeq.current !== seq) return;
        setResult(next);
      })
      .catch((e: unknown) => {
        if (requestSeq.current !== seq) return;
        setResult(undefined);
        setError(e && typeof e === 'object' && 'message' in e && typeof e.message === 'string' ? e.message : t('graph.virtual.load_failed'));
      })
      .finally(() => {
        if (requestSeq.current !== seq) return;
        setLoading(false);
      });
  }, [nodeId, dataSourceId, pluginType, startMs, endMs, clientKey, siblingKey, t]);

  const handleClose = () => {
    requestSeq.current += 1;
    resetLocalState();
    onClose();
  };

  const instanceColumns: ColumnsType<PeerInstance> = [
    {
      title: t('graph.virtual.instance'),
      key: 'instance',
      render: (_: unknown, row: PeerInstance) => {
        const text = formatPeerInstance(row);
        return (
          <span className='break-all text-main' title={text}>
            {text}
          </span>
        );
      },
    },
    {
      title: t('graph.virtual.instance_type'),
      key: 'type',
      width: 128,
      render: (_: unknown, row: PeerInstance) => {
        const text = instanceTypeLabel(row);
        return (
          <span className='truncate text-hint' title={text || undefined}>
            {text || '-'}
          </span>
        );
      },
    },
    {
      title: t('graph.virtual.span_count'),
      dataIndex: 'spanCount',
      width: 88,
    },
    {
      title: t('graph.virtual.source_keys'),
      key: 'source',
      render: (_: unknown, row: PeerInstance) => {
        const keys = [...row.addressKeys, ...row.portKeys];
        const text = keys.join(' / ');
        return (
          <span className='break-all text-hint' title={text}>
            {text}
          </span>
        );
      },
    },
  ];

  const extraColumns: ColumnsType<PeerAttrRow> = [
    {
      title: t('graph.virtual.key'),
      dataIndex: 'key',
      width: 220,
      ellipsis: true,
      render: (key: string) => (
        <span className='text-hint' title={key}>
          {key}
        </span>
      ),
    },
    {
      title: t('graph.virtual.values'),
      dataIndex: 'values',
      render: (values: string[]) => {
        const text = values.join(', ');
        return (
          <span className='break-all text-main' title={text}>
            {text}
          </span>
        );
      },
    },
  ];

  const emptyDescription = (() => {
    if (dataSourceId == null) return t('graph.virtual.no_jaeger');
    if (clients.length === 0) return t('graph.virtual.no_client');
    if (error) return error;
    return t('graph.virtual.empty_spans');
  })();

  return (
    <Drawer title={titleName ? t('graph.virtual.title', { name: titleName }) : undefined} visible={Boolean(nodeId)} onClose={handleClose} width={560} destroyOnClose>
      {nodeId ? (
        <div className='flex flex-col gap-4'>
          {clients.length > 0 ? (
            <div className='text-base text-main'>
              {t('graph.virtual.clients')}: {clients.slice(0, 8).join(', ')}
              {result && result.skippedClients.length > 0 ? ` · ${t('graph.virtual.clients_capped', { num: result.queriedClients.length })}` : null}
            </div>
          ) : null}
          {nodeId?.trim().toLowerCase() === 'unknown' ? <div className='text-base text-soft'>{t('graph.virtual.unknown_bucket_note')}</div> : null}
          {result?.clientErrors.length ? (
            <Alert
              type='warning'
              showIcon
              message={t('graph.virtual.query_failed_clients', { names: result.clientErrors.map((item) => item.client).join(', ') })}
            />
          ) : null}
          {error ? <Alert type='error' showIcon message={error} /> : null}
          {loading ? (
            <div className='flex justify-center py-6'>
              <Spin />
            </div>
          ) : (
            <>
              {result ? (
                <>
                  <div className='text-base text-hint'>
                    {t('graph.virtual.traces_sampled', { traces: result.fetchedTraceCount, spans: result.matchedSpans.length })}
                    {result.truncated ? ` · ${t('graph.virtual.traces_truncated')}` : null}
                  </div>
                  <div className='text-base text-soft'>{t('graph.virtual.traces_sampled_note')}</div>
                </>
              ) : null}
              {!result || result.matchedSpans.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyDescription} />
              ) : (
                <>
                  {result.instances.length > 0 ? (
                    <div>
                      <div className='mb-3 text-l1 font-bold text-title'>{t('graph.virtual.instances')}</div>
                      <Table size='small' rowKey={(row) => `${row.address}:${row.port}`} columns={instanceColumns} dataSource={result.instances} pagination={false} />
                    </div>
                  ) : null}
                  {result.curated.length > 0 ? (
                    <div>
                      <div className='mb-3 text-l1 font-bold text-title'>{t('graph.virtual.curated')}</div>
                      <div className='flex flex-col gap-3'>
                        {result.curated.map((row) => (
                          <div key={row.id} className='flex gap-3'>
                            <div className='w-24 shrink-0 text-base text-hint'>{t(fieldLabelKey(row.id))}</div>
                            <div className='min-w-0 flex-1'>
                              <div className='break-all text-base text-main'>{row.values.join(', ')}</div>
                              <div className='text-base text-soft'>{row.sourceKeys.join(' / ')}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {result.missing.length > 0 ? (
                    <Collapse ghost>
                      <Collapse.Panel header={`${t('graph.virtual.missing_section')} (${result.missing.length})`} key='missing'>
                        <ul className='m-0 flex list-none flex-col gap-2 p-0'>
                          {result.missing.map((row) => (
                            <li key={row.id} className='text-base text-hint'>
                              {t(fieldLabelKey(row.id))}
                              <span className='ml-2 text-soft'>{row.keys.join(' / ')}</span>
                            </li>
                          ))}
                        </ul>
                      </Collapse.Panel>
                    </Collapse>
                  ) : null}
                  {result.extraRows.length > 0 ? (
                    <Collapse ghost>
                      <Collapse.Panel header={`${t('graph.virtual.more')} (${result.extraRows.length})`} key='more'>
                        <Table size='small' rowKey='key' columns={extraColumns} dataSource={result.extraRows} pagination={false} />
                      </Collapse.Panel>
                    </Collapse>
                  ) : null}
                  {dataSourceId != null ? (
                    <div>
                      <div className='mb-3 text-l1 font-bold text-title'>{t('graph.virtual.sample_traces')}</div>
                      <ul className='m-0 flex list-none flex-col gap-1 p-0'>
                        {result.matchedSpans.slice(0, 8).map((span) => (
                          <li key={`${span.traceId}:${span.spanId}`} className='truncate text-base'>
                            <Link to={buildTraceDeepLink({ traceId: span.traceId, datasourceId: dataSourceId, pluginType })}>{span.traceId}</Link>
                            <span className='ml-2 text-hint' title={span.operation}>
                              {span.operation}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </>
              )}
            </>
          )}
        </div>
      ) : null}
    </Drawer>
  );
}
