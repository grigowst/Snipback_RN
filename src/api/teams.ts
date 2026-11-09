import { rsaEncrypt } from '../utils/rsa';
import { ApiError, apiRequest } from './client';
import { ENDPOINTS } from './endpoints';
import { fetchAllPages, toInt, toStr } from './paging';
import type { TeamMember, TeamWithMembers } from './types';

// An organisation's teams with their rosters
// (APIManager.getMyTeams + TeamsDataHandler.getAllTeamsByPageAPI in iOS).

/** Page size the iOS teams call uses. */
const PAGE_SIZE = 250;

/** A member with no jersey number (defaultJerseyNo in iOS). */
export const DEFAULT_JERSEY = 9999;

/**
 * A jersey number from the API. Anything that isn't a usable whole number
 * (missing, empty, text, or too big for JavaScript, like the Int64.max values
 * on LIVE) becomes the default 9999. A real 0 from the server is kept.
 */
export function toJersey(value: unknown): number {
  if (value === null || value === undefined || String(value).trim() === '') {
    return DEFAULT_JERSEY;
  }
  const n = typeof value === 'number' ? Math.trunc(value) : Number(String(value).trim());
  return Number.isSafeInteger(n) ? n : DEFAULT_JERSEY;
}

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
    jerseyNumber: toJersey(p.jersey_number),
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
      playerLink: toStr(raw.sharecode_short_url),
      coachLink: toStr(raw.short_url_coach),
      followerLink: toStr(raw.short_url_follower),
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

// ---- The team "…" menu (TeamsDataHandler / APIManager in iOS) ---------------

export function duplicateTeamBody(teamId: number, name: string) {
  return { enc_team_id: rsaEncrypt(teamId), name };
}

/**
 * Copies a team under a new name and returns the new team as the server
 * saved it (its name may differ from the one sent).
 */
export async function duplicateTeam(teamId: number, name: string, orgId: number): Promise<TeamWithMembers> {
  const response = await apiRequest<{ team?: RawTeam | RawTeam[] }>(ENDPOINTS.DUPLICATE_TEAM, {
    method: 'POST',
    body: duplicateTeamBody(teamId, name),
  });
  const reply = response.data?.team;
  const raw = Array.isArray(reply) ? reply[0] : reply;
  if (!raw || toInt(raw.id) <= 0) {
    throw new ApiError('The team was copied, but the server did not return it. Pull to refresh.');
  }
  return mapTeam(raw, orgId);
}

export function favouriteBody(teamId: number, orgId: number) {
  // Plain ids, as iOS sends them.
  return { team_id: teamId, organization_id: orgId };
}

/** Stars or unstars a team for the signed-in user. */
export async function setTeamFavourite(teamId: number, orgId: number, favourite: boolean): Promise<void> {
  await apiRequest(favourite ? ENDPOINTS.FAVOURITE_TEAM : ENDPOINTS.UNFAVOURITE_TEAM, {
    method: 'POST',
    body: favouriteBody(teamId, orgId),
  });
}

export function deleteTeamBody(teamId: number) {
  return { enc_id: rsaEncrypt(teamId) };
}

/** Deletes a team (admins only). */
export async function deleteTeam(teamId: number): Promise<void> {
  await apiRequest(ENDPOINTS.DELETE_TEAM, { method: 'POST', body: deleteTeamBody(teamId) });
}
