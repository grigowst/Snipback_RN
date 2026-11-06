import type { Team } from '../api/types';
import { sanitizeOrgName } from './orgLogic';

// The dashboard's team picker rules, from
// DashboardViewController.prepareTeamDataBasedOnOrganization() in iOS.

/** The "Org - All Teams" entry (id 0) at the top of the picker. */
export const ALL_TEAMS_ID = 0;
export const ALL_TEAMS_NAME = 'Org - All Teams';

export type TeamChoice = {
  id: number;
  name: string;
  uniqueNumber: string;
  isFavourite: number;
};

export const ALL_TEAMS: TeamChoice = {
  id: ALL_TEAMS_ID,
  name: ALL_TEAMS_NAME,
  uniqueNumber: '',
  isFavourite: 0,
};

/** Teams shown on the dashboard: not archived, not deleted, normal teams only. */
export function activeTeams(teams: Team[]): Team[] {
  return teams.filter(t => t.isArchive === 0 && t.teamType === 0 && t.isDeleted === 0);
}

/** "Org - All Teams", then the active teams sorted by name. */
export function teamPickerList(teams: Team[]): TeamChoice[] {
  const sorted = activeTeams(teams)
    .map(t => ({
      id: t.id,
      name: sanitizeOrgName(t.name),
      uniqueNumber: t.uniqueNumber,
      isFavourite: t.isFavourite,
    }))
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  return [ALL_TEAMS, ...sorted];
}

/**
 * Which team is selected when an organisation opens:
 * its only team (unless it is HOME), else the first favourite, else All Teams.
 */
export function defaultTeam(list: TeamChoice[], isHomeOrg: boolean): TeamChoice {
  if (list.length === 2) {
    return isHomeOrg ? ALL_TEAMS : list[1];
  }
  return list.find(t => t.isFavourite === 1) ?? ALL_TEAMS;
}

/** Keep the current team after a refresh if it still exists; otherwise the default. */
export function keepOrDefaultTeam(
  list: TeamChoice[],
  currentId: number | undefined,
  isHomeOrg: boolean,
): TeamChoice {
  const current = currentId === undefined ? undefined : list.find(t => t.id === currentId);
  return current ?? defaultTeam(list, isHomeOrg);
}
