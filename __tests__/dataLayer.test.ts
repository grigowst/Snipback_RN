import { fetchAllPages } from '../src/api/paging';
import { mapTeam } from '../src/api/teams';
import { UserRole, type Organization, type TeamWithMembers } from '../src/api/types';
import {
  readOrganizations,
  readTeamMembers,
  readTeams,
  replaceOrganizations,
  replaceTeams,
} from '../src/db/repositories';
import { clearStore } from '../src/db/store';

function org(orgId: number, userId = 7, extra: Partial<Organization> = {}): Organization {
  return {
    orgId,
    name: `Org ${orgId}`,
    userId,
    roleId: UserRole.Coach,
    organizationType: 1,
    uniqueNumber: '',
    enableRecruiter: 0,
    isActive: 1,
    isDefault: false,
    parentOrgId: '',
    ...extra,
  };
}

function team(id: number, orgId: number, members: number[] = []): TeamWithMembers {
  return {
    team: {
      id,
      organizationId: orgId,
      name: `Team ${id}`,
      teamType: 0,
      isDeleted: 0,
      isArchive: 0,
      isFavourite: 0,
      uniqueNumber: `U${id}`,
      organizationName: '',
      logoUrl: '',
      abbr: '',
      noOfPlayers: members.length,
    },
    members: members.map(userId => ({
      teamId: id,
      orgId,
      userId,
      userName: `User ${userId}`,
      userEmail: '',
      roleId: UserRole.Player,
      jerseyNumber: 0,
    })),
  };
}

const ids = <T extends { orgId?: number; id?: number }>(rows: T[]) =>
  rows.map(r => r.orgId ?? r.id).sort((a, b) => (a ?? 0) - (b ?? 0));

describe('organisations in Realm', () => {
  test('a replace stores the list and removes organisations no longer returned', () => {
    replaceOrganizations(7, [org(1), org(2), org(3)]);
    replaceOrganizations(7, [org(1), org(3, 7, { name: 'Renamed' })]);
    const stored = readOrganizations(7);
    expect(ids(stored)).toEqual([1, 3]);
    expect(stored.find(o => o.orgId === 3)?.name).toBe('Renamed');
  });

  test("one account's replace never touches another account's rows", () => {
    replaceOrganizations(7, [org(1)]);
    replaceOrganizations(8, [org(1, 8), org(2, 8)]);
    replaceOrganizations(7, []);
    expect(readOrganizations(7)).toEqual([]);
    expect(ids(readOrganizations(8))).toEqual([1, 2]);
  });

  test('reads are plain copies that survive clearing the store', () => {
    replaceOrganizations(7, [org(1)]);
    const [copy] = readOrganizations(7);
    clearStore();
    expect(copy.name).toBe('Org 1');
    expect(readOrganizations(7)).toEqual([]);
  });
});

describe('teams in Realm', () => {
  test('rosters are replaced, and teams no longer returned go with their rosters', () => {
    replaceTeams(50, [team(1, 50, [10, 11]), team(2, 50, [12])]);
    replaceTeams(50, [team(1, 50, [11, 13])]);
    expect(ids(readTeams(50))).toEqual([1]);
    expect(readTeamMembers(1).map(m => m.userId).sort()).toEqual([11, 13]);
    expect(readTeamMembers(2)).toEqual([]);
  });

  test("another organisation's teams are untouched", () => {
    replaceTeams(50, [team(1, 50)]);
    replaceTeams(60, [team(2, 60)]);
    replaceTeams(50, []);
    expect(readTeams(50)).toEqual([]);
    expect(ids(readTeams(60))).toEqual([2]);
  });
});

describe('fetchAllPages', () => {
  test('follows paging.next until it ends', async () => {
    const pages: Record<number, { items: number[]; next: number }> = {
      1: { items: [1, 2], next: 2 },
      2: { items: [3], next: 3 },
      3: { items: [4], next: -1 },
    };
    await expect(fetchAllPages(async p => pages[p])).resolves.toEqual([1, 2, 3, 4]);
  });

  test('stops when next does not move forward', async () => {
    const fetchPage = jest.fn(async () => ({ items: [1], next: 1 }));
    await expect(fetchAllPages(fetchPage)).resolves.toEqual([1]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  test('a failing page fails the whole fetch (no partial list)', async () => {
    const fetchPage = async (p: number) => {
      if (p === 2) {
        throw new Error('page 2 failed');
      }
      return { items: [p], next: p + 1 };
    };
    await expect(fetchAllPages(fetchPage)).rejects.toThrow('page 2 failed');
  });
});

test('mapTeam maps the iOS Team fields and its players_list', () => {
  const mapped = mapTeam(
    {
      id: 5,
      name: 'U14 Boys',
      organization_id: 50,
      is_archive: 0,
      is_deleted: 0,
      team_type: 0,
      is_favourite: 1,
      unique_number: 'ABC123',
      players_list: [{ user_id: 9, name: 'Sam', email: 's@x.co', role_id: 2, jersey_number: 7 }],
    },
    99,
  );
  expect(mapped.team).toEqual(
    expect.objectContaining({ id: 5, organizationId: 50, isFavourite: 1, uniqueNumber: 'ABC123' }),
  );
  expect(mapped.members).toEqual([
    { teamId: 5, orgId: 50, userId: 9, userName: 'Sam', userEmail: 's@x.co', roleId: 2, jerseyNumber: 7 },
  ]);
});

test('two memberships of the same organisation are kept as two rows (iOS keys by "key")', () => {
  replaceOrganizations(7, [
    org(1, 7, { rowKey: 'a', roleId: UserRole.Coach }),
    org(1, 7, { rowKey: 'b', roleId: UserRole.Player }),
  ]);
  expect(readOrganizations(7).map(o => o.roleId).sort()).toEqual([UserRole.Coach, UserRole.Player]);
});

test("teams keep their own organisation; another org's team is neither listed nor swept", () => {
  replaceTeams(51, [team(2, 51)]);
  // Org 50's list happens to include a team that belongs to org 51.
  replaceTeams(50, [team(1, 50), team(3, 51)]);
  expect(ids(readTeams(50))).toEqual([1]);
  expect(ids(readTeams(51))).toEqual([2, 3]);
  replaceTeams(50, []);
  expect(ids(readTeams(51))).toEqual([2, 3]);
});

test('mapTeam falls back to the requested organisation when organization_id is null', () => {
  expect(mapTeam({ id: 1, organization_id: null }, 99).team.organizationId).toBe(99);
});
