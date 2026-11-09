import { rsaEncrypt } from '../utils/rsa';
import { ApiError, apiRequest } from './client';
import { ENDPOINTS } from './endpoints';
import { assertNobodyDropped, postTeamUpdate, type FreshTeam, type RosterEntry } from './members';
import { fetchAllPages, toInt, toStr } from './paging';
import { mapTeam } from './teams';
import type { TeamWithMembers } from './types';

// Creating and editing a team (V2CreateTeamViewController,
// TeamDefaultsTableViewController and their APIManager calls in iOS): the
// sports list, a team's home/away game defaults, create and update.

// ---- Sports (game categories) ---------------------------------------------

export type Category = { id: number; name: string };

/** Page size the iOS categories call uses (pageItemsCount). */
const CATEGORY_PAGE_SIZE = 400;

/** Every sport (listGameCategories; the full list, timestamp 0). */
export async function fetchCategories(): Promise<Category[]> {
  return fetchAllPages(async page => {
    const response = await apiRequest<{ categories?: Record<string, unknown>[]; paging?: { next?: unknown } }>(
      ENDPOINTS.LIST_CATEGORIES,
      { method: 'POST', body: { count: CATEGORY_PAGE_SIZE, page, timestamp: 0 } },
    );
    return {
      items: (response.data?.categories ?? []).map(c => ({ id: toInt(c.id), name: toStr(c.category_name) })),
      next: toInt(response.data?.paging?.next),
    };
  });
}

// ---- Home and away game defaults ------------------------------------------

/**
 * One of a team's two game defaults (TeamSettings in iOS): what a new game
 * for the team starts with, at home (venueType 1) or away (2).
 */
export type TeamDefaults = {
  venueType: 1 | 2;
  /** 2 = Scout, 0 = Practice, 1 = Game. */
  gameType: number;
  category: number;
  /** 2 = enabled, 0 = disabled. */
  isLiveBroadcasting: number;
  /** Public snipping: 1 = public, 0 = private. */
  publicSnipping: number;
  postToWebsite: number;
  statreportVisibility: number;
  /** 0 = off, 1 = on (centre view), 2 = on (corner view). */
  balltracking: number;
  facilitycamUniqueIds: string;
  facilitycamDuration: number;
  facilitycamRoomId: number;
};

/** A new team's defaults, as iOS's TeamSettings() starts them. */
export function newTeamDefaults(venueType: 1 | 2, category: number): TeamDefaults {
  return {
    venueType,
    gameType: 1,
    category,
    isLiveBroadcasting: 0,
    publicSnipping: 1,
    postToWebsite: 1,
    statreportVisibility: 1,
    balltracking: 0,
    facilitycamUniqueIds: '',
    facilitycamDuration: 0,
    facilitycamRoomId: 0,
  };
}

export function mapDefaults(raw: Record<string, unknown>): TeamDefaults {
  return {
    venueType: toInt(raw.type) === 2 ? 2 : 1,
    gameType: toInt(raw.game_type),
    category: toInt(raw.category),
    isLiveBroadcasting: toInt(raw.isLiveBroadcasting),
    publicSnipping: toInt(raw.public),
    postToWebsite: toInt(raw.post_to_website),
    statreportVisibility: toInt(raw.statreport_visibility),
    balltracking: toInt(raw.balltracking),
    facilitycamUniqueIds: toStr(raw.facilitycam_unique_ids),
    facilitycamDuration: toInt(raw.facilitycam_duration),
    facilitycamRoomId: toInt(raw.facilitycam_room_id),
  };
}

export type HomeAway = { home: TeamDefaults; away: TeamDefaults };

/**
 * A team's saved defaults (listDefaultSettings). Both rows must be there;
 * nothing is made up for a missing one (saving made-up rows would overwrite
 * the team's real defaults).
 */
export async function fetchTeamDefaults(teamId: number): Promise<HomeAway> {
  const response = await apiRequest<{ default_settings?: Record<string, unknown>[] }>(
    ENDPOINTS.LIST_DEFAULT_SETTINGS,
    { method: 'POST', body: { enc_team_id: rsaEncrypt(teamId) } },
  );
  const rows = (response.data?.default_settings ?? []).map(mapDefaults);
  const home = rows.find(r => r.venueType === 1);
  const away = rows.find(r => r.venueType === 2);
  if (!home || !away) {
    throw new ApiError("This team's game defaults couldn't be read.");
  }
  return { home, away };
}

