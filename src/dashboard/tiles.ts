import type { ImageSourcePropType } from 'react-native';
import { UserRole, type Organization } from '../api/types';

// The dashboard's tiles, ported from the iOS app:
// DashboardViewController.prepareDashBoardItems() (which tiles, in what order),
// DashBoardUIHelper.getDashboardItem() (names and icons) and
// DashBoardUIHelper.hasAccess() (which roles may use each tile).

export type TileType =
  | 'RECORDER'
  | 'GAMES'
  | 'GAMEPLAN'
  | 'TAGS'
  | 'SNIP_COLLECTION'
  | 'MESSAGES'
  | 'REMOTE'
  | 'RECRUIT'
  | 'FACILITY_CAMERA'
  | 'SIDELINE_MODE'
  | 'APP_GUIDE'
  | 'ASSIGNMENTS'
  | 'LIBRARY'
  | 'USERS'
  | 'TEAMS'
  | 'TEAM_PAGE'
  | 'SETTINGS';

export type DashboardTile = {
  type: TileType;
  label: string;
  icon: ImageSourcePropType;
  /** Disabled tiles stay on screen, dimmed and untappable. */
  enabled: boolean;
};

const ICONS = {
  recorder: require('../../assets/images/dashboard/recorder_dash.png'),
  games: require('../../assets/images/dashboard/games_dash.png'),
  library: require('../../assets/images/dashboard/library.png'),
  customTags: require('../../assets/images/dashboard/customtag_dash.png'),
  messages: require('../../assets/images/dashboard/chat_msg_dash.png'),
  remote: require('../../assets/images/dashboard/bookmark_dash.png'),
  recruit: require('../../assets/images/dashboard/recruit_dash.png'),
  facility: require('../../assets/images/dashboard/facility_dash.png'),
  sideline: require('../../assets/images/dashboard/travel_kit.png'),
  appGuide: require('../../assets/images/dashboard/app_guide_dash.png'),
  users: require('../../assets/images/dashboard/players_dash.png'),
  teams: require('../../assets/images/dashboard/teams_dash.png'),
  assignments: require('../../assets/images/dashboard/multiview.png'),
  myHome: require('../../assets/images/dashboard/my_home.png'),
  team: require('../../assets/images/dashboard/team.png'),
  settings: require('../../assets/images/dashboard/settings_dash.png'),
};

/** Tablet (iPad) tiles, in order. */
const TABLET_TILES: TileType[] = [
  'RECORDER',
  'GAMES',
  'GAMEPLAN',
  'TAGS',
  'SNIP_COLLECTION',
  'MESSAGES',
  'REMOTE',
  'RECRUIT',
  'FACILITY_CAMERA',
  'SIDELINE_MODE',
  'APP_GUIDE',
];

/** Phone (iPhone) tiles, in order. */
const PHONE_TILES: TileType[] = [
  'RECORDER',
  'GAMES',
  'ASSIGNMENTS',
  'LIBRARY',
  'USERS',
  'TEAMS',
  'TAGS',
  'MESSAGES',
  'REMOTE',
  'RECRUIT',
  'FACILITY_CAMERA',
  'SIDELINE_MODE',
  'APP_GUIDE',
];

export type DashboardInput = {
  /** Tablet or phone tile set, by device class (an iPad in Split View is still a tablet). */
  isTablet: boolean;
  userId: number;
  /** Every organisation row for the user. */
  organizations: Organization[];
  /** The organisation chosen in the header; undefined until organisations load. */
  selectedOrg: Organization | undefined;
  /** The user's HOME organisation id (0 when unknown). */
  homeOrgId: number;
  /** The team chosen in the phone header's team picker (id 0 = all teams). */
  selectedTeamId?: number;
};

/** getMyRole(): the role in the selected org; no selected org counts as a home user. */
export function roleOf(selectedOrg: Organization | undefined): UserRole {
  const roleId = selectedOrg?.roleId;
  return roleId && roleId >= UserRole.Coach && roleId <= UserRole.Manager
    ? (roleId as UserRole)
    : UserRole.HomeUser;
}

