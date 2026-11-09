import { GAME_TYPE_FOR_TAB, type GameTab } from '../api/games';
import type { StateTimeZone } from '../api/gameCreate';
import type { TeamDefaults } from '../api/teamEditor';
import { UserRole, type Organization } from '../api/types';
import { rsaEncrypt } from '../utils/rsa';

// The create-game form (CreateGameVM / AdvancedFeatureOptions in iOS). The
// form keeps the values the server takes (live streaming 2/0, public 1/0,
// ball tracking 0/1/2...), not iOS's segment indexes, so nothing is inverted
// on the way out.

/** Basketball and volleyball: the sports with ball tracking (GameCategory 3 and 5). */
export const isCourtSport = (category: number) => category === 3 || category === 5;

/** Non-Conference, Conference or Exhibition (game_mode). */
export const GAME_KIND_OPTIONS = [
  { value: 1, label: 'NON-CONFERENCE' },
  { value: 2, label: 'CONFERENCE' },
  { value: 3, label: 'EXHIBITION' },
];

/** The opponent as the form keeps it. */
export type OpponentChoice = {
  id: number;
  name: string;
  /** 0 = a SnipBack team, 1 = a name-only opponent or the generic one. */
  teamType: 0 | 1;
  /** A name-only opponent of the organisation (sent with is_opponent). */
  nameOnly: boolean;
};

/** No team named: "Opponent" (iOS's generic opponent). */
export const GENERIC_OPPONENT: OpponentChoice = { id: 0, name: 'Opponent', teamType: 1, nameOnly: false };

export type GameForm = {
  name: string;
  /** The game's mode: GAMES, PRACTICES or SCOUT (game_type 1, 0, 2). */
  tab: GameTab;
  /** The start, in seconds since 1970. */
  start: number;
  /** The venue's time zone (state_timezone_mapping_id); 0 = none, shown on the device's clock. */
  zoneId: number;
  /** 1 = home, 2 = away. */
  venue: 1 | 2;
  gameKind: number;
  /** The sport (game category); 0 when none is known. */
  category: number;
  opponent: OpponentChoice;
  otherTeamIds: number[];
  isLiveBroadcasting: number;
  publicSnipping: number;
  postToWebsite: number;
  statreportVisibility: number;
  balltracking: number;
};

/**
 * A new game. The advanced options start as iOS's do when the team has no
 * saved defaults: everything private, no live stream, no ball tracking.
 */
export function newGameForm(opts: { tab: GameTab; start: number; zoneId: number; category: number }): GameForm {
  return {
    name: '',
    tab: opts.tab,
    start: opts.start,
    zoneId: opts.zoneId,
    venue: 1,
    gameKind: 1,
    category: opts.category,
    opponent: GENERIC_OPPONENT,
    otherTeamIds: [],
    isLiveBroadcasting: 0,
    publicSnipping: 0,
    postToWebsite: 0,
    statreportVisibility: 0,
    balltracking: 0,
  };
}

/**
 * The team's saved defaults for the game's venue (iOS getTeamSetting): the
 * sport and the advanced options. Ball tracking only for a court sport.
 */
export function applyTeamDefaults(form: GameForm, d: TeamDefaults): GameForm {
  const category = d.category > 0 ? d.category : form.category;
  return {
    ...form,
    category,
    isLiveBroadcasting: d.isLiveBroadcasting === 2 ? 2 : 0,
    publicSnipping: d.publicSnipping === 1 ? 1 : 0,
    postToWebsite: d.postToWebsite === 1 ? 1 : 0,
    statreportVisibility: d.statreportVisibility === 1 ? 1 : 0,
    balltracking: isCourtSport(category) ? Math.max(0, Math.min(2, d.balltracking)) : 0,
  };
}

/** A new sport; ball tracking goes off for a sport without it. */
export const withSport = (form: GameForm, category: number): GameForm => ({
  ...form,
  category,
  balltracking: isCourtSport(category) ? form.balltracking : 0,
});

/** Which parts of the form show (CreateGameCell / AdvancedFeatureCell in iOS). */
export function shownParts(form: GameForm, isHomeOrg: boolean) {
  const scout = form.tab === 'SCOUT';
  return {
    venue: !scout,
    gameKind: form.tab === 'GAMES',
    teams: !isHomeOrg,
    /** Live snipping, website, stat, LQ stream: hidden for Scout. */
    advanced: !scout,
    /** Practices can't be shown on the website: the choice is locked. */
    websiteLocked: form.tab !== 'GAMES',
    ballTracking: !scout && isCourtSport(form.category),
  };
}

