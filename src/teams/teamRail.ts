import type { OpponentTeam, Team } from '../api/types';
import { ALL_TEAMS_ID, ALL_TEAMS_NAME, activeTeams, type TeamChoice } from '../dashboard/teamLogic';

// The hub's left rail (MainTeamsGamesViewController.myTeamRefreshList,
// opponentRefreshList and the team "…" menus in iOS).

/** The rail's toggle: the organisation's own teams, or its opponent teams. */
export type TeamMode = 'myTeam' | 'opponent';

export type RailRow = { id: number; name: string; isFavourite: boolean };

const matches = (name: string, search: string) => {
  const text = search.trim().toLowerCase();
  return text === '' || name.toLowerCase().includes(text);
};

/** "Org - All Teams", then the teams whose name contains the search text (any case). */
export function myTeamRows(list: TeamChoice[], search: string): RailRow[] {
  return list
    .filter(t => t.id === ALL_TEAMS_ID || matches(t.name, search))
    .map(t => ({ id: t.id, name: t.name, isFavourite: t.isFavourite === 1 }));
}

/**
 * "Org - All Teams" (every opponent), then the organisation's opponents that
 * aren't deleted, by name, filtered by the search text.
 */
export function opponentRows(opponents: OpponentTeam[], orgId: number, search: string): RailRow[] {
  const rows = opponents
    .filter(o => o.organizationId === orgId && o.isDeleted === 0 && matches(o.name, search))
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
    .map(o => ({ id: o.id, name: o.name, isFavourite: false }));
  return [{ id: ALL_TEAMS_ID, name: ALL_TEAMS_NAME, isFavourite: false }, ...rows];
}

/** The "Archived (n)" count: the organisation's normal teams that are archived. */
export function archivedCount(teams: Team[]): number {
  return teams.filter(t => t.isArchive === 1 && t.teamType === 0 && t.isDeleted === 0).length;
}

/**
 * Whether a row has a "…" button. Never on "Org - All Teams" (iOS has Edit Org
 * there, for the organisation's owner; not built). My teams: everyone (a
 * player or follower gets the favourite option only). Opponents: coaches and
 * admins (to rename).
 */
export function hasRowMenu(mode: TeamMode, rowId: number, canManage: boolean): boolean {
  if (rowId === ALL_TEAMS_ID) {
    return false;
  }
  return mode === 'myTeam' || canManage;
}

export type TeamMenuAction = 'invite' | 'webpage' | 'duplicate' | 'favourite' | 'unfavourite' | 'delete';

export const TEAM_MENU_TITLES: Record<TeamMenuAction, string> = {
  invite: 'Team Invite Links',
  webpage: 'Team Webpage',
  duplicate: 'Duplicate Team',
  favourite: 'Set as Favourite',
  unfavourite: 'Unfavourite',
  delete: 'Delete Team',
};

/**
 * A team's "…" menu (showActionSheetForTeamOption / …ForPlayer in iOS).
 * Coaches and admins get the team options and Delete for admins only;
 * everyone else can only star or unstar the team. Edit Team comes with the
 * team editor (step 8); Bulk Upload needs upload credentials from the backend.
 */
export function teamMenuActions(opts: { canManage: boolean; isAdmin: boolean; isFavourite: boolean }): TeamMenuAction[] {
  const star: TeamMenuAction = opts.isFavourite ? 'unfavourite' : 'favourite';
  if (!opts.canManage) {
    return [star];
  }
  return ['invite', 'webpage', 'duplicate', star, ...(opts.isAdmin ? (['delete'] as const) : [])];
}

/**
 * The name for a copied team, or why it can't be used. iOS refuses an empty
 * name and one that exactly matches a team listed in the rail.
 */
export function duplicateNameCheck(name: string, teams: Team[]): { ok: true; value: string } | { ok: false; error: string } {
  const value = name.trim();
  if (value === '') {
    return { ok: false, error: 'Please enter a name.' };
  }
  if (activeTeams(teams).some(t => t.name === value)) {
    return { ok: false, error: 'Team name already exists.' };
  }
  return { ok: true, value };
}

export type InviteRole = 'coach' | 'follower' | 'player';

/** The invite link for a role, or '' when the team has none. */
export function inviteLink(team: Team, role: InviteRole): string {
  switch (role) {
    case 'coach':
      return team.coachLink;
    case 'follower':
      return team.followerLink;
    case 'player':
      return team.playerLink;
  }
}
