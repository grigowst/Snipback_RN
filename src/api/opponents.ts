import { ApiError, apiRequest } from './client';
import { ENDPOINTS } from './endpoints';
import { fetchAllPages, toInt, toStr } from './paging';
import type { OpponentTeam } from './types';

// An organisation's opponent teams (OpponentTeamDataHandler and
// APIManager.getOpponentTeams / createOpponentTeam / editOpponentTeam in iOS).
// An opponent is only a name: no roster, settings or games of its own.

/** Page size the iOS opponents call uses (pageItemsCount). */
const PAGE_SIZE = 400;

type RawOpponent = Record<string, unknown>;

export function mapOpponent(raw: RawOpponent, orgId: number): OpponentTeam {
  return {
    id: toInt(raw.id),
    // The opponent's own organisation when it is a real number, as for teams.
    organizationId: typeof raw.organization_id === 'number' ? raw.organization_id : orgId,
    name: toStr(raw.name),
    isDeleted: toInt(raw.is_deleted),
  };
}

export function opponentsRequestBody(userId: number, orgId: number, page: number) {
  // Plain ids, as iOS sends them; LIVE accepts this form (checked 2026-11-09).
  return { page, count: PAGE_SIZE, organization_id: orgId, user_id: userId, timestamp: 0 };
}

/** Every opponent team of an organisation (always the full list, timestamp 0). */
export async function fetchOpponents(userId: number, orgId: number): Promise<OpponentTeam[]> {
  return fetchAllPages(async page => {
    const response = await apiRequest<{ team?: RawOpponent[]; paging?: { next?: unknown } }>(
      ENDPOINTS.GET_OPPONENT_TEAMS,
      { method: 'POST', body: opponentsRequestBody(userId, orgId, page) },
    );
    return {
      items: (response.data?.team ?? []).map(raw => mapOpponent(raw, orgId)),
      next: toInt(response.data?.paging?.next),
    };
  });
}

export type OpponentSave = {
  userId: number;
  orgId: number;
  name: string;
  /** Set to rename an existing opponent; left out to add a new one. */
  opponentId?: number;
};

/**
 * Adding and renaming share one endpoint: the server updates instead of
 * inserting when `opponentteamId` is present.
 */
export function opponentSaveBody({ userId, orgId, name, opponentId }: OpponentSave) {
  const body: Record<string, unknown> = { user_id: userId, organization_id: orgId, team_name: name };
  if (opponentId !== undefined) {
    body.opponentteamId = opponentId;
  }
  return body;
}

/**
 * Adds or renames an opponent and returns it as the server saved it. When a
 * rename answers without the team (iOS allows for that), the name sent is
 * taken as saved.
 */
export async function saveOpponent(input: OpponentSave): Promise<OpponentTeam> {
  const response = await apiRequest<{ opponentTeams?: RawOpponent | RawOpponent[] }>(
    ENDPOINTS.ADD_OPPONENT_TEAM,
    { method: 'POST', body: opponentSaveBody(input) },
  );
  const reply = response.data?.opponentTeams;
  const raw = Array.isArray(reply) ? reply[0] : reply;
  if (raw && toInt(raw.id) > 0) {
    return mapOpponent(raw, input.orgId);
  }
  if (input.opponentId !== undefined) {
    return { id: input.opponentId, organizationId: input.orgId, name: input.name, isDeleted: 0 };
  }
  throw new ApiError('The opponent team was saved, but the server did not return it. Pull to refresh.');
}
