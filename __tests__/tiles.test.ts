import { UserRole, type Organization } from '../src/api/types';
import { buildDashboardTiles, type DashboardInput, type TileType } from '../src/dashboard/tiles';

const USER_ID = 7;

function org(orgId: number, roleId: number, extra: Partial<Organization> = {}): Organization {
  return {
    orgId,
    name: `Org ${orgId}`,
    userId: USER_ID,
    roleId,
    organizationType: roleId === UserRole.HomeUser ? 2 : 1,
    uniqueNumber: '',
    enableRecruiter: 0,
    isActive: 1,
    isDefault: false,
    parentOrgId: '',
    organizationCategory: 1,
    ...extra,
  };
}

const HOME = org(1, UserRole.HomeUser);

function tiles(partial: Partial<DashboardInput> & { selectedOrg?: Organization }) {
  const selectedOrg = partial.selectedOrg;
  const organizations = partial.organizations ?? [HOME, ...(selectedOrg ? [selectedOrg] : [])];
  return buildDashboardTiles({
    isTablet: false,
    userId: USER_ID,
    homeOrgId: HOME.orgId,
    organizations,
    selectedOrg,
    ...partial,
  });
}

const types = (list: ReturnType<typeof tiles>) => list.map(t => t.type);
const enabled = (list: ReturnType<typeof tiles>, type: TileType) =>
  list.find(t => t.type === type)?.enabled;
const label = (list: ReturnType<typeof tiles>, type: TileType) =>
  list.find(t => t.type === type)?.label;

describe('tile sets', () => {
  test('phones get the iPhone tiles; another org has no MY PUBLIC PAGE', () => {
    expect(types(tiles({ selectedOrg: org(20, UserRole.Coach) }))).toEqual([
      'RECORDER', 'GAMES', 'ASSIGNMENTS', 'LIBRARY', 'USERS', 'TEAMS', 'TAGS', 'MESSAGES',
      'REMOTE', 'RECRUIT', 'FACILITY_CAMERA', 'SIDELINE_MODE', 'APP_GUIDE', 'SETTINGS',
    ]);
  });

  test('tablets get the iPad tiles; HOME adds MY PUBLIC PAGE before SETTINGS', () => {
    const list = tiles({ isTablet: true, selectedOrg: HOME });
    expect(types(list)).toEqual([
      'RECORDER', 'GAMES', 'GAMEPLAN', 'TAGS', 'SNIP_COLLECTION', 'MESSAGES', 'REMOTE',
      'RECRUIT', 'FACILITY_CAMERA', 'SIDELINE_MODE', 'APP_GUIDE', 'TEAM_PAGE', 'SETTINGS',
    ]);
    expect(label(list, 'TEAM_PAGE')).toBe('MY PUBLIC PAGE');
  });

  test('labels follow the iOS names', () => {
    const list = tiles({ isTablet: true, selectedOrg: org(20, UserRole.Coach) });
    expect(label(list, 'TAGS')).toBe('CUSTOM TAGS');
    expect(label(list, 'REMOTE')).toBe('REMOTE');
    expect(label(list, 'FACILITY_CAMERA')).toBe('FACILITY & TRAVEL KIT CAMS');
    expect(label(list, 'SIDELINE_MODE')).toBe('SIDELINE MODE');
    expect(label(list, 'GAMES')).toBe('GAMES/TEAMS');
    expect(label(tiles({ selectedOrg: HOME }), 'GAMES')).toBe('GAMES');
  });
});

