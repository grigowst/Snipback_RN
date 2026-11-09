import { DEFAULT_JERSEY } from '../api/teams';
import { UserRole } from '../api/types';
import type { RosterKind } from './roster';

// The rules of the add-member and member-editor forms
// (AddUserTableViewController, EditUserViewController in iOS).

/**
 * Roles offered when adding someone, in the iOS order. Only an admin may
 * make someone an admin.
 */
export function addRoleOptions(viewerIsAdmin: boolean): UserRole[] {
  const roles = [UserRole.Player, UserRole.Follower, UserRole.Manager, UserRole.Coach, UserRole.Recruit];
  return viewerIsAdmin ? [...roles, UserRole.Admin] : roles;
}

/**
 * Roles offered in the member editor, the member's current role first.
 * As iOS: an admin can only become a coach and a coach only an admin, both
 * only at an admin's hands; anyone else can become a player, follower,
 * manager, recruit or coach, or (by an admin) an admin.
 */
export function editRoleOptions(currentRole: UserRole, viewerIsAdmin: boolean): UserRole[] {
  let changes: UserRole[];
  if (currentRole === UserRole.Admin) {
    changes = viewerIsAdmin ? [UserRole.Coach] : [];
  } else if (currentRole === UserRole.Coach) {
    changes = viewerIsAdmin ? [UserRole.Admin] : [];
  } else {
    changes = [UserRole.Player, UserRole.Follower, UserRole.Manager, UserRole.Recruit, UserRole.Coach];
    if (viewerIsAdmin) {
      changes.push(UserRole.Admin);
    }
  }
  return [currentRole, ...changes.filter(r => r !== currentRole)];
}

/** The role a new member starts with: the tab they were added from. */
export function defaultAddRole(kind: RosterKind): UserRole {
  return kind === 'followers' ? UserRole.Follower : UserRole.Player;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** "First Last", or just the first name; the first name is required. */
export function parseName(first: string, last: string): Parsed<string> {
  const f = first.trim();
  const l = last.trim();
  if (!f) {
    return { ok: false, error: 'Please enter a name.' };
  }
  return { ok: true, value: l ? `${f} ${l}` : f };
}

/** Splits a stored name at the first space, as the iOS editor does. */
export function splitName(name: string): { first: string; last: string } {
  const trimmed = name.trim();
  const space = trimmed.indexOf(' ');
  return space < 0
    ? { first: trimmed, last: '' }
    : { first: trimmed.slice(0, space), last: trimmed.slice(space + 1).trim() };
}

/** Up to 3 digits; an empty field means no number (9999). */
export function parseJersey(text: string): Parsed<number> {
  const t = text.trim();
  if (!t) {
    return { ok: true, value: DEFAULT_JERSEY };
  }
  if (!/^\d{1,3}$/.test(t)) {
    return { ok: false, error: 'Please enter a valid # number (up to 3 digits).' };
  }
  return { ok: true, value: parseInt(t, 10) };
}

/** What the jersey field shows: nothing for "no number" (9999 or 0). */
export function jerseyText(jersey: number): string {
  return jersey === DEFAULT_JERSEY || jersey === 0 ? '' : String(jersey);
}

/** Whether someone else on the roster already wears this number (9999 and 0 never clash). */
export function jerseyTaken(
  roster: { userId: number; jerseyNumber: number }[],
  userId: number,
  jersey: number,
): boolean {
  if (jersey === DEFAULT_JERSEY || jersey === 0) {
    return false;
  }
  return roster.some(m => m.userId !== userId && m.jerseyNumber === jersey);
}

export function isValidEmail(text: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text.trim());
}
