import { TRACE_LIST_COLUMN_KEYS } from './columnKeys';

describe('TRACE_LIST_COLUMN_KEYS', () => {
  it('locks the instant-query column order (logs last, pinned right)', () => {
    expect(TRACE_LIST_COLUMN_KEYS).toEqual([
      'startTimeUs',
      'traceId',
      'rootInterface',
      'rootType',
      'errorSpanCount',
      'durationUs',
      'spanCount',
      'rootService',
      // 环境紧跟服务：环境是服务的限定语，隔开会让不同环境的同名服务看起来是同一个。
      'envs',
      'logs',
    ]);
  });
});
