import React from 'react';
import { CloseOutlined } from '@ant-design/icons';

/** Lift the chip above the path midpoint so the stroke runs under the card, not through glyphs. */
const LABEL_GAP_PX = 8;

interface MetricLineProps {
  label: string;
  value: string;
  valueClass: string;
}

function MetricLine(props: MetricLineProps) {
  return (
    <div className='whitespace-nowrap leading-none'>
      <span className='text-hint'>{props.label}</span>
      <span className={`font-medium ${props.valueClass}`}>{props.value}</span>
    </div>
  );
}

/** RED of one call direction. A merged bidirectional edge renders two of these. */
export interface EdgeMetricDirection {
  /** `A → B`; omitted for a one-way edge, where the single arrow already says it. */
  title?: string;
  errorLabel: string;
  errorClass: string;
  qps: string;
  p95: string;
}

export interface EdgeMetricCardProps {
  /** Collapsed badge — the worse direction, matching the stroke color. */
  errorLabel: string;
  errorClass: string;
  errorRateLabel: string;
  qpsLabel: string;
  p95Label: string;
  directions: EdgeMetricDirection[];
  expanded: boolean;
  /** Click-pinned: stays open after the pointer leaves, and offers a close affordance. */
  pinned: boolean;
  closeLabel: string;
  labelX: number;
  labelY: number;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onClick?: (event: React.MouseEvent) => void;
  onClose?: (event: React.MouseEvent) => void;
}

/**
 * Opaque metric chip for a service-graph edge.
 * Parent decides when the chip mounts (non-zero error, 0% on hover, or pinned by a click).
 * Expanded it shows error rate, P95 and window-mean QPS — once per call direction, so a merged
 * bidirectional edge still reports both directions separately.
 */
export default function EdgeMetricCard(props: EdgeMetricCardProps) {
  const { errorLabel, errorClass, errorRateLabel, qpsLabel, p95Label, directions, expanded, pinned, closeLabel } = props;
  const { labelX, labelY, onMouseEnter, onMouseLeave, onClick, onClose } = props;
  return (
    <div
      className={`dh-edge-metric nodrag nopan pointer-events-auto cursor-pointer isolate select-none rounded-lg bg-fc-100 px-2 py-1 text-base fc-border ${
        pinned ? 'dh-edge-metric--pinned' : ''
      }`}
      style={{
        position: 'absolute',
        transform: `translate(-50%, calc(-100% - ${LABEL_GAP_PX}px)) translate(${labelX}px,${labelY}px)`,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
    >
      {expanded ? (
        <div className='relative flex flex-col items-start gap-2 pr-4 text-left'>
          {pinned ? (
            <button type='button' aria-label={closeLabel} title={closeLabel} className='absolute -right-1 -top-1 border-0 bg-transparent p-0 leading-none text-hint' onClick={onClose}>
              <CloseOutlined className='text-xs' />
            </button>
          ) : null}
          {directions.map((direction, index) => (
            <div key={direction.title || index} className='flex flex-col items-start gap-1'>
              {direction.title ? <div className='max-w-[240px] truncate leading-none text-hint'>{direction.title}</div> : null}
              <MetricLine label={errorRateLabel} value={direction.errorLabel} valueClass={direction.errorClass} />
              <MetricLine label={p95Label} value={direction.p95} valueClass='text-title' />
              <MetricLine label={qpsLabel} value={direction.qps} valueClass='text-title' />
            </div>
          ))}
        </div>
      ) : (
        <div className={`whitespace-nowrap font-medium leading-none ${errorClass}`}>{errorLabel}</div>
      )}
    </div>
  );
}
