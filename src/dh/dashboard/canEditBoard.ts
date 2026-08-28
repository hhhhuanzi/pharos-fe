export const DASHBOARD_PUT_PERM = '/dashboards/put';

export interface CanEditBoardParams {
  /** 当前用户的权限点，来自 CommonStateContext.perms */
  perms?: string[];
  /** 是否超管，超管在后端 boardPut / boardPutConfigs 里跳过 bgrwCheck */
  isAdmin?: boolean;
  /** 仪表盘所属业务组 id，来自 board.group_id */
  groupId?: number;
  /** 当前用户已加入的业务组 id，来自 CommonStateContext.busiGroups */
  myBusiGroupIds?: number[];
}

/**
 * 仪表盘是否对当前用户显示「编辑」入口。
 *
 * 权限点 /dashboards/put 默认挂在 Standard 角色上，几乎人人都有，单靠它会让「公开仪表盘」
 * 列表对所有业务组的盘都亮起编辑按钮，而后端 boardPut 会用 bgrwCheck(board.group_id) 拒为 403。
 * 因此这里再叠一层业务组归属判断，判断口径对齐后端的 bgrwCheck 入参（盘自己的 group_id，
 * 而非公开授权的 bgids）。
 */
export function canEditBoard(params: CanEditBoardParams): boolean {
  const { perms, isAdmin, groupId, myBusiGroupIds } = params;

  if (isAdmin) {
    return true;
  }
  if (!Array.isArray(perms) || !perms.includes(DASHBOARD_PUT_PERM)) {
    return false;
  }
  if (typeof groupId !== 'number' || !Array.isArray(myBusiGroupIds)) {
    return false;
  }
  return myBusiGroupIds.includes(groupId);
}
