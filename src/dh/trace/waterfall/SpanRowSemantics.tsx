import React from 'react';
import { Tag } from 'antd';
import { ArrowLeftRight, CircleAlert, Database, Globe, HardDrive, MessageSquare, Settings, type LucideIcon } from 'lucide-react';
import type { TNil, TraceSpan } from '@/pages/traceCpt/type';
import { resolveDisplayedSpanKind } from '../listType';
import { resolveSpanPills, type SpanKindIcon, type SpanPill } from '../spanSemantics';

const KIND_ICON: Record<Exclude<SpanKindIcon, 'internal'>, LucideIcon> = {
  web: Globe,
  db: Database,
  cache: HardDrive,
  messaging: MessageSquare,
  rpc: ArrowLeftRight,
  nacos: Settings,
};

const KIND_TITLE: Record<Exclude<SpanKindIcon, 'internal'>, string> = {
  web: 'http',
  db: 'db',
  cache: 'cache',
  messaging: 'messaging',
  rpc: 'rpc',
  nacos: 'nacos',
};

const PILL_CLASS =
  'm-0 mr-0 h-4 max-w-20 truncate rounded-full px-1 text-xs leading-4 border-[var(--fc-border-color)] bg-fc-200 text-hint';
const ERROR_PILL_CLASS =
  'm-0 mr-0 h-4 max-w-20 truncate rounded-full px-1 text-xs leading-4 border-[var(--fc-fill-error)] bg-error/15 text-error';

interface RpcHint {
  color: string;
  serviceName: string;
  operationName: string;
}

interface NoInstrumentedHint {
  color: string;
  serviceName: string;
}

interface Props {
  span: Pick<TraceSpan, 'tags' | 'operationName' | 'process'>;
  showError: boolean;
  isChildrenCollapsed: boolean;
  rpc?: RpcHint | TNil;
  noInstrumentedServer?: NoInstrumentedHint | TNil;
}

function SpanKindIconView(props: { kind: SpanKindIcon }) {
  const { kind } = props;
  if (kind === 'internal') return null;
  const Icon = KIND_ICON[kind];
  return (
    <span className='inline-flex shrink-0' title={KIND_TITLE[kind]}>
      <Icon className='h-4 w-4 text-soft' strokeWidth={2} aria-hidden />
    </span>
  );
}

function SpanPillView(props: { pill: SpanPill }) {
  const { pill } = props;
  return (
    <Tag className={pill.tone === 'error' ? ERROR_PILL_CLASS : PILL_CLASS} title={pill.key}>
      {pill.value}
    </Tag>
  );
}

/**
 * Waterfall row label: kind icon + error badge + service/operation + semantic pills.
 * Official SpanBarRow only mounts this; tree indent and duration bar stay upstream.
 */
export default function SpanRowSemantics(props: Props) {
  const { span, showError, isChildrenCollapsed, rpc, noInstrumentedServer } = props;
  const kind = resolveDisplayedSpanKind(span.tags, span.operationName);
  const pills = resolveSpanPills(span.tags);
  const serviceName = span.process.serviceName;
  const operationName = rpc ? rpc.operationName : span.operationName;
  const hasErrorStatusPill = pills.some((pill) => pill.key === 'http.status_code' && pill.tone === 'error');

  return (
    <span className='inline-flex min-w-0 max-w-full flex-nowrap items-center gap-1 overflow-hidden'>
      <SpanKindIconView kind={kind} />
      {showError && (
        <span className='SpanBarRow--errorIcon inline-flex shrink-0 items-center justify-center' title='error'>
          <CircleAlert className='h-3 w-3' strokeWidth={2.5} aria-hidden />
        </span>
      )}
      <span
        className={`span-svc-name min-w-0 truncate pl-1 ${isChildrenCollapsed ? 'is-children-collapsed' : ''} ${
          showError ? 'text-error' : ''
        }`}
      >
        {serviceName}{' '}
        {rpc && (
          <span>
            <i className='SpanBarRow--rpcColorMarker' style={{ background: rpc.color }} />
            {rpc.serviceName}
          </span>
        )}
        {noInstrumentedServer && (
          <span>
            <i className='SpanBarRow--rpcColorMarker' style={{ background: noInstrumentedServer.color }} />
            {noInstrumentedServer.serviceName}
          </span>
        )}
      </span>
      <small className='endpoint-name min-w-0 truncate'>{operationName}</small>
      {pills.length > 0 && (
        <span className='flex shrink-0 items-center gap-1'>
          {pills.map((pill) => (
            <SpanPillView key={pill.key} pill={pill} />
          ))}
        </span>
      )}
      {showError && !hasErrorStatusPill && (
        <Tag className={ERROR_PILL_CLASS} title='error'>
          error
        </Tag>
      )}
    </span>
  );
}
