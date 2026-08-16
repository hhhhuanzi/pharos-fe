import { DEFAULT_DETAIL_TAB, DEFAULT_LIST_TAB, DETAIL_TABS, isDetailTab, isListTab, LIST_TABS, PATH, PERM } from './constants';

describe('service constants', () => {
  it('keeps menu key and permission path identical', () => {
    expect(PATH).toBe('/service');
    expect(PERM).toBe(PATH);
  });

  it('uses overview / topology on the list and four detail tabs', () => {
    expect(LIST_TABS).toEqual(['overview', 'topology'] as const);
    expect(DETAIL_TABS).toEqual(['topology', 'events', 'flamegraph', 'exceptions'] as const);
    expect(isListTab(DEFAULT_LIST_TAB)).toBe(true);
    expect(isDetailTab(DEFAULT_DETAIL_TAB)).toBe(true);
    expect(isListTab('events')).toBe(false);
    expect(isDetailTab('overview')).toBe(false);
  });
});
