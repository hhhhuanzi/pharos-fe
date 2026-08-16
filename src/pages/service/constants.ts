export const NS = 'service';
export const PATH = '/service';
export const PERM = PATH;

export const LIST_TABS = ['overview', 'topology'] as const;
export type ListTab = (typeof LIST_TABS)[number];
export const DEFAULT_LIST_TAB: ListTab = 'overview';

export const DETAIL_TABS = ['topology', 'events', 'flamegraph', 'exceptions'] as const;
export type DetailTab = (typeof DETAIL_TABS)[number];
export const DEFAULT_DETAIL_TAB: DetailTab = 'topology';

export function isListTab(value: unknown): value is ListTab {
  return typeof value === 'string' && (LIST_TABS as readonly string[]).includes(value);
}

export function isDetailTab(value: unknown): value is DetailTab {
  return typeof value === 'string' && (DETAIL_TABS as readonly string[]).includes(value);
}
