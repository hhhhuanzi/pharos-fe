import React from 'react';
import { Divider, Space, Tag } from 'antd';
import { Trace } from '../../type';
import { getTraceName } from '../../utils';
import { getPercentageOfDuration, formatRelativeDate } from '../../utils/date';
import colorGenerator from '../../utils/color-generator';
import moment from 'moment-timezone';
import Title from './title';
import '../../index.less';

// 链路时间统一按东八区（Asia/Shanghai）24 小时制展示，避免 UTC 与 12 小时制歧义
const TRACE_TIME_ZONE = 'Asia/Shanghai';
const TRACE_TIME_FORMAT = 'HH:mm:ss';

type Props = {
  trace: Trace;
  maxTraceDuration: number;
  onClick: (v: Trace) => void;
};

export default function ResultItem(props: Props) {
  const { trace, maxTraceDuration, onClick } = props;
  // @ts-ignore
  // Lightweight (e.g. SkyWalking list) traces carry no spans; fall back to the precomputed traceName.
  const traceName = getTraceName(trace.spans, trace.processes) || trace.traceName;
  const mDate = moment(trace.startTime / 1000).tz(TRACE_TIME_ZONE);
  const timeStr = mDate.format(TRACE_TIME_FORMAT);
  const fromNow = mDate.fromNow();

  return (
    <div className={`tracing-search-result-item ${trace.hasError ? 'is-error' : ''}`} onClick={() => onClick(trace)}>
      <Title traceName={traceName} duration={trace.duration} traceID={trace.traceID} durationPercent={getPercentageOfDuration(trace.duration, maxTraceDuration)} />
      <div className='tracing-search-result-item-content'>
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
          {trace.spans.length > 0 && (
            <Tag style={{ marginRight: 40 }}>
              {trace.spans.length} {trace.spans.length > 1 ? 'Spans' : 'Span'}
            </Tag>
          )}
          {trace.hasError && (
            <Tag color='error' style={{ marginRight: 40 }}>
              Error
            </Tag>
          )}
          <Space wrap={true}>
            {trace.services.map(({ name, numberOfSpans }) => (
              <Tag className='service-tag' style={{ borderLeftColor: colorGenerator.getColorByKey(name) }} key={name}>
                {name} {numberOfSpans}
              </Tag>
            ))}
          </Space>
        </div>
        <div style={{ flexShrink: 0 }}>
          <div style={{ marginBottom: 8 }}>
            {formatRelativeDate(mDate)}
            <Divider type='vertical' />
            {timeStr}
          </div>
          <small>{fromNow}</small>
        </div>
      </div>
    </div>
  );
}
