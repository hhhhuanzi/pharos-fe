import { canEditBoard, DASHBOARD_PUT_PERM } from './canEditBoard';

describe('canEditBoard', () => {
  it('always allows admin, even without perms or business groups', () => {
    expect(canEditBoard({ isAdmin: true, groupId: 7 })).toBe(true);
    expect(canEditBoard({ isAdmin: true, perms: [], myBusiGroupIds: [], groupId: 7 })).toBe(true);
  });

  it('allows a non-admin with the perm point on a board in one of his business groups', () => {
    expect(canEditBoard({ perms: [DASHBOARD_PUT_PERM], groupId: 2, myBusiGroupIds: [1, 2, 3] })).toBe(true);
  });

  // 已知限制：GET /busi-groups 的响应里没有 perm_flag，前端拿不到 ro / rw 区分，
  // 只有 ro 权限的组成员仍会看到编辑按钮，提交时由后端 bgrwCheck 拒为 403。
  it('cannot yet tell read-only members apart from read-write members', () => {
    expect(canEditBoard({ perms: [DASHBOARD_PUT_PERM], groupId: 2, myBusiGroupIds: [2] })).toBe(true);
  });

  it('denies a board that belongs to a business group the user is not a member of', () => {
    expect(canEditBoard({ perms: [DASHBOARD_PUT_PERM], groupId: 9, myBusiGroupIds: [1, 2, 3] })).toBe(false);
  });

  it('denies a user without the /dashboards/put perm point', () => {
    expect(canEditBoard({ perms: ['/dashboards'], groupId: 2, myBusiGroupIds: [1, 2, 3] })).toBe(false);
    expect(canEditBoard({ groupId: 2, myBusiGroupIds: [1, 2, 3] })).toBe(false);
  });

  it('denies a user who belongs to no business group', () => {
    expect(canEditBoard({ perms: [DASHBOARD_PUT_PERM], groupId: 2, myBusiGroupIds: [] })).toBe(false);
    expect(canEditBoard({ perms: [DASHBOARD_PUT_PERM], groupId: 2 })).toBe(false);
  });

  it('denies when the board carries no group_id', () => {
    expect(canEditBoard({ perms: [DASHBOARD_PUT_PERM], myBusiGroupIds: [1, 2, 3] })).toBe(false);
  });

  it('gates the public dashboard list row by row', () => {
    const publicBoards = [
      { id: 1, group_id: 2 },
      { id: 2, group_id: 9 },
    ] as const;
    const visible = publicBoards.filter((board) => canEditBoard({ perms: [DASHBOARD_PUT_PERM], groupId: board.group_id, myBusiGroupIds: [1, 2, 3] }));
    expect(visible.map((board) => board.id)).toEqual([1]);
  });
});
