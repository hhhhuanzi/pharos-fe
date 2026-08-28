import { useContext, useMemo } from 'react';

import { CommonStateContext } from '@/App';

import { canEditBoard } from './canEditBoard';

/**
 * 返回一个判断单条仪表盘能否编辑的函数，供列表页每行调用。
 * 自己从 CommonStateContext 取权限点、超管标记与「我的业务组」，官方文件只需一行调用。
 *
 * 注意：CommonStateContext.busiGroups 来自 GET /busi-groups（不带 all），后端返回的是
 * 「我所在的业务组」（超管为全部），响应里没有 perm_flag，因此这里只能判到「是我的组」，
 * 无法区分 ro / rw。只有 ro 权限的成员仍会看到编辑按钮并在提交时被后端拒为 403。
 */
export function useCanEditBoard() {
  const { perms, profile, busiGroups } = useContext(CommonStateContext);
  const isAdmin = profile?.admin === true || (Array.isArray(profile?.roles) && profile.roles.includes('Admin'));
  const myBusiGroupIds = useMemo(() => (Array.isArray(busiGroups) ? busiGroups.map((item) => item.id) : []), [busiGroups]);

  return (board: { group_id?: number }) => canEditBoard({ perms, isAdmin, groupId: board.group_id, myBusiGroupIds });
}
