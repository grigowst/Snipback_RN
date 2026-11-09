import { rsaEncrypt } from '../utils/rsa';
import { ApiError, apiRequest } from './client';
import { ENDPOINTS } from './endpoints';
import { mapGame } from './games';
import { toInt, toStr } from './paging';
import type { Game } from './types';

// Creating a game (CreateGameVM / GameDataHandler / APIManager.createGame in
// iOS), with the lists its form needs: the venue time zones and the opponent
// search.

// ---- Venue time zones -----------------------------------------------------

/** One row of the server's state → time zone table (StateTimeZone in iOS). */
export type StateTimeZone = {
  id: number;
  stateName: string;
  stateShortCode: string;
  timeZoneName: string;
  /** The IANA zone, e.g. "America/Chicago" (the server's php_equivalent). */
  identifier: string;
  gmtValue: string;
};

/** The label the web app's list shows, e.g. "Alabama(AL) - Central Standard Time(GMT-06:00)". */
export const zoneLabel = (z: StateTimeZone) => `${z.stateName}(${z.stateShortCode}) - ${z.timeZoneName}(${z.gmtValue})`;

/**
 * The time zone table, and the organisation's own zone (`selected`, 0 when it
 * has none). A GET with the organisation id, plain, in the query.
 */
export async function fetchTimeZones(orgId: number): Promise<{ zones: StateTimeZone[]; selected: number }> {
  const response = await apiRequest<{ states_and_timezone?: Record<string, unknown>[]; selected?: unknown }>(
    ENDPOINTS.GET_STATES_AND_TIMEZONE,
    { method: 'GET', query: orgId > 0 ? { organization_id: orgId } : undefined },
  );
  const zones: StateTimeZone[] = [];
  for (const row of response.data?.states_and_timezone ?? []) {
    const id = toInt(row.id);
    const identifier = toStr(row.php_equivalent);
    if (id > 0 && identifier !== '') {
      zones.push({
        id,
        stateName: toStr(row.state_name),
        stateShortCode: toStr(row.state_short_code),
        timeZoneName: toStr(row.time_zone),
        identifier,
        gmtValue: toStr(row.gmt_value),
      });
    }
  }
  return { zones, selected: toInt(response.data?.selected) };
}

// ---- The opponent search --------------------------------------------------

/** A SnipBack team found by the search (OpponentSearchRow in iOS). */
export type OpponentTeamRow = {
  teamId: number;
  /** "School · Program · Team". */
  label: string;
  schoolName: string;
  programOrgId: number;
  sport: string;
  gender: string;
  isOlder: boolean;
  sameSchool: boolean;
};

/** One of the school's opponents that isn't a SnipBack team (OpponentNamedRow in iOS). */
export type NamedOpponentRow = { opponentId: number; name: string; abbr: string };

export type OpponentSearch = {
  /** The program's opponent directory (its opponents linked to a SnipBack team). */
  directory: OpponentTeamRow[];
  results: OpponentTeamRow[];
  /** Name-only opponents (the first page only). */
  named: NamedOpponentRow[];
  page: number;
  hasMore: boolean;
};

const flag = (v: unknown) => v === true || toInt(v) === 1;

function mapTeamRow(d: Record<string, unknown>): OpponentTeamRow | null {
  const teamId = toInt(d.team_id);
  if (teamId <= 0) {
    return null;
  }
  return {
    teamId,
    label: toStr(d.label) || [d.school_name, d.program_name, d.team_name].map(toStr).filter(Boolean).join(' · '),
    schoolName: toStr(d.school_name),
    programOrgId: toInt(d.program_org_id),
    sport: toStr(d.sport),
    gender: toStr(d.gender),
    isOlder: flag(d.is_older),
    sameSchool: flag(d.same_school),
  };
}

function mapNamedRow(d: Record<string, unknown>): NamedOpponentRow | null {
  const opponentId = toInt(d.opponent_id);
  const name = toStr(d.name).trim();
  return opponentId > 0 && name !== '' ? { opponentId, name, abbr: toStr(d.abbr) } : null;
}

export type OpponentQuery = {
  orgId: number;
  query: string;
  /** The game's sport, or 0 for every sport. */
  sportId: number;
  includeOlder: boolean;
  /** The game's own team, left out. */
  excludeTeamIds: number[];
  page: number;
};

export function opponentSearchBody(q: OpponentQuery) {
  const body: Record<string, unknown> = {
    enc_organization_id: rsaEncrypt(q.orgId),
    q: q.query,
    purpose: 'opponent',
    include_older: q.includeOlder ? 1 : 0,
    page: q.page,
  };
  if (q.sportId > 0) {
    body.sport_category_id = q.sportId;
  }
  const exclude = q.excludeTeamIds.filter(id => id > 0);
  if (exclude.length > 0) {
    body.exclude_team_ids = exclude.join(',');
  }
  return body;
}

/** The SnipBack team search (/api/filmExchange/destinations, purpose "opponent"). */
export async function searchOpponents(q: OpponentQuery): Promise<OpponentSearch> {
  const response = await apiRequest<Record<string, unknown>>(ENDPOINTS.OPPONENT_TEAM_SEARCH, {
    method: 'POST',
    body: opponentSearchBody(q),
  });
  const d = response.data ?? {};
  const rows = (key: string) =>
    (Array.isArray(d[key]) ? (d[key] as Record<string, unknown>[]) : [])
      .map(mapTeamRow)
      .filter((r): r is OpponentTeamRow => r !== null);
  return {
    directory: rows('directory'),
    results: rows('results'),
    named: (Array.isArray(d.named) ? (d.named as Record<string, unknown>[]) : [])
      .map(mapNamedRow)
      .filter((r): r is NamedOpponentRow => r !== null),
    page: toInt(d.page) || q.page,
    hasMore: flag(d.has_more),
  };
}

// ---- Create ---------------------------------------------------------------

/** Creates a game (/api/game/saveGame) and returns it as the server saved it. */
export async function createGame(body: Record<string, unknown>): Promise<Game> {
  const response = await apiRequest<{ game?: Record<string, unknown> | Record<string, unknown>[] }>(
    ENDPOINTS.CREATE_GAME,
    { method: 'POST', body },
  );
  const reply = response.data?.game;
  const raw = Array.isArray(reply) ? reply[0] : reply;
  if (!raw || toInt(raw.id ?? raw.game_id) <= 0) {
    throw new ApiError('The game was created, but the server did not return it. Pull to refresh.');
  }
  return mapGame(raw as Parameters<typeof mapGame>[0]);
}
