import type { Organization } from '../api/types';
import { ALL_TEAMS_ID } from '../dashboard/teamLogic';
import { accessBlock, createGameBlock } from './gameForm';

// Map to Teams (MapToTeamsViewController in iOS): on the iPad hub, with
// "Org - All Teams" picked, games are ticked in the list and "+ GAME" maps
// them to one of the organisation's teams, as its own team or as another.

export const MAP_TEAM_TYPES = [
  { value: 0, type: 'my_team' as const, label: 'MY TEAM' },
  { value: 1, type: 'other_team' as const, label: 'OTHER TEAM' },
];

/** What "+ GAME" with nothing ticked says on "Org - All Teams" (iOS opens Map To Teams with no games). */
export const NOTHING_TICKED = 'Tick games to map them to a team, or pick a team to create a game.';

/**
 * Whether the list's rows can be ticked (the iPad's bulk checkbox): a club's
 * "Org - All Teams" on the tablet, its own teams (not the Opponent toggle),
 * on the GAMES, PRACTICES or SCOUT tab.
 */
export const canTickGames = (o: { isTablet: boolean; isHomeOrg: boolean; teamId: number; opponentMode: boolean }) =>
  o.isTablet && !o.isHomeOrg && o.teamId === ALL_TEAMS_ID && !o.opponentMode;

export type AddGameAction =
  | { kind: 'alert'; title: string; message: string }
  | { kind: 'create' }
  | { kind: 'map'; gameIds: number[] };

/**
 * What "+ GAME" does (AddGameBtnAction in the iOS hub): no permission or a
 * deactivated organisation first; then, on a tablet's "Org - All Teams",
 * Map to Teams for the ticked games; else the create form, or "Please choose
 * a team and continue".
 */
export function addGameAction(
  org: Organization | undefined,
  isHomeOrg: boolean,
  teamId: number,
  opts: { tickable: boolean; ticked: number[] },
): AddGameAction {
  const access = accessBlock(org);
  if (access) {
    return { kind: 'alert', ...access };
  }
  if (opts.tickable) {
    return opts.ticked.length > 0 ? { kind: 'map', gameIds: opts.ticked } : { kind: 'alert', title: '', message: NOTHING_TICKED };
  }
  const block = createGameBlock(org, isHomeOrg, teamId);
  return block ? { kind: 'alert', ...block } : { kind: 'create' };
}
