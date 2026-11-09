import { rsaEncrypt } from '../utils/rsa';
import { ApiError, apiRequest } from './client';
import { ENDPOINTS } from './endpoints';
import { toInt, toStr } from './paging';
import { mapTeam } from './teams';
import type { Person, TeamWithMembers } from './types';
import { mapPerson } from './users';

// Adding, editing and removing team members (AddUserTableViewController,
// EditUserViewController and TeamsDataHandler.updateTeam_NewMethod in iOS).
//
// A team's roster is changed by sending the WHOLE roster back to
// /api/team/update. iOS builds that list from whatever its screen holds,
// which can be a filtered subset, and sends a blank stats switch, logo and
// abbreviation; on LIVE that can drop people or reset the team. Here every
// change reads the team fresh from the server first, changes one member,
// sends everyone else back exactly as read, and refuses to send a list that
// would drop anyone.

// ---- Reading one team -----------------------------------------------------

/** A team as the server has it right now, with what a roster update must resend. */
export type FreshTeam = {
  team: TeamWithMembers;
  name: string;
  statEnable: number;
  logoUrl: string;
  abbr: string;
};

type TeamsReply = { team?: Record<string, unknown>[] | Record<string, unknown> | null };

const teamRows = (data: TeamsReply | undefined): Record<string, unknown>[] => {
  const t = data?.team;
  if (Array.isArray(t)) {
    return t;
  }
  return t && typeof t === 'object' ? [t] : [];
};

function toFreshTeam(raw: Record<string, unknown>): FreshTeam {
  const team = mapTeam(raw as Parameters<typeof mapTeam>[0], toInt(raw.organization_id));
  return {
    team,
    name: toStr(raw.name),
    statEnable: toInt(raw.stat_enable),
    logoUrl: toStr(raw.logo_url),
    abbr: toStr(raw.abbr),
  };
}

/**
 * One team, read fresh (getMyTeamsByIds). The server needs the ids encrypted
 * (`enc_teamIds`; iOS's plain `teamIds` is refused on LIVE), and it answers
 * with a list of the user's teams that includes the one asked for, so the
 * team is picked out by id.
 */
export async function fetchTeamFresh(userId: number, teamId: number): Promise<FreshTeam> {
  const response = await apiRequest<TeamsReply>(ENDPOINTS.GET_TEAMS_BY_IDS, {
    method: 'POST',
    body: { enc_teamIds: rsaEncrypt(String(teamId)), enc_userId: rsaEncrypt(userId) },
  });
  const raw = teamRows(response.data).find(row => toInt(row.id) === teamId);
  if (!raw) {
    throw new ApiError("Couldn't load this team from the server. Please try again.");
  }
  return toFreshTeam(raw);
}

// ---- Sending a roster -----------------------------------------------------

/** One member's place in a roster update. */
export type RosterEntry = { userId: number; roleId: number; jerseyNumber: number };

/**
 * The roster to send: the fresh roster with one member added or changed.
 * Everyone else keeps their team role and jersey exactly as the server has
 * them (iOS re-sends organisation roles instead, flattening team roles).
 */
export function rosterWith(fresh: FreshTeam, change: RosterEntry): RosterEntry[] {
  const entries: RosterEntry[] = fresh.team.members.map(m => ({
    userId: m.userId,
    roleId: m.roleId,
    jerseyNumber: m.jerseyNumber,
  }));
  const index = entries.findIndex(e => e.userId === change.userId);
  if (index >= 0) {
    entries[index] = change;
  } else {
    entries.push(change);
  }
  return entries;
}

/**
 * The safety rule: everyone on the fresh roster must still be in the list
 * being sent. Throws instead of sending a list that would drop someone.
 */
export function assertNobodyDropped(fresh: FreshTeam, entries: RosterEntry[]): void {
  const sending = new Set(entries.map(e => e.userId));
  const dropped = fresh.team.members.filter(m => !sending.has(m.userId));
  if (dropped.length > 0) {
    throw new ApiError(
      `Not saved: the change would have removed ${dropped.length} member(s) from the team.`,
    );
  }
  if (sending.size !== entries.length) {
    throw new ApiError('Not saved: the team list had someone twice.');
  }
}

