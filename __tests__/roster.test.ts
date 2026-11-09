import type { Organization, Person, TeamMember } from '../src/api/types';
import { ALL_TEAMS_ID } from '../src/dashboard/teamLogic';
import { canManageRoster, initials, roleName, rosterCards, rosterFilters } from '../src/teams/roster';

const member = (
  teamId: number,
  userId: number,
  roleId: number,
  extra: Partial<TeamMember> = {},
): TeamMember => ({
  teamId,
  orgId: 200,
  userId,
  userName: `User ${userId}`,
  userEmail: `u${userId}@example.com`,
  roleId,
  jerseyNumber: 9999,
  ...extra,
});

const person = (id: number, extra: Partial<Person> = {}): Person => ({
  id,
  name: `Person ${id}`,
  email: `p${id}@example.com`,
  username: '',
  uniqueId: 0,
  avatar: '',
  rawJson: '{}',
  ...extra,
});

const cards = (
  members: TeamMember[],
  opts: Partial<Parameters<typeof rosterCards>[0]> = {},
) =>
  rosterCards({
    members,
    people: new Map(),
    teamId: 11,
    kind: 'followers',
    filter: 'All',
    search: '',
    ...opts,
  });

describe('Members (TeamPlayersView, showMembers)', () => {
  const team = [
    member(11, 1, 1, { userName: 'Cody Coach' }),
    member(11, 2, 2, { userName: 'Pat Player', jerseyNumber: 7 }),
    member(11, 3, 3, { userName: 'Hal Home' }),
    member(11, 4, 4, { userName: 'Ada Admin' }),
    member(11, 5, 5, { userName: 'Fran Follower' }),
    member(11, 6, 6, { userName: 'Rae Recruit' }),
    member(11, 7, 7, { userName: 'Max Manager' }),
  ];
  const members = (opts: Partial<Parameters<typeof rosterCards>[0]> = {}) =>
    cards(team, { kind: 'members', ...opts });

  test('everyone but followers and managers, as iOS (roles 1,2,3,4,6)', () => {
    expect(members().map(c => [c.name, c.roleLabel])).toEqual([
      ['Ada Admin', 'Admin'],
      ['Cody Coach', 'Coach'],
      ['Hal Home', 'Home Admin'],
      ['Pat Player', 'Player'],
      ['Rae Recruit', 'Recruit'],
    ]);
  });

  test('the filters, in the iOS order, each narrow to one role', () => {
    expect(rosterFilters('members')).toEqual(['All', 'Admins', 'Coaches', 'Players', 'Recruiters']);
    expect(rosterFilters('followers')).toEqual(['All', 'Followers', 'Managers']);
    const only = (filter: string) => members({ filter }).map(c => c.name);
    expect(only('Admins')).toEqual(['Ada Admin']);
    expect(only('Coaches')).toEqual(['Cody Coach']);
    expect(only('Players')).toEqual(['Pat Player']);
    expect(only('Recruiters')).toEqual(['Rae Recruit']);
    // A label the tab doesn't have counts as All.
    expect(only('Managers')).toHaveLength(5);
  });

  test('a player shows their jersey number on one team', () => {
    expect(members({ filter: 'Players' })[0].jerseyNumber).toBe(7);
  });

  test('someone who is a player on one team and a follower on another is in both tabs', () => {
    const both = [member(11, 9, 2, { userName: 'Dual' }), member(12, 9, 5, { userName: 'Dual' })];
    expect(cards(both, { kind: 'members', teamId: ALL_TEAMS_ID })[0].roleLabel).toBe('Player');
    expect(cards(both, { kind: 'followers', teamId: ALL_TEAMS_ID })[0].roleLabel).toBe('Follower');
  });
});

