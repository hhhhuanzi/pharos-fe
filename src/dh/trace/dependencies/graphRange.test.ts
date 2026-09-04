import { GRAPH_FIXED_RANGE } from './graphRange';

describe('GRAPH_FIXED_RANGE', () => {
  it('is the last hour', () => {
    expect(GRAPH_FIXED_RANGE).toEqual({ start: 'now-1h', end: 'now' });
  });
});
