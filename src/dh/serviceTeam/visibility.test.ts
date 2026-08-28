import type { ServiceRow } from '@/dh/service';

import { businessToneClass } from './BusinessTags';
import { applyServiceTeamFilter, isServiceTeamApiUnavailable, localCanManage, localCanViewAll, otherTeamByService, parseNamedTeams, teamsByNameFromItems } from './visibility';

const emptyAssoc = { clusters: [] as string[], namespaces: [] as string[] };

function row(name: string, env?: string): ServiceRow {
  const next: ServiceRow = { name, association: emptyAssoc, hasRed: false };
  if (env) next.env = env;
  return next;
}

describe('localCanViewAll', () => {
  it('matches admin / SRE / 运维 and rejects standard', () => {
    expect(localCanViewAll({ admin: true, roles: [] })).toBe(true);
    expect(localCanViewAll({ roles: ['SRE'] })).toBe(true);
    expect(localCanViewAll({ roles: ['运维'] })).toBe(true);
    expect(localCanViewAll({ roles: ['Standard'] })).toBe(false);
    expect(localCanViewAll(undefined)).toBe(false);
  });
});

describe('localCanManage', () => {
  it('matches ops roles and /service/manage', () => {
    expect(localCanManage({ admin: true, roles: [] })).toBe(true);
    expect(localCanManage({ roles: ['SRE'] }, [])).toBe(true);
    expect(localCanManage({ roles: ['Standard'] }, ['/service/manage'])).toBe(true);
    expect(localCanManage({ roles: ['Standard'] }, ['/service/view-all'])).toBe(false);
    expect(localCanManage({ roles: ['Standard'] }, [])).toBe(false);
  });
});

describe('teamsByNameFromItems', () => {
  it('collects multiple service-level teams and prefers them over env-specific', () => {
    const map = teamsByNameFromItems([
      { name: 'turms-business-service', env: 'prod', user_group_id: 9, user_group_name: 'other' },
      { name: 'turms-business-service', env: '', user_group_id: 1, user_group_name: 'turms' },
      { name: 'turms-business-service', env: '', user_group_id: 2, user_group_name: 'rome-sec' },
    ]);
    expect(map['turms-business-service']).toEqual([
      { id: 1, name: 'turms' },
      { id: 2, name: 'rome-sec' },
    ]);
  });

  it('reads user_groups arrays', () => {
    const map = teamsByNameFromItems([
      {
        name: 'trade-api',
        user_groups: [
          { id: 3, name: 'trade-bk' },
          { id: 4, name: 'risk' },
        ],
      },
    ]);
    expect(map['trade-api']).toEqual([
      { id: 3, name: 'trade-bk' },
      { id: 4, name: 'risk' },
    ]);
  });

  it('falls back to env-specific when no service-level row', () => {
    const map = teamsByNameFromItems([{ name: 'trade-api', env: 'prod', user_group_id: 3, user_group_name: 'trade-bk' }]);
    expect(map['trade-api']).toEqual([{ id: 3, name: 'trade-bk' }]);
  });
});

describe('otherTeamByService', () => {
  it('maps services bound to a different team and ignores the current one', () => {
    expect(
      otherTeamByService(
        [
          { name: 'turms-gateway', user_group_id: 1, user_group_name: 'turms' },
          { name: 'trade-api', user_groups: [{ id: 2, name: 'rome-sec' }] },
          { name: 'shared-svc', user_groups: [{ id: 1, name: 'turms' }, { id: 3, name: 'other' }] },
        ],
        1,
      ),
    ).toEqual({
      'trade-api': { id: 2, name: 'rome-sec' },
      'shared-svc': { id: 3, name: 'other' },
    });
  });
});

describe('parseNamedTeams', () => {
  it('reads arrays and { dat } wrappers, drops invalid rows', () => {
    expect(parseNamedTeams([{ id: 1, name: 'turms' }, { id: 0, name: 'skip' }, { id: 2 }])).toEqual([{ id: 1, name: 'turms' }]);
    expect(parseNamedTeams({ dat: [{ id: 3, name: 'rome-sec' }] })).toEqual([{ id: 3, name: 'rome-sec' }]);
  });
});

describe('isServiceTeamApiUnavailable', () => {
  it('matches HTML-as-JSON and 404', () => {
    expect(isServiceTeamApiUnavailable({ message: `Unexpected token '<', "<! -- ~ C"... is not valid JSON` })).toBe(true);
    expect(isServiceTeamApiUnavailable({ status: 404 })).toBe(true);
    expect(isServiceTeamApiUnavailable({ message: 'forbidden' })).toBe(false);
  });
});

describe('applyServiceTeamFilter', () => {
  const rows = [row('turms-business-service', 'prod'), row('trade-api', 'test'), row('orphan')];

  it('keeps all rows for view_all and maps multiple teams', () => {
    const { rows: next, meta } = applyServiceTeamFilter(rows, {
      view_all: true,
      can_manage: true,
      items: [
        {
          name: 'turms-business-service',
          user_groups: [
            { id: 1, name: 'turms' },
            { id: 2, name: 'rome-sec' },
          ],
        },
      ],
    });
    expect(next).toHaveLength(3);
    expect(meta.viewAll).toBe(true);
    expect(meta.teamsByName['turms-business-service']?.map((item) => item.name)).toEqual(['turms', 'rome-sec']);
  });

  it('drops unbound and other-team services for regular users', () => {
    const { rows: next, meta } = applyServiceTeamFilter(rows, {
      view_all: false,
      can_manage: false,
      items: [{ name: 'turms-business-service', env: 'prod', user_group_id: 1, user_group_name: 'turms' }],
    });
    expect(next.map((item) => item.name)).toEqual(['turms-business-service']);
    expect(meta.catalogFiltered).toBe(true);
  });
});

describe('businessToneClass', () => {
  it('is stable for the same id and differs across ids', () => {
    expect(businessToneClass(1, 'turms')).toBe(businessToneClass(1, 'ignored'));
    expect(businessToneClass(1, 'turms')).not.toBe(businessToneClass(2, 'rome-sec'));
  });
});
