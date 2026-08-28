import { isValidTeamName } from '@/dh/serviceTeam/teamName';
import { toScopeSlug } from '@/dh/logPerm/indexPatternScope';

function trimText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export interface BoundTeamInput {
  id?: number;
  name?: string;
}

export type BoundTeamPick = { status: 'none' } | { status: 'many' } | { status: 'one'; name: string };

/** 有且仅有一个所属业务时取其名；0 条 / 多条都不猜。 */
export function pickBoundTeam(teams?: BoundTeamInput[]): BoundTeamPick {
  if (!Array.isArray(teams)) return { status: 'none' };
  const unique: { key: string; name: string }[] = [];
  const seen = new Set<string>();
  for (const item of teams) {
    const name = trimText(item?.name);
    if (!name) continue;
    const id = typeof item.id === 'number' && Number.isFinite(item.id) && item.id > 0 ? item.id : 0;
    const key = id > 0 ? `id:${id}` : `name:${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ key, name });
  }
  if (unique.length === 0) return { status: 'none' };
  if (unique.length > 1) return { status: 'many' };
  return { status: 'one', name: unique[0].name };
}

/** `{所属业务}-{env}*`；缺一端或不合法名称都不猜。env 原样保留大小写。 */
export function buildServiceLogIndexPatternName(team?: string, env?: string): string | undefined {
  const name = trimText(team);
  const environment = trimText(env);
  if (!name || !environment) return undefined;
  if (!isValidTeamName(name)) return undefined;
  return `${name}-${environment}*`;
}

export interface IndexPatternCandidate {
  id?: number;
  name?: string;
  datasource_id?: number;
  time_field?: string;
  allow_hide_system_indices?: boolean;
  hide_system_indices?: boolean;
  cross_cluster_enabled?: boolean | number;
}

/** name 精确优先，否则 `toScopeSlug` 相等（`turms-test*` ↔ `turms-test`）。不用前缀覆盖，避免误选 `turms*`。 */
export function matchIndexPattern<T extends IndexPatternCandidate>(list: T[], indexPatternName: string): T | undefined {
  if (!Array.isArray(list) || !indexPatternName) return undefined;
  const exact = list.find((item) => item.name === indexPatternName);
  if (exact) return exact;
  const targetSlug = toScopeSlug(indexPatternName);
  if (!targetSlug) return undefined;
  return list.find((item) => toScopeSlug(item.name ?? '') === targetSlug);
}