/** The /api/team/update body, in iOS's format: comma-joined strings, same order. */
export function rosterUpdateBody(fresh: FreshTeam, entries: RosterEntry[]) {
  return {
    enc_id: rsaEncrypt(fresh.team.team.id),
    name: fresh.name,
    playersList: entries.map(e => e.userId).join(','),
    playersRole: entries.map(e => e.roleId).join(','),
    playerJerseyNumbers: entries.map(e => e.jerseyNumber).join(','),
    deletedPlayers: '',
    // The team's own settings, as read: iOS sends 0 / '' here, resetting them.
    stat_enable: fresh.statEnable,
    logo_url: fresh.logoUrl,
    abbr: fresh.abbr,
  };
}

/** Sends a full roster; returns the team as the server now has it. */
export async function sendRoster(fresh: FreshTeam, entries: RosterEntry[]): Promise<TeamWithMembers> {
  assertNobodyDropped(fresh, entries);
  const teamId = fresh.team.team.id;
  const response = await apiRequest<TeamsReply>(ENDPOINTS.UPDATE_TEAM, {
    method: 'POST',
    body: rosterUpdateBody(fresh, entries),
  });
  const rows = teamRows(response.data);
  const raw = rows.find(row => toInt(row.id) === teamId) ?? rows[0];
  if (!raw) {
    throw new ApiError('The team was saved, but the server sent no team back. Pull to refresh.');
  }
  return toFreshTeam(raw).team;
}

// ---- A member's details ---------------------------------------------------

export type MemberProfileInput = {
  /** The member being changed. */
  memberId: number;
  orgId: number;
  name: string;
  /** Their organisation role (newrole): always the real one, never a guess. */
  roleId: number;
  /** The team the editor was opened on, or 0. */
  teamId: number;
};

export function memberProfileBody({ memberId, orgId, name, roleId, teamId }: MemberProfileInput) {
  return {
    name,
    enc_id: rsaEncrypt(memberId),
    newrole: roleId,
    teamList: teamId > 0 ? String(teamId) : '',
    enc_organization_id: rsaEncrypt(orgId),
  };
}

/** Saves a member's name and organisation role (updateUser). */
export async function updateMemberProfile(input: MemberProfileInput): Promise<void> {
  await apiRequest(ENDPOINTS.UPDATE_USER, { method: 'POST', body: memberProfileBody(input) });
}

// ---- Removing -------------------------------------------------------------

export type RemoveMemberInput = { memberId: number; orgId: number; teamId: number };

/** team_id is a plain number: a team removes them from that team, 0 from the organisation. */
export function removeMemberBody({ memberId, orgId, teamId }: RemoveMemberInput) {
  return {
    enc_user_id: rsaEncrypt(memberId),
    team_id: teamId,
    enc_organization_id: rsaEncrypt(orgId),
  };
}

export async function removeMember(input: RemoveMemberInput): Promise<void> {
  await apiRequest(ENDPOINTS.REMOVE_USER, { method: 'POST', body: removeMemberBody(input) });
}

// ---- Adding ---------------------------------------------------------------

/** Everyone on Snipback whose name or email matches (searchUser). */
export async function searchPeople(text: string): Promise<Person[]> {
  const response = await apiRequest<{ players?: Record<string, unknown>[] }>(ENDPOINTS.SEARCH_USERS, {
    method: 'POST',
    body: { search: text },
  });
  return (response.data?.players ?? []).map(mapPerson).filter(p => p.id > 0);
}

export type AddMemberInput = {
  email: string;
  name: string;
  roleId: number;
  /** A team to put them on, or 0 for the organisation only. */
  teamId: number;
  /** The signed-in user. */
  createdBy: number;
  orgId: number;
  /** Added to the invitation email. */
  message: string;
};

export function addMemberBody(input: AddMemberInput) {
  return {
    email: input.email,
    name: input.name,
    avatar: '',
    teamList: input.teamId > 0 ? String(input.teamId) : '',
    enc_createdby: rsaEncrypt(input.createdBy),
    enc_organization_id: rsaEncrypt(input.orgId),
    roleId: input.roleId,
    customMsg: input.message,
  };
}

/**
 * Adds someone to the organisation (and team), inviting them by email when
 * they have no Snipback account. Returns the person, whose id the roster
 * update needs.
 */
export async function addMember(input: AddMemberInput): Promise<Person> {
  const response = await apiRequest<{ user?: Record<string, unknown> }>(ENDPOINTS.ADD_USER, {
    method: 'POST',
    body: addMemberBody(input),
  });
  const person = response.data?.user ? mapPerson(response.data.user) : null;
  if (!person || person.id <= 0) {
    throw new ApiError('The server did not return the new member.');
  }
  return person;
}
