import { DEFAULT_JERSEY } from '../api/teams';
import type { FreshTeam, RosterEntry } from '../api/members';
import type { HomeAway, TeamDefaults } from '../api/teamEditor';
import type { Person } from '../api/types';
import { UserRole } from '../api/types';

// The team editor's rules (V2CreateTeamViewController and
// TeamDefaultsTableViewController in iOS).

// ---- Name and abbreviation ------------------------------------------------

/**
 * Characters iOS won't let you type into a team name (forbiddenCharacters2;
 * "-" and space were taken off that list on request).
 */
export const FORBIDDEN_NAME_CHARACTERS = '<>"\'`\\()/;{}$|&#%*^~!@_.';

const isForbidden = (text: string) =>
  [...text].some(c => FORBIDDEN_NAME_CHARACTERS.includes(c) || c === '\n' || c === '\r');

/**
 * The name field's next value. Like iOS's shouldChangeCharactersIn, a change
 * that types a forbidden character is refused as a whole; characters already
 * in the name (say the "_" of a name saved by the server) stay.
 */
export function acceptNameInput(previous: string, next: string): string {
  let start = 0;
  while (start < previous.length && start < next.length && previous[start] === next[start]) {
    start++;
  }
  let endPrev = previous.length;
  let endNext = next.length;
  while (endPrev > start && endNext > start && previous[endPrev - 1] === next[endNext - 1]) {
    endPrev--;
    endNext--;
  }
  return isForbidden(next.slice(start, endNext)) ? previous : next;
}

export function teamNameCheck(name: string): { ok: true; value: string } | { ok: false; error: string } {
  const value = name.trim();
  return value === '' ? { ok: false, error: 'Enter a valid team name.' } : { ok: true, value };
}

/**
 * /api/team/update changes "-" to "_" in the team name it is sent (LIVE,
 * 9 Nov 2026), and create is expected to do the same. Until the server keeps
 * names as they are, a team save that sends a name with "-" is refused.
 */
export const serverRewritesName = (name: string) => name.includes('-');

/** Why a save that would send this name is refused. */
export function rewrittenNameMessage(name: string, isNewName: boolean): string {
  return isNewName
    ? `Not saved: the server would change "${name}" ("-" becomes "_"). Team names with "-" can't be saved ` +
        'from the app until this is fixed on the server. Please use a name without "-".'
    : `Not saved: this team's name, "${name}", has a "-", which the server would change to "_". Its name, ` +
        'abbreviation, stats switch and members can only be saved with a name without "-" until this is ' +
        'fixed on the server. Its game defaults can still be saved on their own.';
}

/** Up to 3 letters, in capitals (iOS keeps the first 3 and capitalises on save). */
export const abbrInput = (text: string) => text.toUpperCase().slice(0, 3);

// ---- Game defaults ---------------------------------------------------------

export type Option = { value: number; label: string };

export const GAME_MODE_OPTIONS: Option[] = [
  { value: 2, label: 'SCOUT' },
  { value: 0, label: 'PRACTICE' },
  { value: 1, label: 'GAME' },
];
export const LIVE_OPTIONS: Option[] = [
  { value: 2, label: 'ENABLE' },
  { value: 0, label: 'DISABLED' },
];
export const PUBLIC_OPTIONS: Option[] = [
  { value: 1, label: 'PUBLIC' },
  { value: 0, label: 'PRIVATE' },
];
export const TRACKING_OPTIONS: Option[] = [
  { value: 1, label: 'ENABLE' },
  { value: 0, label: 'DISABLED' },
];
export const VIEW_OPTIONS: Option[] = [
  { value: 1, label: 'CENTER VIEW' },
  { value: 2, label: 'CORNER VIEW' },
];

const SCOUT = 2;

export type DefaultsField =
  | 'gameType'
  | 'isLiveBroadcasting'
  | 'publicSnipping'
  | 'postToWebsite'
  | 'statreportVisibility'
  | 'tracking'
  | 'view';

/** A Scout game has none of these (iOS zeroes them when a row is saved as Scout). */
function asScout(d: TeamDefaults): TeamDefaults {
  return {
    ...d,
    gameType: SCOUT,
    isLiveBroadcasting: 0,
    publicSnipping: 0,
    postToWebsite: 0,
    statreportVisibility: 0,
    balltracking: 0,
    facilitycamUniqueIds: '',
    facilitycamDuration: 0,
    facilitycamRoomId: 0,
  };
}

