import React from 'react';
import { Empty, Spin } from 'antd';
import moment from 'moment';

import { formatEventObject, type K8sEvent } from '@/dh/service';

export const TIMELINE_LIMIT = 30;

function formatEventTime(unix?: number): string {
  if (unix == null || !Number.isFinite(unix) || unix <= 0) return '—';
  return moment.unix(unix).format('YYYY-MM-DD HH:mm:ss');
}

interface Props {
  events: K8sEvent[];
  loading?: boolean;
  emptyDescription: string;
  typeLabel: (type: K8sEvent['type']) => string;
  moreHint?: string;
}

export default function EventTimeline(props: Props) {
  const { events, loading, emptyDescription, typeLabel, moreHint } = props;
  const visible = events.slice(0, TIMELINE_LIMIT);
  const extra = events.length - visible.length;

  return (
    <div className='rounded-lg bg-fc-100 p-4 fc-border'>
      {loading && events.length === 0 ? (
        <div className='flex min-h-[160px] items-center justify-center'>
          <Spin />
        </div>
      ) : visible.length === 0 ? (
        <div className='flex min-h-[160px] items-center justify-center'>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyDescription} />
        </div>
      ) : (
        <div className='flex flex-col'>
          {visible.map((event, index) => {
            const isLast = index === visible.length - 1;
            const object = formatEventObject(event);
            return (
              <div key={event.id} className='flex gap-4'>
                <div className='w-[160px] shrink-0 text-base text-hint'>{formatEventTime(event.lastSeenUnix)}</div>
                <div className='flex w-4 shrink-0 flex-col items-center'>
                  <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${event.type === 'warning' ? 'bg-warning' : 'bg-primary'}`} />
                  {isLast ? null : <div className='w-px flex-1 bg-[var(--fc-border-color)]' />}
                </div>
                <div className={`min-w-0 flex-1 ${isLast ? 'pb-0' : 'pb-4'}`}>
                  <div className='flex flex-wrap items-baseline gap-2'>
                    <span className={event.type === 'warning' ? 'text-warning' : 'text-main'}>{typeLabel(event.type)}</span>
                    <span className='text-base font-medium text-title' title={event.reason}>
                      {event.reason || '—'}
                    </span>
                    <span className='truncate text-base text-hint' title={object}>
                      {object}
                    </span>
                    {event.count > 1 ? <span className='text-base text-soft'>×{event.count}</span> : null}
                  </div>
                  {event.namespace || event.cluster ? (
                    <div className='mt-1 text-sm text-soft'>{[event.namespace, event.cluster].filter(Boolean).join(' · ')}</div>
                  ) : null}
                </div>
              </div>
            );
          })}
          {extra > 0 && moreHint ? <div className='mt-3 text-sm text-hint'>{moreHint}</div> : null}
        </div>
      )}
    </div>
  );
}
