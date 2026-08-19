import { TRACE_SEARCH_DEFAULT_LIMIT, TRACE_SEARCH_DEFAULT_RANGE, TRACE_SEARCH_MAX_LIMIT, resolveNumTraces } from './searchDefaults';

describe('TRACE_SEARCH_DEFAULT_RANGE', () => {
  it('defaults to the last 15 minutes', () => {
    expect(TRACE_SEARCH_DEFAULT_RANGE).toEqual({ start: 'now-15m', end: 'now' });
  });
});

describe('resolveNumTraces', () => {
  it('defaults empty / invalid values to 100', () => {
    expect(TRACE_SEARCH_DEFAULT_LIMIT).toBe(100);
    expect(TRACE_SEARCH_MAX_LIMIT).toBe(2000);
    expect(resolveNumTraces(undefined)).toBe(100);
    expect(resolveNumTraces(null)).toBe(100);
    expect(resolveNumTraces('')).toBe(100);
    expect(resolveNumTraces('abc')).toBe(100);
    expect(resolveNumTraces(0)).toBe(100);
    expect(resolveNumTraces(-1)).toBe(100);
  });

  it('keeps a filled positive count (max is enforced by the form, not here)', () => {
    expect(resolveNumTraces(50)).toBe(50);
    expect(resolveNumTraces('200')).toBe(200);
    expect(resolveNumTraces(2001)).toBe(2001);
  });
});
