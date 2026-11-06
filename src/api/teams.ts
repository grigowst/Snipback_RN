import { rsaEncrypt } from '../utils/rsa';
import { apiRequest } from './client';
import { ENDPOINTS } from './endpoints';
import { fetchAllPages, toInt, toStr } from './paging';
import type { TeamMember, TeamWithMembers } from './types';

// An organisation's teams with their rosters
// (APIManager.getMyTeams + TeamsDataHandler.getAllTeamsByPageAPI in iOS).

/** Page size the iOS teams call uses. */
const PAGE_SIZE = 250;

type RawTeam = Record<string, unknown> & { players_list?: Record<string, unknown>[] | null };

type TeamsPage = {
  // The iOS TeamAPIResponse reads the list from "team".
  team?: RawTeam[];
  paging?: { next?: unknown };
};

/** One API team, mapped the way Models/Team.swift maps it. */
export function mapTeam(raw: RawTeam, orgId: number): TeamWithMembers {
  const id = toInt(raw.id);
  // The team's own organisation (as iOS stores it); only a real number counts.
  const organizationId = typeof raw.organization_id === 'number' ? raw.organization_id : orgId;
  const members: TeamMember[] = (raw.players_list ?? []).map(p => ({
    teamId: id,
    // iOS takes the mapping's org from the team.
    orgId: organizationId,
    userId: toInt(p.user_id),
    userName: toStr(p.name),
    userEmail: toStr(p.email),
    roleId: toInt(p.role_id),
    jerseyNumber: toInt(p.jersey_number),
  }));
  return {
    team: {
      id,
      organizationId,
      name: toStr(raw.name),
      teamType: toInt(raw.team_type),
      isDeleted: toInt(raw.is_deleted),
      isArchive: toInt(raw.is_archive),
      isFavourite: toInt(raw.is_favourite),
      uniqueNumber: toStr(raw.unique_number),
      organizationName: toStr(raw.organization_name),
      logoUrl: toStr(raw.logo_url),
      abbr: toStr(raw.abbr),
      noOfPlayers: toInt(raw.no_of_players),
    },
    members,
  };
}

/**
 * Every team of an organisation. Always a full list (timestamp 0) so the
 * cache can drop teams that are gone; delta sync can come later.
 */
export async function fetchTeams(userId: number, orgId: number): Promise<TeamWithMembers[]> {
  const encUserId = rsaEncrypt(userId);
  return fetchAllPages(async page => {
    const response = await apiRequest<TeamsPage>(ENDPOINTS.GET_MY_TEAMS, {
      method: 'POST',
      body: {
        count: PAGE_SIZE,
        page,
        organization_id: orgId,
        enc_user_id: encUserId,
        timestamp: 0,
      },
    });
    return {
      items: (response.data?.team ?? []).map(raw => mapTeam(raw, orgId)),
      next: toInt(response.data?.paging?.next),
    };
  });
}
