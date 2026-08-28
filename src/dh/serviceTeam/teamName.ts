/** 所属业务与团队等同，暂不拆。名称即日志索引前缀。 */
export const TEAM_NAME_PATTERN = /^[a-z]+(-[a-z]+)*$/;

export function isValidTeamName(value?: string): boolean {
  const name = typeof value === 'string' ? value.trim() : '';
  return TEAM_NAME_PATTERN.test(name);
}
