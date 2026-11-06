import type { GameTab } from '../api/games';
import { UserRole, type Game } from '../api/types';

// What each games-list row shows, from GamesViewController's cellForRowAt in iOS.

/** GameStatus.ended in iOS. */
export const GAME_ENDED = 2;

/**
 * The REC button: coaches (and admins), managers and the game's owner, on
 * games that are not ended, not shared and not in Scout.
 */
export function showRecordButton(
  game: Game,
  ctx: { role: UserRole; userId: number; tab: GameTab },
): boolean {
  const allowed =
    ctx.role === UserRole.Coach ||
    ctx.role === UserRole.Admin ||
    ctx.role === UserRole.Manager ||
    game.userId === ctx.userId;
  return allowed && game.status < GAME_ENDED && game.isShared === 0 && ctx.tab !== 'SCOUT';
}

/**
 * The result shown on tablets for games and practices outside HOME:
 * "Home\nW: 3 - 1". Empty when there is no score yet.
 */
export function scoreText(game: Game, ctx: { tab: GameTab; isHomeOrg: boolean }): string {
  if (ctx.isHomeOrg || ctx.tab === 'SCOUT') {
    return '';
  }
  if (game.homeTeamPoint === 0 && game.awayTeamPoint === 0) {
    return '';
  }
  const venue = game.venueType === 2 ? 'Away' : 'Home';
  const result = game.gameResult === '1' ? 'W' : 'L';
  return `${venue}\n${result}: ${game.homeTeamPoint} - ${game.awayTeamPoint}`;
}

/** "Dur: 12 mins" on phones, "Duration: 12 mins" on tablets (facility-camera games). */
export function durationText(game: Game, isTablet: boolean): string {
  if (game.facilitycamDuration === 0) {
    return '';
  }
  const minutes = Math.floor(game.facilitycamDuration / 60);
  return `${isTablet ? 'Duration' : 'Dur'}: ${minutes} mins`;
}

export type StatusChip = { label: string; tone: 'live' | 'ended' | 'idle' };

/**
 * A simplified status chip. iOS draws an icon from status, upload/stream
 * state and live broadcasting (GameListCell.updateStatus); this shows only
 * the game status for now.
 */
export function statusChip(game: Game): StatusChip {
  if (game.status >= GAME_ENDED) {
    return { label: 'ENDED', tone: 'ended' };
  }
  if (game.status === 1) {
    return { label: 'LIVE', tone: 'live' };
  }
  return { label: 'NOT STARTED', tone: 'idle' };
}

/**
 * The row's date: short date and time on phones, medium on tablets
 * (Date.dateTimeString in iOS). Uses the device time zone; iOS uses the
 * game's own zone once its zone list has loaded (not built yet).
 */
export function formatGameDate(unixSeconds: number, isTablet: boolean, locale?: string): string {
  const date = new Date(unixSeconds * 1000);
  const style = isTablet ? 'medium' : 'short';
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: style, timeStyle: style }).format(date);
  } catch {
    return date.toLocaleString(locale);
  }
}

/** Team names as shown on tablets: "Home Team, Away Team". */
export function teamNamesText(game: Game): string {
  return game.teamNames
    .split(',')
    .map(n => n.trim())
    .filter(Boolean)
    .join(', ');
}
