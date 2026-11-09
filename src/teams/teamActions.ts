import { saveOpponent, type OpponentSave } from '../api/opponents';
import { deleteTeam, duplicateTeam, setTeamFavourite } from '../api/teams';
import type { OpponentTeam, Team } from '../api/types';
import { removeTeamLocally, setFavouriteLocally, writeOpponent, writeTeam } from '../db/repositories';

// The team "…" menu and the opponent dialog: each call writes to the server
// first, then updates the cache so the rail changes at once. The screen then
// refreshes the lists, so the server's own answer always wins.

/** Copies a team; `renamed` says the server saved a different name than the one sent. */
export async function duplicateTeamFlow(input: {
  orgId: number;
  teamId: number;
  name: string;
}): Promise<{ team: Team; renamed: boolean }> {
  const saved = await duplicateTeam(input.teamId, input.name, input.orgId);
  writeTeam(saved);
  return { team: saved.team, renamed: saved.team.name !== input.name };
}

export async function favouriteFlow(orgId: number, teamId: number, favourite: boolean): Promise<void> {
  await setTeamFavourite(teamId, orgId, favourite);
  setFavouriteLocally(orgId, teamId, favourite);
}

export async function deleteTeamFlow(teamId: number): Promise<void> {
  await deleteTeam(teamId);
  removeTeamLocally(teamId);
}

/** Adds or renames an opponent; `renamed` as for duplicating. */
export async function saveOpponentFlow(input: OpponentSave): Promise<{ opponent: OpponentTeam; renamed: boolean }> {
  const name = input.name.trim();
  const opponent = await saveOpponent({ ...input, name });
  writeOpponent(opponent);
  return { opponent, renamed: opponent.name !== name };
}