describe('Followers (TeamPlayersView, showFollowersOnly)', () => {
  test('only followers (5) and managers (7) are shown', () => {
    const list = cards([
      member(11, 1, 1), // coach
      member(11, 2, 2), // player
      member(11, 3, 4), // admin
      member(11, 4, 5, { userName: 'Fran' }), // follower
      member(11, 5, 6), // recruit
      member(11, 6, 7, { userName: 'Mona' }), // manager
    ]);
    expect(list.map(c => c.userId)).toEqual([4, 6]);
    expect(list.map(c => c.roleLabel)).toEqual(['Follower', 'Manager']);
  });

  test('a team shows only its own places', () => {
    expect(cards([member(11, 1, 5), member(12, 2, 5)]).map(c => c.userId)).toEqual([1]);
  });

  test('All Teams shows each person once, with every role they hold', () => {
    const list = cards(
      [member(11, 1, 5, { userName: 'Ann' }), member(12, 1, 7, { userName: 'Ann' }), member(12, 2, 5, { userName: 'Bob' })],
      { teamId: ALL_TEAMS_ID },
    );
    expect(list.map(c => [c.name, c.roleLabel])).toEqual([
      ['Ann', 'Follower · Manager'],
      ['Bob', 'Follower'],
    ]);
  });

  test('the role filter narrows to followers or managers', () => {
    const members = [member(11, 1, 5), member(11, 2, 7)];
    expect(cards(members, { filter: 'Followers' }).map(c => c.userId)).toEqual([1]);
    expect(cards(members, { filter: 'Managers' }).map(c => c.userId)).toEqual([2]);
  });

  test('search matches the name, ignoring case and surrounding spaces', () => {
    const members = [member(11, 1, 5, { userName: 'Alice Smith' }), member(11, 2, 5, { userName: 'Bob' })];
    expect(cards(members, { search: '  sMiTh ' }).map(c => c.name)).toEqual(['Alice Smith']);
    expect(cards(members, { search: 'zzz' })).toEqual([]);
  });

  test('cards are sorted by name', () => {
    const members = [
      member(11, 1, 5, { userName: 'charlie' }),
      member(11, 2, 5, { userName: 'Alice' }),
      member(11, 3, 5, { userName: 'bob' }),
    ];
    expect(cards(members).map(c => c.name)).toEqual(['Alice', 'bob', 'charlie']);
  });

  test('the users list supplies the photo and current name; the roster fills in otherwise', () => {
    const people = new Map([[1, person(1, { name: 'New Name', avatar: 'https://img/1.png' })]]);
    const list = cards([member(11, 1, 5, { userName: 'Old Name' }), member(11, 2, 5, { userName: 'Zed' })], { people });
    expect(list).toEqual([
      expect.objectContaining({ userId: 1, name: 'New Name', avatar: 'https://img/1.png', email: 'p1@example.com' }),
      expect.objectContaining({ userId: 2, name: 'Zed', avatar: '', email: 'u2@example.com' }),
    ]);
  });

  test('a jersey number shows for one team, and never 9999 or 0', () => {
    const members = [
      member(11, 1, 5, { jerseyNumber: 23 }),
      member(11, 2, 5, { jerseyNumber: 9999 }),
      member(11, 3, 5, { jerseyNumber: 0 }),
    ];
    expect(cards(members).map(c => c.jerseyNumber)).toEqual([23, null, null]);
    expect(cards(members, { teamId: ALL_TEAMS_ID })[0].jerseyNumber).toBeNull();
  });
});

describe('canManageRoster (isCoach)', () => {
  const org = (roleId: number) => ({ roleId }) as Organization;

  test('coaches and admins only', () => {
    expect(canManageRoster(org(1))).toBe(true);
    expect(canManageRoster(org(4))).toBe(true);
    for (const roleId of [2, 3, 5, 6, 7]) {
      expect(canManageRoster(org(roleId))).toBe(false);
    }
    expect(canManageRoster(undefined)).toBe(false);
  });
});

test('role names and initials', () => {
  expect([1, 2, 3, 4, 5, 6, 7, 99].map(roleName)).toEqual([
    'Coach',
    'Player',
    'Home Admin',
    'Admin',
    'Follower',
    'Recruit',
    'Manager',
    'Player',
  ]);
  expect(initials('  ann  marie smith ')).toBe('AM');
  expect(initials('bob')).toBe('B');
  expect(initials('')).toBe('');
});
