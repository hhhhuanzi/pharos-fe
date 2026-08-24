import { RequestMethod } from '@/store/common';
import request from '@/utils/request';
import { N9E_PATHNAME } from '@/utils/constant';
import type { ServiceRow } from '@/dh/service';

import { applyServiceTeamFilter, emptyServiceTeamMeta, parseNamedTeams, teamsByNameFromItems, teamsFromItem } from './visibility';
import type { GroupServiceBinding, NamedTeam, ServiceTeamCheckResult, ServiceTeamFilterResult, ServiceTeamMeta, ServiceTeamVisibility } from './types';

function asDat<T>(res: unknown): T {
  if (res && typeof res === 'object' && 'dat' in res) {
    return (res as { dat: T }).dat;
  }
  return res as T;
}

const silentGet = { method: RequestMethod.Get, silence: true } as const;

/** 官方 /user-groups：Admin 返回全量团队，普通用户只返回自己加入/创建的。给新接口不可用或 teams 为空时兜底。 */
export async function fetchAssignableTeams(): Promise<NamedTeam[]> {
  try {
    const res = await request(`/api/${N9E_PATHNAME}/user-groups`, {
      ...silentGet,
      params: { query: '', limit: 5000 },
    });
    return parseNamedTeams(res);
  } catch {
    return [];
  }
}

async function withAssignableTeams(canManage: boolean, teams?: NamedTeam[]): Promise<NamedTeam[]> {
  const parsed = parseNamedTeams(teams);
  if (!canManage || parsed.length > 0) return parsed;
  return fetchAssignableTeams();
}

export async function fetchServiceTeamVisibility(): Promise<ServiceTeamVisibility> {
  const res = await request(`/api/${N9E_PATHNAME}/dh/service-teams/visibility`, silentGet);
  const dat = asDat<ServiceTeamVisibility>(res);
  const canManage = dat?.can_manage === true;
  return {
    view_all: dat?.view_all === true,
    can_manage: canManage,
    bindings: Array.isArray(dat?.bindings) ? dat.bindings : [],
    teams: await withAssignableTeams(canManage, dat?.teams),
  };
}

export async function filterServiceTeamCatalog(rows: ServiceRow[]): Promise<ServiceTeamFilterResult> {
  const res = await request(`/api/${N9E_PATHNAME}/dh/service-teams/filter`, {
    method: RequestMethod.Post,
    silence: true,
    data: {
      services: rows.map((row) => ({
        name: row.name,
        env: row.env || '',
      })),
    },
  });
  const dat = asDat<ServiceTeamFilterResult>(res);
  const canManage = dat?.can_manage === true;
  return {
    view_all: dat?.view_all === true,
    can_manage: canManage,
    items: Array.isArray(dat?.items) ? dat.items : [],
    teams: await withAssignableTeams(canManage, dat?.teams),
  };
}

export async function checkServiceTeamAccess(serviceName: string, env?: string, fallbackViewAll = false): Promise<ServiceTeamCheckResult> {
  try {
    const res = await request(`/api/${N9E_PATHNAME}/dh/service-teams/check`, {
      ...silentGet,
      params: { service_name: serviceName, env: env || '' },
    });
    const dat = asDat<ServiceTeamCheckResult>(res);
    const canManage = dat?.can_manage === true;
    return {
      visible: dat?.visible === true,
      can_manage: canManage,
      binding: dat?.binding,
      bindings: Array.isArray(dat?.bindings) ? dat.bindings : undefined,
      user_groups: parseNamedTeams(dat?.user_groups),
      teams: await withAssignableTeams(canManage, dat?.teams),
    };
  } catch (err) {
    const status = (err as { response?: { status?: number }; status?: number })?.response?.status ?? (err as { status?: number })?.status;
    if (status === 403) {
      return { visible: false, can_manage: false };
    }
    if (fallbackViewAll) {
      return { visible: true, can_manage: true, teams: await fetchAssignableTeams() };
    }
    throw err;
  }
}

export async function fetchGroupServices(userGroupId: number): Promise<GroupServiceBinding> {
  const res = await request(`/api/${N9E_PATHNAME}/dh/service-teams/by-group`, {
    ...silentGet,
    params: { user_group_id: userGroupId },
  });
  const dat = asDat<GroupServiceBinding>(res);
  return {
    user_group_id: userGroupId,
    can_manage: dat?.can_manage === true,
    service_names: Array.isArray(dat?.service_names) ? dat.service_names.filter((name): name is string => typeof name === 'string' && name.trim() !== '') : [],
  };
}

export async function putGroupServices(userGroupId: number, serviceNames: string[]): Promise<GroupServiceBinding> {
  const res = await request(`/api/${N9E_PATHNAME}/dh/service-teams/by-group`, {
    method: RequestMethod.Put,
    silence: true,
    data: {
      user_group_id: userGroupId,
      service_names: serviceNames,
    },
  });
  const dat = asDat<GroupServiceBinding>(res);
  return {
    user_group_id: userGroupId,
    can_manage: true,
    service_names: Array.isArray(dat?.service_names) ? dat.service_names : serviceNames,
  };
}

export async function loadFilteredServiceCatalog(
  rows: ServiceRow[],
  fallbackViewAll = false,
): Promise<{ rows: ServiceRow[]; meta: ServiceTeamMeta; unavailable?: boolean }> {
  try {
    const [filtered, visibility] = await Promise.all([filterServiceTeamCatalog(rows), fetchServiceTeamVisibility().catch(() => undefined)]);
    const applied = applyServiceTeamFilter(rows, filtered);
    const canManage = applied.meta.canManage || visibility?.can_manage === true || fallbackViewAll;
    const fromFilter = parseNamedTeams(filtered.teams);
    const teams = fromFilter.length > 0 ? fromFilter : parseNamedTeams(visibility?.teams);
    const teamsByName = { ...applied.meta.teamsByName };
    if (visibility?.bindings) {
      const fromBindings = teamsByNameFromItems(visibility.bindings);
      Object.keys(fromBindings).forEach((name) => {
        if (!teamsByName[name] || teamsByName[name].length === 0) {
          teamsByName[name] = fromBindings[name];
        }
      });
    }
    return {
      rows: applied.rows,
      meta: {
        ...applied.meta,
        canManage,
        viewAll: applied.meta.viewAll || visibility?.view_all === true || fallbackViewAll,
        teamsByName,
        teams: canManage && teams.length === 0 ? await fetchAssignableTeams() : teams,
      },
    };
  } catch {
    const meta = emptyServiceTeamMeta(fallbackViewAll);
    if (fallbackViewAll) {
      meta.teams = await fetchAssignableTeams();
      return { rows, meta, unavailable: true };
    }
    return { rows: [], meta, unavailable: true };
  }
}

export function checkResultTeams(res: ServiceTeamCheckResult): NamedTeam[] {
  const fromList = parseNamedTeams(res.user_groups);
  if (fromList.length > 0) return fromList;
  if (Array.isArray(res.bindings) && res.bindings.length > 0) {
    return teamsByNameFromItems(res.bindings)[res.bindings[0].name] || [];
  }
  if (res.binding) {
    return teamsFromItem(res.binding);
  }
  return [];
}
