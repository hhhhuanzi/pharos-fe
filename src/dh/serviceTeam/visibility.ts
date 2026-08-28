import type { ServiceRow } from '@/dh/service';

import type { NamedTeam, ServiceTeamFilterResult, ServiceTeamItem, ServiceTeamMeta } from './types';

/** 与 BE IsOpsRole / CanViewAll 对齐，仅在 filter/check API 不可用时作回退。 */
export function localCanViewAll(profile?: { admin?: boolean; roles?: string[] }): boolean {
  if (profile?.admin === true) return true;
  const rawRoles = profile?.roles;
  const roles = Array.isArray(rawRoles) ? rawRoles : [];
  return roles.some((raw) => {
    const n = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    return n === 'sre' || n === '运维';
  });
}

/** 与 BE CanManage 对齐：Admin / SRE / 运维 / `/service/manage`。 */
export function localCanManage(profile?: { admin?: boolean; roles?: string[] }, perms?: string[]): boolean {
  if (localCanViewAll(profile)) return true;
  return Array.isArray(perms) && perms.includes('/service/manage');
}

/** 把 visibility / user-groups 的团队列表收成下拉选项。Admin 必须能看到全量，不能只靠「我加入的组」。 */
export function parseNamedTeams(raw: unknown): NamedTeam[] {
  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw && typeof raw === 'object' && 'dat' in raw && Array.isArray((raw as { dat: unknown }).dat)) {
    list = (raw as { dat: unknown[] }).dat;
  }
  const out: NamedTeam[] = [];
  list.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const rec = item as { id?: unknown; name?: unknown };
    const id = typeof rec.id === 'number' ? rec.id : Number(rec.id);
    const name = typeof rec.name === 'string' ? rec.name.trim() : '';
    if (!Number.isFinite(id) || id <= 0 || !name) return;
    out.push({ id, name });
  });
  return out;
}

export function teamsFromItem(item: ServiceTeamItem): NamedTeam[] {
  const fromList = parseNamedTeams(item.user_groups);
  if (fromList.length > 0) return fromList;
  const id = item.user_group_id;
  const name = typeof item.user_group_name === 'string' ? item.user_group_name.trim() : '';
  if (typeof id === 'number' && id > 0) {
    return [{ id, name: name || String(id) }];
  }
  return [];
}

function mergeTeams(target: NamedTeam[], extra: NamedTeam[]): NamedTeam[] {
  const seen = new Set(target.map((item) => item.id));
  const out = target.slice();
  extra.forEach((item) => {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    out.push(item);
  });
  return out;
}

/** 新路由未生效时 center 用 index.html 兜底，umi-request 会抛 Unexpected token '<'。 */
export function isServiceTeamApiUnavailable(err: unknown): boolean {
  const rec = err && typeof err === 'object' ? (err as { message?: unknown; status?: number; response?: { status?: number } }) : undefined;
  const status = rec?.response?.status ?? rec?.status;
  if (status === 404) return true;
  const msg = typeof rec?.message === 'string' ? rec.message : err instanceof Error ? err.message : '';
  return /Unexpected token\s+'<'/i.test(msg) || /is not valid JSON/i.test(msg) || /<!/.test(msg);
}

export function emptyServiceTeamMeta(viewAll = false): ServiceTeamMeta {
  return {
    viewAll,
    canManage: viewAll,
    teamsByName: {},
    teams: [],
    catalogFiltered: !viewAll,
  };
}

/** 优先服务级（空 env）多团队，没有再回落到环境行。 */
export function teamsByNameFromItems(items: ServiceTeamItem[]): Record<string, NamedTeam[]> {
  const serviceLevel: Record<string, NamedTeam[]> = {};
  const envLevel: Record<string, NamedTeam[]> = {};
  items.forEach((item) => {
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const teams = teamsFromItem(item);
    if (!name || teams.length === 0) return;
    const bucket = item.env ? envLevel : serviceLevel;
    bucket[name] = mergeTeams(bucket[name] || [], teams);
  });
  const map: Record<string, NamedTeam[]> = { ...envLevel };
  Object.keys(serviceLevel).forEach((name) => {
    map[name] = serviceLevel[name];
  });
  return map;
}

/** 服务 → 非当前所属业务（一对一；脏数据多条时只用来禁用勾选，不猜日志索引）。 */
export function otherTeamByService(items: ServiceTeamItem[], currentTeamId: number): Record<string, NamedTeam> {
  const map: Record<string, NamedTeam> = {};
  if (!Array.isArray(items) || !Number.isFinite(currentTeamId) || currentTeamId <= 0) return map;
  items.forEach((item) => {
    const service = typeof item.name === 'string' ? item.name.trim() : '';
    if (!service) return;
    teamsFromItem(item).forEach((team) => {
      if (team.id === currentTeamId) return;
      if (!map[service]) map[service] = team;
    });
  });
  return map;
}

/** 用列表/详情 filter API 的返回收窄目录行。view_all 时保留全量并挂上团队名。 */
export function applyServiceTeamFilter(rows: ServiceRow[], result: ServiceTeamFilterResult): { rows: ServiceRow[]; meta: ServiceTeamMeta } {
  const items = Array.isArray(result.items) ? result.items : [];
  const teamsByName = teamsByNameFromItems(items);
  const meta: ServiceTeamMeta = {
    viewAll: result.view_all === true,
    canManage: result.can_manage === true,
    teamsByName,
    teams: [],
    catalogFiltered: result.view_all !== true && rows.length > 0,
  };

  if (result.view_all === true) {
    return { rows, meta };
  }

  const allowedNames = new Set<string>();
  items.forEach((item) => {
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    if (name) allowedNames.add(name);
  });
  return { rows: rows.filter((row) => allowedNames.has(row.name)), meta };
}
