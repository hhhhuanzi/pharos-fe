import React, { useMemo, useState } from 'react';
import { Button, Empty, Space, Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';
import type { Trace } from '@/pages/traceCpt/type';
import { formatDuration } from '@/pages/traceCpt/utils/date';
import { traceToPharosDetail, type PharosSpan } from '../contract';
import { serviceColorVar, uniqueServices } from './colors';
import { focusPath, layoutSpanFlame } from './layout';

const ROW_HEIGHT = 24;
const TICK_COUNT = 5;

interface Props {
  trace: Trace;
}

export default function SpanFlamegraph(props: Props) {
  const { trace } = props;
  const { t } = useTranslation('trace');
  const detail = useMemo(() => traceToPharosDetail(trace), [trace]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);

  const layout = useMemo(() => layoutSpanFlame(detail, focusId), [detail, focusId]);
  const selected = detail.spans.find((span) => span.spanId === selectedId);
  const crumbs = useMemo(() => (focusId ? focusPath(detail.spans, focusId) : []), [detail.spans, focusId]);
  const services = useMemo(() => uniqueServices(layout.rects.map((rect) => rect.span.service)), [layout.rects]);

  const ticks = useMemo(() => {
    return Array.from({ length: TICK_COUNT }, (_, i) => {
      const ratio = i / (TICK_COUNT - 1);
      return { ratio, label: formatDuration(layout.windowDurationUs * ratio) };
    });
  }, [layout.windowDurationUs]);

  const handleSelect = (span: PharosSpan) => {
    setSelectedId(span.spanId);
  };

  const handleFocus = (span: PharosSpan) => {
    setSelectedId(span.spanId);
    setFocusId(span.spanId);
  };

  const resetFocus = () => {
    setFocusId(null);
  };

  if (detail.spans.length === 0) {
    return (
      <div className='p-4'>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('span_flame.empty')} />
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-3 p-4'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex min-w-0 flex-wrap items-center gap-1 text-base text-hint'>
          <button type='button' className='border-0 bg-transparent p-0 text-link' onClick={resetFocus}>
            {t('span_flame.whole_trace')}
          </button>
          {crumbs.map((span) => (
            <React.Fragment key={span.spanId}>
              <span className='text-soft'>/</span>
              <button
                type='button'
                className='max-w-[160px] truncate border-0 bg-transparent p-0 text-link'
                title={`${span.service} ${span.operation}`}
                onClick={() => handleFocus(span)}
              >
                {span.operation || span.spanId}
              </button>
            </React.Fragment>
          ))}
        </div>
        <div className='text-base text-hint'>{t('span_flame.hint')}</div>
      </div>

      <div className='flex gap-4'>
        <div className='min-w-0 flex-1'>
          <div className='relative mb-1 h-4'>
            {ticks.map((tick) => (
              <span
                key={tick.ratio}
                className={`absolute text-xs text-hint ${tick.ratio === 1 ? '-translate-x-full' : ''}`}
                style={{ left: `${tick.ratio * 100}%` }}
              >
                {tick.label}
              </span>
            ))}
          </div>
          <div
            className='relative overflow-hidden rounded-lg bg-fc-50 fc-border'
            style={{ height: Math.max(layout.rowCount, 1) * ROW_HEIGHT + 8 }}
          >
            {layout.rects.map((rect) => {
              const widthPct = Math.max((rect.x1 - rect.x0) * 100, 0.4);
              const isSelected = rect.span.spanId === selectedId;
              const label = `${rect.span.service} ${rect.span.operation}`;
              return (
                <Tooltip key={rect.span.spanId} title={`${label} · ${formatDuration(rect.span.durationUs)}`}>
                  <button
                    type='button'
                    className={`absolute overflow-hidden truncate rounded-sm border-0 px-1 text-left text-xs text-title ${
                      isSelected ? 'ring-2 ring-[var(--fc-fill-primary)]' : ''
                    } ${rect.span.error ? 'shadow-[inset_3px_0_0_var(--fc-fill-error)]' : ''}`}
                    style={{
                      left: `${rect.x0 * 100}%`,
                      width: `${widthPct}%`,
                      top: rect.row * ROW_HEIGHT + 4,
                      height: ROW_HEIGHT - 4,
                      background: `color-mix(in srgb, ${serviceColorVar(rect.span.service)} 42%, transparent)`,
                    }}
                    onClick={() => handleSelect(rect.span)}
                    onDoubleClick={() => handleFocus(rect.span)}
                  >
                    {widthPct > 8 ? label : ''}
                  </button>
                </Tooltip>
              );
            })}
          </div>
        </div>

        {selected && (
          <div className='w-[280px] shrink-0 rounded-lg bg-fc-100 p-4 fc-border'>
            <div className='mb-3 text-l1 font-bold text-title'>{t('span_flame.span_detail')}</div>
            <div className='mb-2 text-base text-hint'>{t('span_flame.service')}</div>
            <div className='mb-3 truncate text-base text-main' title={selected.service}>
              {selected.service}
            </div>
            <div className='mb-2 text-base text-hint'>{t('span_flame.operation')}</div>
            <div className='mb-3 break-all text-base text-main'>{selected.operation || '-'}</div>
            <div className='mb-2 text-base text-hint'>{t('detail.duration')}</div>
            <div className='mb-3 text-base text-main'>{formatDuration(selected.durationUs)}</div>
            <div className='mb-3 text-base'>
              <span className={selected.error ? 'text-error' : 'text-success'}>
                {selected.error ? t('list.status.error') : t('list.status.ok')}
              </span>
            </div>
            <Space>
              <Button size='small' onClick={() => handleFocus(selected)}>
                {t('span_flame.focus_subtree')}
              </Button>
              {focusId && (
                <Button size='small' onClick={resetFocus}>
                  {t('span_flame.reset')}
                </Button>
              )}
            </Space>
          </div>
        )}
      </div>

      {services.length > 0 && (
        <div className='flex flex-wrap gap-3'>
          {services.map((name) => (
            <div key={name} className='flex items-center gap-2 text-base text-hint'>
              <span
                className='inline-block h-2 w-2 rounded-sm'
                style={{ background: serviceColorVar(name) }}
              />
              <span className='truncate' title={name}>
                {name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