/** One default changed by the user. Every other value stays as it was read. */
export function setDefault(d: TeamDefaults, field: DefaultsField, value: number): TeamDefaults {
  switch (field) {
    case 'gameType':
      return value === SCOUT && d.gameType !== SCOUT ? asScout(d) : { ...d, gameType: value };
    case 'tracking':
      // On means the centre view, as in iOS; off clears the view too.
      return { ...d, balltracking: value === 0 ? 0 : d.balltracking > 0 ? d.balltracking : 1 };
    case 'view':
      return d.balltracking > 0 ? { ...d, balltracking: value } : d;
    default:
      return { ...d, [field]: value };
  }
}

/** The rows shown for a default (iOS hides all but Game mode for Scout, and the view while tracking is off). */
export function shownDefaults(d: TeamDefaults): DefaultsField[] {
  if (d.gameType === SCOUT) {
    return ['gameType'];
  }
  const rows: DefaultsField[] = [
    'gameType',
    'isLiveBroadcasting',
    'publicSnipping',
    'postToWebsite',
    'statreportVisibility',
    'tracking',
  ];
  return d.balltracking > 0 ? [...rows, 'view'] : rows;
}

/** The value a row's chips show. */
export function defaultValue(d: TeamDefaults, field: DefaultsField): number {
  switch (field) {
    case 'tracking':
      return d.balltracking > 0 ? 1 : 0;
    case 'view':
      return d.balltracking;
    default:
      return d[field];
  }
}

/** Both rows take the chosen sport. */
export const withCategory = (d: HomeAway, category: number): HomeAway => ({
  home: { ...d.home, category },
  away: { ...d.away, category },
});

const sameDefaults = (a: TeamDefaults, b: TeamDefaults) =>
  (Object.keys(a) as (keyof TeamDefaults)[]).every(k => a[k] === b[k]);

export const defaultsChanged = (opened: HomeAway, now: HomeAway) =>
  !sameDefaults(opened.home, now.home) || !sameDefaults(opened.away, now.away);

// ---- Members ---------------------------------------------------------------

/**
 * Someone added in the editor joins with their organisation role (as iOS
 * does) and no jersey number; Player when the roles list doesn't have them.
 */
export const addedEntry = (userId: number, orgRoles: Map<number, number>): RosterEntry => ({
  userId,
  roleId: orgRoles.get(userId) ?? UserRole.Player,
  jerseyNumber: DEFAULT_JERSEY,
});

/**
 * The roster to send: the team as read fresh at save time, without the
 * people the user removed, plus the people the user added. Everyone else
 * keeps their team role and jersey exactly as the server has them.
 */
export function editorEntries(fresh: FreshTeam, added: RosterEntry[], removed: number[]): RosterEntry[] {
  const leaving = new Set(removed);
  const kept: RosterEntry[] = fresh.team.members
    .filter(m => !leaving.has(m.userId))
    .map(m => ({ userId: m.userId, roleId: m.roleId, jerseyNumber: m.jerseyNumber }));
  const already = new Set(kept.map(e => e.userId));
  return [...kept, ...added.filter(a => !already.has(a.userId))];
}

export type PaneRow = { userId: number; name: string; email: string };

const byName = (a: PaneRow, b: PaneRow) => a.name.toLowerCase().localeCompare(b.name.toLowerCase());

const matches = (row: PaneRow, search: string) => {
  const text = search.trim().toLowerCase();
  return text === '' || row.name.toLowerCase().includes(text) || row.email.toLowerCase().includes(text);
};

/** The left pane: the organisation's people who aren't on the team, by name. */
export function orgPane(people: Person[], onTeam: Set<number>, search: string): PaneRow[] {
  return people
    .filter(p => !onTeam.has(p.id))
    .map(p => ({ userId: p.id, name: p.name || p.email, email: p.email }))
    .filter(r => matches(r, search))
    .sort(byName);
}

/** The right pane: the team's people, by name, each listed once. */
export function teamPane(members: PaneRow[], search: string): PaneRow[] {
  const seen = new Set<number>();
  return members
    .filter(m => (seen.has(m.userId) ? false : (seen.add(m.userId), true)))
    .filter(r => matches(r, search))
    .sort(byName);
}

/** The most rows a pane shows; a search narrows the rest. */
export const PANE_LIMIT = 100;
