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
      'logs',
    ]);
  });
});
