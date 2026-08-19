// Copyright (c) 2017 Uber Technologies, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import * as React from 'react';
import SpanRowSemantics from '@/dh/trace/waterfall/SpanRowSemantics';
import TimelineRow from './TimelineRow';
import { ViewedBoundsFunctionType } from '../../utils';
import { formatDuration } from '../../utils/date';
import SpanTreeOffset from './SpanTreeOffset';
import SpanBar from './SpanBar';
import Ticks from './Ticks';
import { TNil } from '../../type';
import { TraceSpan } from '../../type';
import './SpanBarRow.css';

type SpanBarRowProps = {
  className?: string;
  color: string;
  columnDivision: number;
  isChildrenExpanded: boolean;
  isDetailExpanded: boolean;
  isMatchingFilter: boolean;
  onDetailToggled: (spanID: string) => void;
  onChildrenToggled: (spanID: string) => void;
  numTicks: number;
  rpc?:
    | {
        viewStart: number;
        viewEnd: number;
        color: string;
        operationName: string;
        serviceName: string;
      }
    | TNil;
  noInstrumentedServer?:
    | {
        color: string;
        serviceName: string;
      }
    | TNil;
  showErrorIcon: boolean;
  getViewedBounds: ViewedBoundsFunctionType;
  traceStartTime: number;
  span: TraceSpan;
  focusSpan: (spanID: string) => void;
};

/**
 * This was originally a stateless function, but changing to a PureComponent
 * reduced the render time of expanding a span row detail by ~50%. This is
 * even true in the case where the stateless function has the same prop types as
 * this class and arrow functions are created in the stateless function as
 * handlers to the onClick props. E.g. for now, the PureComponent is more
 * performance than the stateless function.
 */
export default class SpanBarRow extends React.PureComponent<SpanBarRowProps> {
  static defaultProps = {
    className: '',
    rpc: null,
  };

  _detailToggle = () => {
    this.props.onDetailToggled(this.props.span.spanID);
  };

  _childrenToggle = () => {
    this.props.onChildrenToggled(this.props.span.spanID);
  };

  render() {
    const {
      className,
      color,
      columnDivision,
      isChildrenExpanded,
      isDetailExpanded,
      isMatchingFilter,
      numTicks,
      rpc,
      noInstrumentedServer,
      showErrorIcon,
      getViewedBounds,
      traceStartTime,
      span,
      focusSpan,
    } = this.props;
    const isParent = span.hasChildren;
    const operationName = span.operationName;
    const serviceName = span.process.serviceName;
    const duration = span.duration;
    const label = formatDuration(duration);
    const viewBounds = getViewedBounds(span.startTime, span.startTime + span.duration);
    const viewStart = viewBounds.start;
    const viewEnd = viewBounds.end;

    const labelDetail = `${serviceName}::${operationName}`;
    let longLabel;
    let hintSide;
    if (viewStart > 1 - viewEnd) {
      longLabel = `${labelDetail} | ${label}`;
      hintSide = 'left';
    } else {
      longLabel = `${label} | ${labelDetail}`;
      hintSide = 'right';
    }

    return (
      <TimelineRow
        className={`
          span-row
          ${className || ''}
          ${isDetailExpanded ? 'is-expanded' : ''}
          ${isMatchingFilter ? 'is-matching-filter' : ''}
        `}
      >
        <TimelineRow.Cell className='span-name-column' width={columnDivision}>
          <div className={`span-name-wrapper ${isMatchingFilter ? 'is-matching-filter' : ''}`}>
            <SpanTreeOffset childrenVisible={isChildrenExpanded} span={span} onClick={isParent ? this._childrenToggle : undefined} />
            <a
              className={`span-name flex min-w-0 items-center ${isDetailExpanded ? 'is-detail-expanded' : ''}`}
              aria-checked={isDetailExpanded}
              onClick={this._detailToggle}
              role='switch'
              style={{ borderColor: color }}
              tabIndex={0}
            >
              <SpanRowSemantics
                span={span}
                showError={showErrorIcon}
                isChildrenCollapsed={isParent && !isChildrenExpanded}
                rpc={rpc}
                noInstrumentedServer={noInstrumentedServer}
              />
            </a>
            {/* {span.references && span.references.length > 1 && (
              <ReferencesButton references={span.references} tooltipText='Contains multiple references' focusSpan={focusSpan}>
                <IoNetwork />
              </ReferencesButton>
            )}
            {span.subsidiarilyReferencedBy && span.subsidiarilyReferencedBy.length > 0 && (
              <ReferencesButton
                references={span.subsidiarilyReferencedBy}
                tooltipText={`This span is referenced by ${span.subsidiarilyReferencedBy.length === 1 ? 'another span' : 'multiple other spans'}`}
                focusSpan={focusSpan}
              >
                <MdFileUpload />
              </ReferencesButton>
            )} */}
          </div>
        </TimelineRow.Cell>
        <TimelineRow.Cell className='span-view' style={{ cursor: 'pointer' }} width={1 - columnDivision} onClick={this._detailToggle}>
          <Ticks numTicks={numTicks} />
          <SpanBar
            viewStart={viewStart}
            viewEnd={viewEnd}
            color={color}
            shortLabel={label}
            longLabel={longLabel}
            hintSide={hintSide}
            label={label}
            setLongLabel={() => {}}
            setShortLabel={() => {}}
          />
        </TimelineRow.Cell>
      </TimelineRow>
    );
  }
}
