import { TEAM_NAME_PATTERN, isValidTeamName } from './teamName';

describe('isValidTeamName', () => {
  it('allows lowercase letters and single hyphens between words', () => {
    expect(isValidTeamName('turms')).toBe(true);
    expect(isValidTeamName('rome-sec')).toBe(true);
    expect(isValidTeamName('aa-bb-cc')).toBe(true);
    expect(isValidTeamName(' a ')).toBe(true);
    expect(TEAM_NAME_PATTERN.test('turms')).toBe(true);
  });

  it('rejects digits, underscores, uppercase, chinese and broken hyphens', () => {
    expect(isValidTeamName('turms1')).toBe(false);
    expect(isValidTeamName('turms_prod')).toBe(false);
    expect(isValidTeamName('Turms')).toBe(false);
    expect(isValidTeamName('turms--a')).toBe(false);
    expect(isValidTeamName('-turms')).toBe(false);
    expect(isValidTeamName('turms-')).toBe(false);
    expect(isValidTeamName('业务')).toBe(false);
    expect(isValidTeamName('turms.prod')).toBe(false);
    expect(isValidTeamName('')).toBe(false);
    expect(isValidTeamName(undefined)).toBe(false);
  });
});