/** The organisation's own zone, else the row for the device's zone, else none (iOS applyDefaultTimeZoneIfNeeded). */
export function defaultZoneId(zones: StateTimeZone[], selected: number, device: string): number {
  if (selected > 0 && zones.some(z => z.id === selected)) {
    return selected;
  }
  return zones.find(z => z.identifier === device)?.id ?? 0;
}

/** Admins, coaches and home users can create games (isCurrentCoach in iOS). */
export const canCreateGames = (org: Organization | undefined) =>
  org !== undefined && [UserRole.Admin, UserRole.Coach, UserRole.HomeUser].includes(org.roleId);

/**
 * Why "+ GAME" can't open the form, or null when it can (AddGameBtnAction in
 * the iOS hub, the + in its games list): only admins, coaches and home users;
 * the organisation must be active; outside HOME a team must be picked (iOS's
 * Map to Teams for "Org - All Teams" isn't built).
 */
export function createGameBlock(
  org: Organization | undefined,
  isHomeOrg: boolean,
  teamId: number,
): { title: string; message: string } | null {
  if (!canCreateGames(org)) {
    return { title: 'Alert', message: 'Permission Denied' };
  }
  if (org!.isActive !== 1) {
    return {
      title: 'Organization Deactivated',
      message: 'This organization has been deactivated. Please contact Snipback Support for assistance',
    };
  }
  if (!isHomeOrg && teamId === 0) {
    return { title: '', message: 'Please choose a team and continue' };
  }
  return null;
}

export type GameContext = {
  userId: number;
  orgId: number;
  /** The team the game is for, or null (HOME, or no team). */
  myTeam: { id: number; teamType: number } | null;
};

/** Where uploads go: 1 = R2. iOS's default; every recent LIVE game has it (getSnipbackSettings needs a key the app doesn't hold). */
export const STORAGE_TYPE = 1;

/**
 * The /api/game/saveGame body, as iOS's createUpdateGame and createGame build
 * it. Scout games are sent with no live stream, private, the stat report
 * public, no ball tracking and at home, as iOS sends them. No cameras,
 * payment or volleyball rotation (not built).
 */
export function createGameBody(form: GameForm, ctx: GameContext): Record<string, unknown> {
  const scout = form.tab === 'SCOUT';
  const body: Record<string, unknown> = {
    game_date: form.start,
    name: form.name.trim(),
    game_type: GAME_TYPE_FOR_TAB[form.tab],
    isLiveBroadcasting: scout ? 0 : form.isLiveBroadcasting,
    ai_enable: 0,
    public: scout ? 0 : form.publicSnipping,
    post_to_website: scout ? 0 : form.postToWebsite,
    statreport_visibility: scout ? 1 : form.statreportVisibility,
    balltracking: scout ? 0 : form.balltracking,
    venue_type: scout ? 1 : form.venue,
    teamList: form.otherTeamIds.join(','),
    enc_category: rsaEncrypt(form.category),
    enc_myteam_id: rsaEncrypt(ctx.myTeam?.id ?? 0),
    home_team_type: ctx.myTeam?.teamType ?? 0,
    enc_oppo_team_id: rsaEncrypt(form.opponent.id),
    away_team_type: form.opponent.teamType,
    amount: 0,
    timetofree: 0,
    facilitycam_room_id: 0,
    facility_cam_uniqueids: '',
    facility_cam_duration: 0,
    facility_cam_startnow: 0,
    state_timezone_mapping_id: form.zoneId,
    test_game: 0,
    game_mode: form.gameKind,
    ai_status: 0,
    status: 0,
    volley_game_rotation: [],
    // APIManager.createGame adds these.
    offline_game_id: 0,
    storage_type: STORAGE_TYPE,
    enc_userId: rsaEncrypt(ctx.userId),
    enc_organization_id: rsaEncrypt(ctx.orgId),
  };
  if (form.opponent.nameOnly) {
    body.is_opponent = '1';
    body.is_opponent_team_group = '1';
  }
  return body;
}