/** A defaults row as the server takes it. iOS's create sends no facility-camera fields. */
function defaultsRow(d: TeamDefaults, category: number, withFacility: boolean) {
  const row: Record<string, unknown> = {
    game_type: d.gameType,
    category,
    isLiveBroadcasting: d.isLiveBroadcasting,
    public: d.publicSnipping,
    post_to_website: d.postToWebsite,
    statreport_visibility: d.statreportVisibility,
    balltracking: d.balltracking,
    type: d.venueType,
  };
  if (withFacility) {
    row.facilitycam_duration = d.facilitycamDuration;
    row.facilitycam_room_id = d.facilitycamRoomId;
    row.facilitycam_unique_ids = d.facilitycamUniqueIds;
  }
  return row;
}

/** Both rows carry the home row's sport, as iOS's saveTeamSettings sends them. */
export function defaultsList(defaults: HomeAway, withFacility: boolean) {
  const category = defaults.home.category;
  return [defaultsRow(defaults.home, category, withFacility), defaultsRow(defaults.away, category, withFacility)];
}

export function saveDefaultsBody(teamId: number, defaults: HomeAway) {
  return { enc_team_id: rsaEncrypt(teamId), default_settings: defaultsList(defaults, true) };
}

/** Saves a team's home and away defaults (saveDefaultSettings). */
export async function saveTeamDefaults(teamId: number, defaults: HomeAway): Promise<void> {
  await apiRequest(ENDPOINTS.SAVE_TEAM_SETTINGS, { method: 'POST', body: saveDefaultsBody(teamId, defaults) });
}

// ---- Create ---------------------------------------------------------------

export type NewTeam = {
  /** The signed-in user (enc_created_by). */
  userId: number;
  orgId: number;
  name: string;
  abbr: string;
  statEnable: number;
  members: RosterEntry[];
  defaults: HomeAway;
};

/** The /api/team/create body, as iOS sends it (no logo: uploads aren't built). */
export function createTeamBody(t: NewTeam) {
  return {
    name: t.name,
    enc_created_by: rsaEncrypt(t.userId),
    enc_organization_id: rsaEncrypt(t.orgId),
    playersList: t.members.map(m => m.userId).join(','),
    playersRole: t.members.map(m => m.roleId).join(','),
    playerJerseyNumbers: t.members.map(m => m.jerseyNumber).join(','),
    stat_enable: t.statEnable,
    logo_url: '',
    abbr: t.abbr,
    default_settings: defaultsList(t.defaults, false),
  };
}

/** Creates a team; returns it as the server saved it. */
export async function createTeam(t: NewTeam): Promise<TeamWithMembers> {
  const response = await apiRequest<{ team?: Record<string, unknown> | Record<string, unknown>[] }>(
    ENDPOINTS.CREATE_TEAM,
    { method: 'POST', body: createTeamBody(t) },
  );
  const reply = response.data?.team;
  const raw = Array.isArray(reply) ? reply[0] : reply;
  if (!raw || toInt(raw.id) <= 0) {
    throw new ApiError('The team was created, but the server did not return it. Pull to refresh.');
  }
  return mapTeam(raw as Parameters<typeof mapTeam>[0], t.orgId);
}

// ---- Update ---------------------------------------------------------------

/** The team's own fields the editor changes. */
export type TeamFields = { name: string; abbr: string; statEnable: number };

/**
 * /api/team/update from the editor: the roster (everyone kept as read, the
 * people added, without the people removed), the removed ids in
 * deletedPlayers as iOS sends them, the team's fields, and the logo as read
 * (iOS sends an empty logo unless a new one was uploaded, removing it).
 */
export function teamUpdateBody(fresh: FreshTeam, fields: TeamFields, entries: RosterEntry[], removed: number[]) {
  return {
    enc_id: rsaEncrypt(fresh.team.team.id),
    name: fields.name,
    playersList: entries.map(e => e.userId).join(','),
    playersRole: entries.map(e => e.roleId).join(','),
    playerJerseyNumbers: entries.map(e => e.jerseyNumber).join(','),
    deletedPlayers: removed.join(','),
    stat_enable: fields.statEnable,
    logo_url: fresh.logoUrl,
    abbr: fields.abbr,
  };
}

/**
 * Sends the editor's team update after the safety check: only the people
 * the user removed may be missing, and nobody may be there twice.
 */
export async function sendTeamUpdate(
  fresh: FreshTeam,
  fields: TeamFields,
  entries: RosterEntry[],
  removed: number[],
): Promise<TeamWithMembers> {
  assertNobodyDropped(fresh, entries, removed);
  return postTeamUpdate(fresh.team.team.id, teamUpdateBody(fresh, fields, entries, removed));
}
