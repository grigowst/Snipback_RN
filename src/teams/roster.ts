import { UserRole, type Organization, type Person, type TeamMember } from '../api/types';
import { DEFAULT_JERSEY } from '../api/teams';
import { ALL_TEAMS_ID } from '../dashboard/teamLogic';

// The hub's Members and Followers grids (TeamPlayersView in iOS, with
// showFollowersOnly off for Members and on for Followers).
//
// iOS picks user ids from the team mappings, then shows the cached Users with
// those ids. Here the grids are built from the team mappings themselves,
// which already carry name, email, role and jersey number; the users list
// only adds the photo. So the grids work before the users list has synced,
// and offline.

/** isCoach() in iOS: a coach or an admin of the selected organisation. */
export function canManageRoster(selectedOrg: Organization | undefined): boolean {
  return selectedOrg?.roleId === UserRole.Coach || selectedOrg?.roleId === UserRole.Admin;
}

/** Members: everyone but followers and managers. Followers: those two. */
export type RosterKind = 'members' | 'followers';

type RoleFilter = { label: string; roles: number[] };

/**
 * Each tab's role filter, in the iOS order: Members [.all, .admins, .coaches,
 * .players, .recruit] over roles 1,2,3,4,6; Followers [.all, .followers,
 * .manager] over roles 5,7.
 */
const ROLE_FILTERS: Record<RosterKind, RoleFilter[]> = {
  members: [
    {
      label: 'All',
      roles: [UserRole.Coach, UserRole.Player, UserRole.HomeUser, UserRole.Admin, UserRole.Recruit],
    },
    { label: 'Admins', roles: [UserRole.Admin] },
    { label: 'Coaches', roles: [UserRole.Coach] },
    { label: 'Players', roles: [UserRole.Player] },
    { label: 'Recruiters', roles: [UserRole.Recruit] },
  ],
  followers: [
    { label: 'All', roles: [UserRole.Follower, UserRole.Manager] },
    { label: 'Followers', roles: [UserRole.Follower] },
    { label: 'Managers', roles: [UserRole.Manager] },
  ],
};

/** The filter labels a tab offers; the first ("All") is the default. */
export function rosterFilters(kind: RosterKind): string[] {
  return ROLE_FILTERS[kind].map(f => f.label);
}

/** Role names as getUserRoleNameFromOrganisation spells them. */
export function roleName(roleId: number): string {
  switch (roleId) {
    case UserRole.Coach:
      return 'Coach';
    case UserRole.HomeUser:
      return 'Home Admin';
    case UserRole.Admin:
      return 'Admin';
    case UserRole.Follower:
      return 'Follower';
    case UserRole.Recruit:
      return 'Recruit';
    case UserRole.Manager:
      return 'Manager';
    default:
      return 'Player';
  }
}

/** iOS's "no number" jersey values (defaultJerseyNo, zeroJerseyNo). */
const NO_JERSEY = [DEFAULT_JERSEY, 0];

export type RosterCard = {
  userId: number;
  name: string;
  email: string;
  /** The person's roles on the team (or teams) shown, e.g. "Follower · Manager". */
  roleLabel: string;
  /** Photo URL, or '' to show initials. */
  avatar: string;
  /** Shown only when one team is selected and the number is real. */
  jerseyNumber: number | null;
};

export type RosterCardsInput = {
  /** The selected team's mappings, or the whole organisation's for All Teams. */
  members: TeamMember[];
  /** The cached users list, by id (photos and current names). */
  people: Map<number, Person>;
  teamId: number;
  kind: RosterKind;
  /** A label from rosterFilters(kind); anything else counts as "All". */
  filter: string;
  search: string;
};

/**
 * One card per person with a place of the tab's roles on the team (or, for
 * All Teams, on any of the organisation's teams), filtered by role and by a
 * case-insensitive name search, sorted by name.
 */
export function rosterCards({
  members,
  people,
  teamId,
  kind,
  filter,
  search,
}: RosterCardsInput): RosterCard[] {
  const filters = ROLE_FILTERS[kind];
  const roles = (filters.find(f => f.label === filter) ?? filters[0]).roles;
  const oneTeam = teamId !== ALL_TEAMS_ID;
  const byUser = new Map<number, { member: TeamMember; roleIds: Set<number> }>();
  for (const member of members) {
    if (!roles.includes(member.roleId) || member.userId <= 0) {
      continue;
    }
    if (oneTeam && member.teamId !== teamId) {
      continue;
    }
    const entry = byUser.get(member.userId);
    if (entry) {
      entry.roleIds.add(member.roleId);
    } else {
      byUser.set(member.userId, { member, roleIds: new Set([member.roleId]) });
    }
  }

  const query = search.trim().toLowerCase();
  const cards: RosterCard[] = [];
  for (const [userId, { member, roleIds }] of byUser) {
    const person = people.get(userId);
    const name = person?.name || member.userName;
    if (query && !name.toLowerCase().includes(query)) {
      continue;
    }
    cards.push({
      userId,
      name,
      email: person?.email || member.userEmail,
      roleLabel: [...roleIds]
        .sort((a, b) => a - b)
        .map(roleName)
        .join(' · '),
      avatar: person?.avatar ?? '',
      jerseyNumber:
        oneTeam && !NO_JERSEY.includes(member.jerseyNumber) ? member.jerseyNumber : null,
    });
  }
  return cards.sort((a, b) => a.name.localeCompare(b.name));
}

/** Up to two initials for a card without a photo. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map(w => w[0]!.toUpperCase())
    .join('');
}