function hasAccess(type: TileType, input: DashboardInput): boolean {
  const role = roleOf(input.selectedOrg);
  const is = (...roles: UserRole[]) => roles.includes(role);
  switch (type) {
    case 'RECORDER':
      return !is(UserRole.Player, UserRole.Follower);
    case 'USERS':
    case 'TEAMS':
      return !is(UserRole.HomeUser, UserRole.Player, UserRole.Follower);
    case 'TAGS':
    case 'SNIP_COLLECTION':
      return !is(UserRole.Player, UserRole.Follower, UserRole.Manager, UserRole.Recruit);
    case 'FACILITY_CAMERA':
    case 'GAMEPLAN':
      return !is(UserRole.HomeUser, UserRole.Player, UserRole.Follower, UserRole.Manager);
    case 'RECRUIT': {
      // iOS: the org's enable_recruiter flag, then isCoach() (coach or admin) or isRecruiter().
      const recruiterEnabled = input.selectedOrg?.enableRecruiter === 1;
      return recruiterEnabled && is(UserRole.Coach, UserRole.Admin, UserRole.Recruit);
    }
    case 'ASSIGNMENTS': {
      // A player, coach or admin here, or in any of the user's orgs (assignmentOrgIds()).
      const anywhere = input.organizations.some(
        o =>
          o.userId === input.userId &&
          [UserRole.Player, UserRole.Coach, UserRole.Admin].includes(o.roleId),
      );
      return is(UserRole.Player, UserRole.Coach, UserRole.Admin) || anywhere;
    }
    default:
      return true;
  }
}

function describe(type: TileType, input: DashboardInput): Omit<DashboardTile, 'enabled' | 'type'> {
  switch (type) {
    case 'RECORDER':
      return { label: 'RECORDER', icon: ICONS.recorder };
    case 'GAMES':
      // isHomeUser() reads the selected org's role directly (no fallback).
      return {
        label: input.selectedOrg?.roleId === UserRole.HomeUser ? 'GAMES' : 'GAMES/TEAMS',
        icon: ICONS.games,
      };
    case 'GAMEPLAN':
      return { label: 'GAMEPLAN', icon: ICONS.library };
    case 'TAGS':
      return { label: 'CUSTOM TAGS', icon: ICONS.customTags };
    case 'SNIP_COLLECTION':
      return { label: 'SNIP COLLECTION', icon: ICONS.customTags };
    case 'MESSAGES':
      return { label: 'MESSAGES', icon: ICONS.messages };
    case 'REMOTE':
      return { label: 'REMOTE', icon: ICONS.remote };
    case 'RECRUIT':
      return { label: 'RECRUIT', icon: ICONS.recruit };
    case 'FACILITY_CAMERA':
      return { label: 'FACILITY & TRAVEL KIT CAMS', icon: ICONS.facility };
    case 'SIDELINE_MODE':
      return { label: 'SIDELINE MODE', icon: ICONS.sideline };
    case 'APP_GUIDE':
      return { label: 'APP GUIDE', icon: ICONS.appGuide };
    case 'ASSIGNMENTS':
      return { label: 'ASSIGNMENTS', icon: ICONS.assignments };
    case 'LIBRARY':
      return { label: 'LIBRARY', icon: ICONS.library };
    case 'USERS':
      return { label: 'USERS', icon: ICONS.users };
    case 'TEAMS':
      return { label: 'TEAMS', icon: ICONS.teams };
    case 'TEAM_PAGE':
      return isHomeSelected(input)
        ? { label: 'MY PUBLIC PAGE', icon: ICONS.myHome }
        : { label: 'TEAM WEBPAGE', icon: ICONS.team };
    case 'SETTINGS':
      return { label: 'SETTINGS', icon: ICONS.settings };
  }
}

const isHomeSelected = (input: DashboardInput) =>
  (input.selectedOrg?.orgId ?? 0) === input.homeOrgId;

/** The tiles to show, in order, with each one's name, icon and access. */
export function buildDashboardTiles(input: DashboardInput): DashboardTile[] {
  const types = [...(input.isTablet ? TABLET_TILES : PHONE_TILES)];

  // MY PUBLIC PAGE in the HOME org. (iOS compares ids, so with no
  // organisations loaded 0 === 0 and the tile shows too.)
  // TEAM WEBPAGE on phones when a single team of another org is selected.
  if (isHomeSelected(input)) {
    types.push('TEAM_PAGE');
  } else if (!input.isTablet && input.selectedTeamId !== undefined && input.selectedTeamId !== 0) {
    types.push('TEAM_PAGE');
  }
  types.push('SETTINGS');

  return types.map(type => ({ type, ...describe(type, input), enabled: hasAccess(type, input) }));
}
