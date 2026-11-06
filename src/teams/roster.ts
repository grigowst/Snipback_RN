import { UserRole, type Organization, type Person, type TeamMember } from '../api/types';
import { ALL_TEAMS_ID } from '../dashboard/teamLogic';

// The hub's Followers grid (TeamPlayersView with showFollowersOnly in iOS).
//
// iOS picks user ids from the team mappings (roles 5 and 7), then shows the
// cached Users with those ids. Here the grid is built from the team mappings
// themselves, which already carry name, email, role and jersey number; the
// users list only adds the photo. So the grid works before the users list
// has synced, and offline.

/** isCoach() in iOS: a coach or an admin of the selected organisation. */
export function canManageRoster(selectedOrg: Organization | undefined): boolean {
  return selectedOrg?.roleId === UserRole.Coach || selectedOrg?.roleId === UserRole.Admin;
}

/** The Followers tab's role filter (userTypes [.all, .followers, .manager]). */
export const FOLLOWER_FILTERS = ['All', 'Followers', 'Managers'] as const;
export type FollowerFilter = (typeof FOLLOWER_FILTERS)[number];

const FILTER_ROLES: Record<FollowerFilter, number[]> = {
  All: [UserRole.Follower, UserRole.Manager],
  Followers: [UserRole.Follower],
  Managers: [UserRole.Manager],
};

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
const NO_JERSEY = [9999, 0];

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

export type FollowerCardsInput = {
  /** The selected team's mappings, or the whole organisation's for All Teams. */
  members: TeamMember[];
  /** The cached users list, by id (photos and current names). */
  people: Map<number, Person>;
  teamId: number;
  filter: FollowerFilter;
  search: string;
};

/**
 * One card per person with a follower or manager place on the team (or, for
 * All Teams, on any of the organisation's teams), filtered by role and by a
 * case-insensitive name search, sorted by name.
 */
export function followerCards({
  members,
  people,
  teamId,
  filter,
  search,
}: FollowerCardsInput): RosterCard[] {
  const roles = FILTER_ROLES[filter];
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
