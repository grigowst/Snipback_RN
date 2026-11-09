import { deleteGame, editStatMapping, fetchGame, fetchStatHomeAway, saveStatMapping, updateGame, type RawGame } from '../api/gameEdit';
import { mapGame } from '../api/games';
import { toInt } from '../api/paging';
import type { Game } from '../api/types';
import { markGameDeleted, upsertGame } from '../db/repositories';
import {
  editGameBody,
  editSourceOf,
  savedGameRow,
  statMappingWrite,
  type EditContext,
  type EditSource,
} from './gameEditRules';
import type { GameForm } from './gameForm';

// What the game menu does (GamesViewController's menu handlers in iOS).

/**
 * Edit Game: the game and its home / away teams, read fresh before the form
 * opens. iOS edits the row the games list synced (and reads only the zone
 * from the server's copy), so any field the fresh copy leaves out falls back
 * to the listed row: an unchanged edit must never send a blank price,
 * camera booking or team list.
 */
export async function loadEditSource(row: Game, isHomeOrg: boolean): Promise<EditSource> {
  const fresh = await fetchGame(row.id);
  let listed: RawGame = {};
  try {
    listed = JSON.parse(row.rawJson) as RawGame;
  } catch {
    // No listed row to fall back on: the fresh copy alone.
  }
  const raw: RawGame = { ...listed, ...fresh.raw };
  const game = mapGame(raw);
  const stat = await fetchStatHomeAway(game.id, game.category);
  return editSourceOf(game, raw, stat, isHomeOrg);
}

export type EditResult = {
  /** The game as saved, when the server sent it back (it is stored). */
  game: Game | null;
  /** The game was saved but its home / away teams were not: the server's reason. */
  teamsError: string | null;
};

/**
 * Saves an edit: the game, then its home / away mapping. Both bodies are
 * built before the first write. If the game saves and the mapping doesn't,
 * the game is not sent again; the caller says what happened.
 */
export async function editGameFlow(opts: { form: GameForm; src: EditSource; ctx: EditContext }): Promise<EditResult> {
  if (opts.form.name.trim() === '') {
    throw new Error('Please enter a name.');
  }
  const body = editGameBody(opts.form, opts.src, opts.ctx);
  const second = statMappingWrite(opts.form, opts.src);

  const reply = await updateGame(body);
  let game: Game | null = null;
  if (toInt(reply.id ?? reply.game_id) > 0) {
    game = savedGameRow(opts.src, reply, body);
    upsertGame(game);
  }

  let teamsError: string | null = null;
  if (second) {
    try {
      await (second.kind === 'edit' ? editStatMapping(second.body) : saveStatMapping(second.body));
    } catch (e) {
      teamsError = e instanceof Error ? e.message : 'The server did not answer.';
    }
  }
  return { game, teamsError };
}

/** Reload Game: the server's copy, stored. */
export async function reloadGameFlow(gameId: number): Promise<Game> {
  const { game } = await fetchGame(gameId);
  upsertGame(game);
  return game;
}

/** Delete: moved to Deleted Film (deleteGameFlag 0), and left out of every list. */
export async function deleteGameFlow(gameId: number): Promise<void> {
  await deleteGame(gameId, 0);
  markGameDeleted(gameId);
}
