import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useDebounce } from 'ahooks';
import { Button, Empty, Input, Select, Space, Spin, Tooltip } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import TimeRangePicker, { getDefaultValue, IRawTimeRange, timeRangeUnix } from '@/components/TimeRangePicker';
import InputGroupWithFormItem from '@/components/InputGroupWithFormItem';
import { CommonStateContext } from '@/App';
import type { PharosServiceEdge } from '../contract';
import type { TracePluginType } from '../types';
import { edgeKey } from './promql';
import { fetchServiceGraph } from './query';
import { filterOneHopEdges } from './graphVisual';
import { type GraphNodeKind } from './layout';
import { enrichVirtualGraph, type VirtualGraphEnrichment } from './peerType';
import ServiceGraphCanvas from './Graph';
import ServiceNodeDrawer from './ServiceNodeDrawer';
import VirtualPeerDrawer from './VirtualPeerDrawer';
import { fetchPeerMetasForGraph } from './virtualPeerQuery';

const RANGE_LS = 'n9e-dh-service-graph-range';
const PROM_LS = 'n9e-dh-service-graph-prom-id';
const JAEGER_LS = 'n9e-dh-service-jaeger-id';
const EMPTY_METAS = new Map();

function readStoredId(key: string): number | undefined {
  const raw = localStorage.getItem(key);
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function pickDatasourceId(list: Array<{ id: number }>, preferred?: number): number | undefined {
  if (preferred != null && list.some((ds) => ds.id === preferred)) return preferred;
  return list[0]?.id;
}

/**
 * Track B (R-30): service-graph edges with RED, read from Prometheus `traces_service_graph_*`.
 * Official `/trace/dependencies` is a thin mount; this file owns the page body.
 *
 * `focusService` from the parent means detail topology: render a 1-hop subgraph only.
 * The global `/service` page omits it and keeps the full graph.
 */
interface Props {
  focusService?: string;
}

interface SelectedNode {
  id: string;
  kind: GraphNodeKind;
}

export default function ServiceGraphPage(props: Props) {
  const { focusService: oneHopService } = props;
  const { t } = useTranslation('trace');
  const { groupedDatasourceList } = useContext(CommonStateContext);
  const prometheusList = groupedDatasourceList.prometheus || [];
  const jaegerList = groupedDatasourceList.jaeger || [];
  const skywalkingList = groupedDatasourceList.skywalking || [];
  const tracingPlugin: TracePluginType = jaegerList.length > 0 ? 'jaeger' : skywalkingList.length > 0 ? 'skywalking' : 'jaeger';
  const tracingList = tracingPlugin === 'skywalking' ? skywalkingList : jaegerList;

  const [datasourceId, setDatasourceId] = useState<number | undefined>(() => {
    const stored = readStoredId(PROM_LS);
    if (stored && prometheusList.some((ds) => ds.id === stored)) return stored;
    return prometheusList[0]?.id;
  });
  const tracingId = pickDatasourceId(tracingList, tracingPlugin === 'jaeger' ? readStoredId(JAEGER_LS) : undefined);
  const [range, setRange] = useState<IRawTimeRange>(() => getDefaultValue(RANGE_LS, { start: 'now-1h', end: 'now' }) || { start: 'now-1h', end: 'now' });
  const [edges, setEdges] = useState<PharosServiceEdge[]>([]);
  const [rangeSeconds, setRangeSeconds] = useState(3600);
  const [rangeMs, setRangeMs] = useState(() => {
    const { start, end } = timeRangeUnix({ start: 'now-1h', end: 'now' });
    return { start: start * 1000, end: end * 1000 };
  });
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [serviceFilter, setServiceFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string>();
  const [selectedNode, setSelectedNode] = useState<SelectedNode>();
  const [traceEnrichment, setTraceEnrichment] = useState<{ key: string; value: VirtualGraphEnrichment }>();
  const requestSeq = useRef(0);
  const enrichSeq = useRef(0);

  useEffect(() => {
    if (datasourceId != null) return;
    const stored = readStoredId(PROM_LS);
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
        setRangeMs({ start: start * 1000, end: end * 1000 });
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

  const scopedEdges = useMemo(() => (oneHopService ? filterOneHopEdges(edges, oneHopService) : edges), [edges, oneHopService]);
  const scopedKey = useMemo(
    () => scopedEdges.map((edge) => edgeKey(edge.client, edge.server, edge.connectionType)).sort().join('\n'),
    [scopedEdges],
  );
  const namedEnrichment = useMemo(() => enrichVirtualGraph(scopedEdges, EMPTY_METAS), [scopedEdges]);

  useEffect(() => {
    if (tracingId == null || scopedEdges.length === 0) return;

    const seq = enrichSeq.current + 1;
    enrichSeq.current = seq;
    const key = scopedKey;
    fetchPeerMetasForGraph({
      dataSourceId: tracingId,
      pluginType: tracingPlugin,
      edges: scopedEdges,
      startMs: rangeMs.start,
      endMs: rangeMs.end,
    })
      .then((metas) => {
        if (enrichSeq.current !== seq) return;
        setTraceEnrichment({ key, value: enrichVirtualGraph(scopedEdges, metas) });
      })
      .catch(() => {
        if (enrichSeq.current !== seq) return;
      });
  }, [scopedEdges, scopedKey, tracingId, tracingPlugin, rangeMs.start, rangeMs.end]);

  const enrichment = traceEnrichment?.key === scopedKey ? traceEnrichment.value : namedEnrichment;
  const displayEdges = enrichment.edges;
  const nodeLabels = enrichment.labels;
  const nodeSubtitles = enrichment.subtitles;
  const nodeGlyphs = enrichment.glyphs;

  // Each new edge set re-runs dagre (up to 6 passes on the global graph), so the keystroke
  // itself must not drive the relayout — the raw value stays on the input for responsiveness.
  const appliedFilter = useDebounce(serviceFilter, { wait: 300 });

  const visibleEdges = useMemo(() => {
    const q = appliedFilter.trim().toLowerCase();
    if (!q) return displayEdges;
    return displayEdges.filter((edge) => {
      const clientLabel = (nodeLabels?.[edge.client] || edge.client).toLowerCase();
      const serverLabel = (nodeLabels?.[edge.server] || edge.server).toLowerCase();
      const clientSub = (nodeSubtitles?.[edge.client] || '').toLowerCase();
      const serverSub = (nodeSubtitles?.[edge.server] || '').toLowerCase();
      return (
        edge.client.toLowerCase().includes(q) ||
        edge.server.toLowerCase().includes(q) ||
        clientLabel.includes(q) ||
        serverLabel.includes(q) ||
        clientSub.includes(q) ||
        serverSub.includes(q)
      );
    });
  }, [displayEdges, appliedFilter, nodeLabels, nodeSubtitles]);

  /** Clicking an edge pins its metric chip; clicking it again (or the canvas) releases it. */
  const handleSelectEdge = (id: string | undefined) => {
    setSelectedId((current) => (id && current !== id ? id : undefined));
    setSelectedNode(undefined);
  };

  const handleSelectNode = (id: string | undefined, kind?: GraphNodeKind) => {
    if (!id || !kind) {
      setSelectedNode(undefined);
      return;
    }
    setSelectedNode({ id, kind });
    setSelectedId(undefined);
  };

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

      {/* The call-detail table used to sit below; give the freed space to the canvas. The floor
          stays under the space a short window actually leaves, so the canvas never pushes the page
          into a scrollbar — scrolling belongs to the graph, not to the page around it. */}
      <div className='fc-border overflow-hidden rounded-lg bg-fc-50 h-[calc(100vh-300px)] min-h-[420px]'>
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
            rangeSeconds={rangeSeconds}
            selectedId={selectedId}
            selectedNode={selectedNode?.id}
            nodeLabels={nodeLabels}
            nodeSubtitles={nodeSubtitles}
            nodeGlyphs={nodeGlyphs}
            focusService={oneHopService}
            onSelectEdge={handleSelectEdge}
            onSelectNode={handleSelectNode}
          />
        )}
      </div>

      <VirtualPeerDrawer
        nodeId={selectedNode?.kind === 'virtual' ? selectedNode.id : undefined}
        displayName={
          selectedNode
            ? [nodeLabels?.[selectedNode.id], nodeSubtitles?.[selectedNode.id]].filter(Boolean).join(' · ') || selectedNode.id
            : undefined
        }
        edges={displayEdges}
        dataSourceId={tracingId}
        pluginType={tracingPlugin}
        startMs={rangeMs.start}
        endMs={rangeMs.end}
        onClose={() => setSelectedNode(undefined)}
      />
      <ServiceNodeDrawer
        nodeId={selectedNode?.kind === 'service' ? selectedNode.id : undefined}
        edges={displayEdges}
        dataSourceId={tracingId}
        pluginType={tracingPlugin}
        startMs={rangeMs.start}
        endMs={rangeMs.end}
        rangeSeconds={rangeSeconds}
        onClose={() => setSelectedNode(undefined)}
      />
    </div>
  );
}
