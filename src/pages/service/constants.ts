import { RELEASE_FLAGS } from '@/dh/releaseFlags';

export const NS = 'service';
export const PATH = '/service';
export const PERM = PATH;

export const LIST_TABS = ['overview', 'topology'] as const;
export type ListTab = (typeof LIST_TABS)[number];
export const DEFAULT_LIST_TAB: ListTab = 'overview';

export const DETAIL_TABS = ['monitoring', 'topology', 'events', 'flamegraph', 'logs', 'traces', 'exceptions'] as const;
export type DetailTab = (typeof DETAIL_TABS)[number];
export const DEFAULT_DETAIL_TAB: DetailTab = 'monitoring';

/** 1.2.0 隐藏、1.3.0 随 `RELEASE_FLAGS.serviceDeferredTabs` 打开。勿从 DETAIL_TABS 删除。 */
export const DEFERRED_DETAIL_TABS = ['events', 'flamegraph', 'exceptions'] as const;
export type DeferredDetailTab = (typeof DEFERRED_DETAIL_TABS)[number];

export function isListTab(value: unknown): value is ListTab {
  return typeof value === 'string' && (LIST_TABS as readonly string[]).includes(value);
}

export function isDetailTab(value: unknown): value is DetailTab {
  return typeof value === 'string' && (DETAIL_TABS as readonly string[]).includes(value);
}

export function isDeferredDetailTab(value: unknown): value is DeferredDetailTab {
  return typeof value === 'string' && (DEFERRED_DETAIL_TABS as readonly string[]).includes(value);
}

export function isVisibleDetailTab(value: unknown): value is DetailTab {
  return isDetailTab(value) && (RELEASE_FLAGS.serviceDeferredTabs || !isDeferredDetailTab(value));
}
