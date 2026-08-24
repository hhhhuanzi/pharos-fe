import { RELEASE_FLAGS } from '@/dh/releaseFlags';

import {
  DEFAULT_DETAIL_TAB,
  DEFAULT_LIST_TAB,
  DEFERRED_DETAIL_TABS,
  DETAIL_TABS,
  isDetailTab,
  isListTab,
  isVisibleDetailTab,
  LIST_TABS,
  PATH,
  PERM,
} from './constants';

describe('service constants', () => {
  it('keeps menu key and permission path identical', () => {
    expect(PATH).toBe('/service');
    expect(PERM).toBe(PATH);
  });

  it('uses overview / topology on the list and the detail IA tabs', () => {
    expect(LIST_TABS).toEqual(['overview', 'topology'] as const);
    expect(DETAIL_TABS).toEqual(['monitoring', 'topology', 'events', 'flamegraph', 'logs', 'traces', 'exceptions'] as const);
    expect(DEFAULT_DETAIL_TAB).toBe('monitoring');
    expect(isListTab(DEFAULT_LIST_TAB)).toBe(true);
    expect(isDetailTab(DEFAULT_DETAIL_TAB)).toBe(true);
    expect(isListTab('events')).toBe(false);
    expect(isDetailTab('overview')).toBe(false);
    expect(DEFERRED_DETAIL_TABS).toEqual(['events', 'flamegraph', 'exceptions'] as const);
    expect(isVisibleDetailTab('monitoring')).toBe(true);
    expect(isVisibleDetailTab('topology')).toBe(true);
    expect(isVisibleDetailTab('logs')).toBe(true);
    expect(isVisibleDetailTab('traces')).toBe(true);
    expect(isVisibleDetailTab('events')).toBe(RELEASE_FLAGS.serviceDeferredTabs);
    expect(isVisibleDetailTab('flamegraph')).toBe(RELEASE_FLAGS.serviceDeferredTabs);
    expect(isVisibleDetailTab('exceptions')).toBe(RELEASE_FLAGS.serviceDeferredTabs);
  });

  it('hides 事件 / 性能火焰图 / 异常堆栈 while the 1.2.0 flag is off', () => {
    expect(RELEASE_FLAGS.serviceDeferredTabs).toBe(false);
    DEFERRED_DETAIL_TABS.forEach((tab) => {
      expect(isVisibleDetailTab(tab)).toBe(false);
    });
  });
});