describe('access by role (DashBoardUIHelper.hasAccess)', () => {
  // [tile, roles that may NOT use it]
  const blocked: Array<[TileType, UserRole[]]> = [
    ['RECORDER', [UserRole.Player, UserRole.Follower]],
    ['USERS', [UserRole.HomeUser, UserRole.Player, UserRole.Follower]],
    ['TEAMS', [UserRole.HomeUser, UserRole.Player, UserRole.Follower]],
    ['TAGS', [UserRole.Player, UserRole.Follower, UserRole.Manager, UserRole.Recruit]],
    ['FACILITY_CAMERA', [UserRole.HomeUser, UserRole.Player, UserRole.Follower, UserRole.Manager]],
    ['GAMES', []],
    ['LIBRARY', []],
    ['MESSAGES', []],
    ['REMOTE', []],
    ['SIDELINE_MODE', []],
    ['APP_GUIDE', []],
    ['SETTINGS', []],
  ];
  const allRoles = [
    UserRole.Coach, UserRole.Player, UserRole.HomeUser, UserRole.Admin,
    UserRole.Follower, UserRole.Recruit, UserRole.Manager,
  ];

  for (const [tile, roles] of blocked) {
    for (const role of allRoles) {
      const expected = !roles.includes(role);
      test(`${tile} for role ${UserRole[role]} → ${expected ? 'enabled' : 'dimmed'}`, () => {
        expect(enabled(tiles({ selectedOrg: org(20, role) }), tile)).toBe(expected);
      });
    }
  }

  test('tablet-only tiles follow the same rules', () => {
    const player = tiles({ isTablet: true, selectedOrg: org(20, UserRole.Player) });
    expect(enabled(player, 'SNIP_COLLECTION')).toBe(false);
    expect(enabled(player, 'GAMEPLAN')).toBe(false);
    const coach = tiles({ isTablet: true, selectedOrg: org(20, UserRole.Coach) });
    expect(enabled(coach, 'SNIP_COLLECTION')).toBe(true);
    expect(enabled(coach, 'GAMEPLAN')).toBe(true);
  });
});

describe('RECRUIT needs the org flag and a coach, admin or recruiter', () => {
  const cases: Array<[UserRole, number, boolean]> = [
    [UserRole.Coach, 1, true],
    [UserRole.Admin, 1, true],
    [UserRole.Recruit, 1, true],
    [UserRole.Player, 1, false],
    [UserRole.Manager, 1, false],
    [UserRole.Coach, 0, false],
    [UserRole.Admin, 0, false],
  ];
  for (const [role, flag, expected] of cases) {
    test(`${UserRole[role]} with enable_recruiter=${flag} → ${expected}`, () => {
      const list = tiles({ selectedOrg: org(20, role, { enableRecruiter: flag }) });
      expect(enabled(list, 'RECRUIT')).toBe(expected);
    });
  }
});

describe('ASSIGNMENTS: player, coach or admin here, or in any org', () => {
  test('a home user who plays for a club gets it', () => {
    const list = tiles({ selectedOrg: HOME, organizations: [HOME, org(30, UserRole.Player)] });
    expect(enabled(list, 'ASSIGNMENTS')).toBe(true);
  });
  test('a follower everywhere does not', () => {
    const follower = org(30, UserRole.Follower);
    const list = tiles({ selectedOrg: follower, organizations: [HOME, follower] });
    expect(enabled(list, 'ASSIGNMENTS')).toBe(false);
  });
  test("another user's rows do not count", () => {
    const list = tiles({
      selectedOrg: HOME,
      organizations: [HOME, org(30, UserRole.Coach, { userId: 99 })],
    });
    expect(enabled(list, 'ASSIGNMENTS')).toBe(false);
  });
});

test('before organisations load: treated as a home user, MY PUBLIC PAGE shown', () => {
  const list = buildDashboardTiles({
    isTablet: false,
    userId: USER_ID,
    homeOrgId: 0,
    organizations: [],
    selectedOrg: undefined,
  });
  expect(types(list)).toContain('TEAM_PAGE');
  expect(enabled(list, 'USERS')).toBe(false);
  expect(label(list, 'GAMES')).toBe('GAMES/TEAMS');
});

describe('TEAM WEBPAGE (phones, a single team of another org)', () => {
  const club = org(20, UserRole.Coach);
  test('phone with a team selected: TEAM WEBPAGE before SETTINGS', () => {
    const list = tiles({ selectedOrg: club, selectedTeamId: 5 });
    expect(types(list).slice(-2)).toEqual(['TEAM_PAGE', 'SETTINGS']);
    expect(label(list, 'TEAM_PAGE')).toBe('TEAM WEBPAGE');
  });
  test('phone with All Teams: no team page', () => {
    expect(types(tiles({ selectedOrg: club, selectedTeamId: 0 }))).not.toContain('TEAM_PAGE');
  });
  test('tablet: never, even with a team', () => {
    expect(types(tiles({ isTablet: true, selectedOrg: club, selectedTeamId: 5 }))).not.toContain(
      'TEAM_PAGE',
    );
  });
  test('HOME still shows MY PUBLIC PAGE', () => {
    expect(label(tiles({ selectedOrg: HOME, selectedTeamId: 5 }), 'TEAM_PAGE')).toBe('MY PUBLIC PAGE');
  });
});
