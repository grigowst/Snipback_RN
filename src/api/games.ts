import { rsaEncrypt } from '../utils/rsa';
import { ApiError, apiRequest } from './client';
import { ENDPOINTS } from './endpoints';
import { toInt, toNumber, toStr } from './paging';
import type { Game } from './types';

// The games list (APIManager.getAllGamesNew in iOS).

/** The list tabs built so far, with the game_type each one asks for (getGameType()). */
export const GAME_TABS = ['GAMES', 'PRACTICES', 'SCOUT'] as const;
export type GameTab = (typeof GAME_TABS)[number];

export const GAME_TYPE_FOR_TAB: Record<GameTab, number> = {
  GAMES: 1,
  PRACTICES: 0,
  SCOUT: 2,
};

/** Page size the iOS games list uses (gamesPageCountLimit). */
export const GAMES_PAGE_SIZE = 50;

type RawGame = Record<string, unknown> & {
  teamMapping?: Record<string, unknown>[] | null;
  additional_details?: Record<string, unknown> | null;
};

type GamesPage = {
  games?: RawGame[];
  game?: RawGame[];
  paging?: { next?: unknown };
};


/** One API game, mapped as Models/Games.swift maps it. */
export function mapGame(raw: RawGame): Game {
  // ObjectMapper reads id then game_id, game_date then gameDate: the later key
  // wins only when it holds a real number. game_date is a Double in iOS (the
  // API sends fractional seconds); ids are integers.
  const id = typeof raw.game_id === 'number' ? toInt(raw.game_id) : toInt(raw.id);
  const gameDate = typeof raw.gameDate === 'number' ? raw.gameDate : toNumber(raw.game_date);

  const mapping = [...(raw.teamMapping ?? [])].sort((a, b) => toInt(a.type) - toInt(b.type));
  const details = raw.additional_details ?? null;

  let status = toInt(raw.status);
  // Upload and stream both finished but status still "uploading": treat as ended.
  if (toInt(raw.upload_status_low) === 2 && toInt(raw.stream_status_low) === 2 && status === 1) {
    status = 2;
  }

  return {
    id,
    name: toStr(raw.name),
    gameDate,
    organizationId: toInt(raw.organization_id),
    userId: toInt(raw.user_id),
    status,
    gameType: toInt(raw.game_type),
    gameMode: toInt(raw.game_mode),
    category: toInt(raw.category),
    scheduleType: toInt(raw.schedule_type),
    venueType: toInt(raw.venue_type),
    uploadStatus: toInt(raw.upload_status),
    streamStatus: toInt(raw.stream_status),
    isShared: toInt(raw.is_shared),
    isDeleted: toInt(raw.is_deleted),
    isLiked: toInt(raw.isLiked),
    isBooked: toInt(raw.is_booked),
    postToWebsite: toInt(raw.post_to_website),
    facilitycamDuration: toInt(raw.facilitycam_duration),
    stateTimezoneMappingId: toInt(raw.state_timezone_mapping_id),
    teamIds: mapping.map(m => toInt(m.team_id)),
    teamNames: mapping.map(m => toStr(m.name)).join(','),
    homeTeamPoint: details ? toInt(details.home_team_point) : 0,
    awayTeamPoint: details ? toInt(details.away_team_point) : 0,
    gameResult: details ? toStr(details.game_result) : '',
    rawJson: JSON.stringify(raw),
  };
}

export type GamesQuery = {
  userId: number;
  orgId: number;
  /** The selected org is the user's HOME (role 3): the request then sends org 0. */
  isHomeUser: boolean;
  /** 0 = Org - All Teams. */
  teamId: number;
  tab: GameTab;
  page: number;
};

export function gamesRequestBody(q: GamesQuery): Record<string, unknown> {
  return {
    page: q.page,
    count: GAMES_PAGE_SIZE,
    timestamp: 0,
    search: '',
    enc_team_id: rsaEncrypt(q.teamId),
    enc_organization_id: rsaEncrypt(q.isHomeUser ? 0 : q.orgId),
    enc_userId: rsaEncrypt(q.userId),
    team_type: 1, // My Team (2 = opponent, not built yet)
    game_type: GAME_TYPE_FOR_TAB[q.tab],
  };
}

const isNoGames = (e: unknown) =>
  e instanceof ApiError && e.message.trim().toLowerCase() === 'no games found';

/** One page of a tab's games. "No games found" is an empty last page, not an error. */
export async function fetchGamesPage(q: GamesQuery): Promise<{ games: Game[]; next: number }> {
  try {
    const response = await apiRequest<GamesPage>(ENDPOINTS.GET_GAMES, {
      method: 'POST',
      body: gamesRequestBody(q),
    });
    const list = response.data?.games ?? response.data?.game ?? [];
    return { games: list.map(mapGame), next: toInt(response.data?.paging?.next) };
  } catch (e) {
    if (isNoGames(e)) {
      return { games: [], next: -1 };
    }
    throw e;
  }
}
