export const SERVICE_TEAM_SOURCE_MANUAL = 'manual';
export const SERVICE_TEAM_SOURCE_RELEASE = 'release';

export interface ServiceTeamRef {
  name: string;
  env?: string;
}

export interface NamedTeam {
  id: number;
  name: string;
}

export interface ServiceTeamItem {
  name: string;
  env?: string;
  user_group_id?: number;
  user_group_name?: string;
  user_groups?: NamedTeam[];
  source?: string;
}

export interface ServiceTeamVisibility {
  view_all: boolean;
  can_manage: boolean;
  bindings: ServiceTeamItem[];
  teams?: NamedTeam[];
}

export interface ServiceTeamFilterResult {
  view_all: boolean;
  can_manage: boolean;
  items: ServiceTeamItem[];
  teams?: NamedTeam[];
}

export interface ServiceTeamCheckResult {
  visible: boolean;
  can_manage: boolean;
  binding?: ServiceTeamItem;
  bindings?: ServiceTeamItem[];
  user_groups?: NamedTeam[];
  teams?: NamedTeam[];
}

export interface ServiceTeamMeta {
  viewAll: boolean;
  canManage: boolean;
  teamsByName: Record<string, NamedTeam[]>;
  teams: NamedTeam[];
  catalogFiltered: boolean;
}

export interface GroupServiceBinding {
  user_group_id: number;
  can_manage: boolean;
  service_names: string[];
}
