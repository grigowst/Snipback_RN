import type { RawGame } from '../api/gameEdit';
import { toStr } from '../api/paging';
import { UserRole, type Game } from '../api/types';
import { GAME_STREAMING_URL } from '../config/environment';

// A game's "⋮" menu (GamesAlertTableViewController on the iPad,
// showAlertForNormal on the iPhone). Only the options built so far are
// listed, in iOS's order; the rest (status, End Game, players, uploads,
// score consoles, statistics, LAN and TV) come with later steps.

export type GameMenuOption = 'edit' | 'reload' | 'share' | 'delete';

export const GAME_MENU_TITLES: Record<GameMenuOption, string> = {
  edit: 'Edit Game',
  reload: 'Reload Game',
  share: 'Share Game',
  delete: 'Delete',
};

/** Admins, coaches and home users (isCurrentCoach in iOS). */
const isCurrentCoach = (role: UserRole) => [UserRole.Admin, UserRole.Coach, UserRole.HomeUser].includes(role);
/** Admins and coaches, not home users (isCoach in iOS). */
const isCoach = (role: UserRole) => role === UserRole.Admin || role === UserRole.Coach;

/**
 * The options for a game. With an opponent's games on screen only sharing is
 * offered: the others act on the team that owns the game.
 */
export function gameMenuOptions(opts: { role: UserRole; opponentFilter: boolean }): GameMenuOption[] {
  if (opts.opponentFilter) {
    return ['share'];
  }
  const coach = isCurrentCoach(opts.role);
  return [...(coach ? (['edit'] as const) : []), 'reload', 'share', ...(coach ? (['delete'] as const) : [])];
}

/**
 * Whether the viewer may edit or delete this game; iOS says "Permission
 * Denied" otherwise. Editing (both devices) and deleting on the iPad need the
 * game's creator, an admin or a coach; the iPhone lets everyone who sees
 * Delete (admins, coaches, home users) delete. Every listed game counts as
 * accessible (iOS sets has_game_access on each game it syncs).
 */
export function canChangeGame(
  action: 'edit' | 'delete',
  game: Pick<Game, 'userId'>,
  viewer: { role: UserRole; userId: number; isTablet: boolean },
): boolean {
  if (action === 'delete' && !viewer.isTablet) {
    return isCurrentCoach(viewer.role);
  }
  return game.userId === viewer.userId || isCoach(viewer.role);
}

/** The link Share Game sends: the short link, else the game's link, else its watch page. */
export function gameShareLink(game: Pick<Game, 'id' | 'rawJson'>): string {
  let raw: RawGame = {};
  try {
    raw = JSON.parse(game.rawJson) as RawGame;
  } catch {
    // An unreadable row still has its watch page.
  }
  return toStr(raw.short_url) || toStr(raw.url) || `${GAME_STREAMING_URL}/${game.id}`;
}
