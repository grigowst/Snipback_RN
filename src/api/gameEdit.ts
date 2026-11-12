import { rsaEncrypt } from '../utils/rsa';
import { ApiError, apiRequest } from './client';
import { ENDPOINTS } from './endpoints';
import { mapGame } from './games';
import { toInt, toNumber, toStr } from './paging';
import type { Game } from './types';

// One game read fresh, edited, its home / away mapping, and deleting it
// (APIManager getGame, editGame, listStatHomeAndAwayTeamsWithGameId,
// saveStatGameTeamMapping, editStatGameTeamMapping and deleteGame in iOS).

export type RawGame = Parameters<typeof mapGame>[0];

const pickGame = (data: { games?: RawGame[]; game?: RawGame | RawGame[] } | undefined): RawGame | null => {
  if (data?.games && data.games.length > 0) {
    return data.games[0];
  }
  const game = data?.game;
  return (Array.isArray(game) ? game[0] : game) ?? null;
};

/** The server's copy of a game (/api/getGame): the game, and the row as sent. */
export async function fetchGame(gameId: number): Promise<{ game: Game; raw: RawGame }> {
  const response = await apiRequest<{ games?: RawGame[]; game?: RawGame | RawGame[] }>(ENDPOINTS.GET_GAME, {
    method: 'POST',
    body: { enc_id: rsaEncrypt(gameId) },
  });
  const raw = pickGame(response.data);
  if (!raw || mapGame(raw).id !== gameId) {
    throw new ApiError('The game could not be read. Pull to refresh and try again.');
  }
  return { game: mapGame(raw), raw };
}

// ---- Home and away ---------------------------------------------------------

/** One side of a game (GameTeamMapping in iOS: the team's id comes as "id"). */
export type StatTeam = {
  teamId: number;
  name: string;
  /** 0 = a SnipBack team, 1 = a name-only one; null when the server sends none. */
  teamType: number | null;
  /** A name-only opponent of the organisation. */
  isOpponent: boolean;
  homeColor: string;
  awayColor: string;
};

export type VolleyRotation = { period: number; current_rotation_home: number; current_rotation_away: number };

/** The game's home and away teams (StatHomeAndAway in iOS). */
export type StatHomeAway = {
  home: StatTeam[];
  away: StatTeam[];
  /** 1 = home, 2 = away, 0 = none saved. */
  venueType: number;
  /** The mapping's id; 0 = the game has none. */
  mappingId: number;
  /** Stats already taken for the game: the opponent can't be changed then. */
  statCount: number;
  rotation: VolleyRotation[];
};

const intOrNull = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : toInt(v));

function mapStatTeam(d: Record<string, unknown>): StatTeam {
  return {
    teamId: toInt(d.id),
    name: toStr(d.name),
    teamType: intOrNull(d.team_type),
    isOpponent: toInt(d.is_opponent) === 1,
    // iOS's model starts both colours at black.
    homeColor: d.myteam_color_code === undefined || d.myteam_color_code === null ? '#000000' : toStr(d.myteam_color_code),
    awayColor: d.oppo_color_code === undefined || d.oppo_color_code === null ? '#000000' : toStr(d.oppo_color_code),
  };
}

const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);

export function mapStatHomeAway(raw: Record<string, unknown> | undefined): StatHomeAway {
  const d = raw ?? {};
  return {
    home: list(d.home).map(mapStatTeam),
    away: list(d.away).map(mapStatTeam),
    venueType: toInt(d.venue_type),
    mappingId: toInt(d.mapping_id),
    statCount: toInt(d.stat_count),
    rotation: list(d.volley_game_rotation).map(r => ({
      period: toInt(r.period),
      current_rotation_home: toInt(r.current_rotation_home),
      current_rotation_away: toInt(r.current_rotation_away),
    })),
  };
}

/** Volleyball, tennis and football have their own home / away lists. */
export function statHomeAwayEndpoint(category: number): string {
  switch (category) {
    case 5:
      return ENDPOINTS.LIST_VOLLEYBALL_HOME_AWAY_TEAMS;
    case 6:
      return ENDPOINTS.LIST_TENNIS_HOME_AWAY_TEAMS;
    case 7:
      return ENDPOINTS.LIST_FOOTBALL_HOME_AWAY_TEAMS;
    default:
      return ENDPOINTS.LIST_STAT_HOME_AWAY_TEAMS;
  }
}

/** The game's home and away teams, venue and stat mapping (a plain game_id). */
export async function fetchStatHomeAway(gameId: number, category: number): Promise<StatHomeAway> {
  const response = await apiRequest<Record<string, unknown> | Record<string, unknown>[]>(statHomeAwayEndpoint(category), {
    method: 'POST',
    body: { game_id: gameId },
  });
  const data = response.data;
  return mapStatHomeAway(Array.isArray(data) ? data[0] : data);
}

// ---- Writes ----------------------------------------------------------------

/** Saves an edited game (/api/game/updateGame) and returns the row the server sent back. */
export async function updateGame(body: Record<string, unknown>): Promise<RawGame> {
  const response = await apiRequest<{ games?: RawGame[]; game?: RawGame | RawGame[] }>(ENDPOINTS.GAME_UPDATE_GAME, {
    method: 'POST',
    body,
  });
  return pickGame(response.data) ?? {};
}

export async function editStatMapping(body: Record<string, unknown>): Promise<void> {
  await apiRequest(ENDPOINTS.EDIT_STAT_GAME_TEAM_MAPPING, { method: 'POST', body });
}

export async function saveStatMapping(body: Record<string, unknown>): Promise<void> {
  await apiRequest(ENDPOINTS.SAVE_STAT_GAME_TEAMS_MAPPING, { method: 'POST', body });
}

/** 0 moves the game to Deleted Film (what the games list does); 1 deletes it for good. */
export async function deleteGame(gameId: number, flag: 0 | 1): Promise<void> {
  await apiRequest(ENDPOINTS.DELETE_GAMES, {
    method: 'POST',
    body: { enc_id: rsaEncrypt(gameId), deleteGameFlag: flag },
  });
}

/** A number the row holds, or the fallback when it has none. */
export const rawNumber = (raw: RawGame, key: string, fallback = 0): number =>
  raw[key] === undefined || raw[key] === null || raw[key] === '' ? fallback : toNumber(raw[key]);
