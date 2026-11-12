import { GAME_TYPE_FOR_TAB, mapGame, type GameTab } from '../api/games';
import { rawNumber, type RawGame, type StatHomeAway } from '../api/gameEdit';
import { toInt, toStr } from '../api/paging';
import type { Game } from '../api/types';
import type { StateTimeZone } from '../api/gameCreate';
import { rsaEncrypt } from '../utils/rsa';
import { GENERIC_OPPONENT, STORAGE_TYPE, type GameForm } from './gameForm';

// Editing a game (CreateGameVM in edit mode, GameDataHandler.editGame and
// CreateGameVC.editStatGame in iOS). The form shows what it can change; every
// other field the game has (cameras, payment, the test-game flag, the
// volleyball rotation) goes back exactly as it was read.

/** What the edit form starts from: the server's copy of the game and its home / away teams. */
export type EditSource = {
  game: Game;
  raw: RawGame;
  stat: StatHomeAway;
  /** The game's own team (the first home team); null in HOME, or when it has none. */
  homeTeam: { id: number; teamType: number; name: string } | null;
};

export function editSourceOf(game: Game, raw: RawGame, stat: StatHomeAway, isHomeOrg: boolean): EditSource {
  const home = stat.home[0];
  return {
    game,
    raw,
    stat,
    homeTeam: !isHomeOrg && home && home.teamId > 0 ? { id: home.teamId, teamType: home.teamType ?? 0, name: home.name } : null,
  };
}

/** The list tab a game belongs to (game_type 1, 0, 2). */
export function tabOfGame(gameType: number): GameTab {
  switch (gameType) {
    case 0:
      return 'PRACTICES';
    case 2:
      return 'SCOUT';
    default:
      return 'GAMES';
  }
}

const cameras = (raw: RawGame) => toStr(raw.facilitycam_unique_ids);

/**
 * A camera game that is recording now (isLiveFacilityGame in iOS): its start
 * and zone can't change, and the start isn't sent at all.
 */
export const isLiveCameraGame = (src: EditSource) =>
  src.game.status === 1 && cameras(src.raw) !== '' && toInt(src.raw.facilitycam_duration) > 0;

/** The game's other teams (its team mappings of type 3). */
export function otherTeamsOf(raw: RawGame): { id: number; name: string }[] {
  const seen = new Set<number>();
  const teams: { id: number; name: string }[] = [];
  for (const m of raw.teamMapping ?? []) {
    const id = toInt(m.team_id);
    if (toInt(m.type) === 3 && id > 0 && !seen.has(id)) {
      seen.add(id);
      teams.push({ id, name: toStr(m.name) });
    }
  }
  return teams;
}

/** The form as the game stands (setDataForEditMode in iOS). */
export function editFormFrom(src: EditSource): GameForm {
  const r = src.raw;
  const away = src.stat.away[0];
  return {
    name: src.game.name,
    tab: tabOfGame(src.game.gameType),
    start: src.game.gameDate,
    zoneId: src.game.stateTimezoneMappingId,
    venue: src.stat.venueType === 2 ? 2 : 1,
    // As read, even 0. None at all (LIVE practices have null) reads as 1,
    // the iOS model's default, so it goes back as iOS sends it.
    gameKind: rawNumber(r, 'game_mode', 1),
    category: src.game.category,
    opponent: away
      ? { id: away.teamId, name: away.name || 'Opponent', teamType: away.teamType === 0 ? 0 : 1, nameOnly: away.isOpponent }
      : GENERIC_OPPONENT,
    otherTeamIds: otherTeamsOf(r).map(t => t.id),
    isLiveBroadcasting: rawNumber(r, 'isLiveBroadcasting') === 2 ? 2 : 0,
    publicSnipping: rawNumber(r, 'public') === 1 ? 1 : 0,
    postToWebsite: rawNumber(r, 'post_to_website') === 1 ? 1 : 0,
    statreportVisibility: rawNumber(r, 'statreport_visibility') === 1 ? 1 : 0,
    balltracking: Math.max(0, Math.min(2, toInt(r.balltracking))),
  };
}

/** An edited game keeps its own zone; one with none gets the device's (never the organisation's). */
export const editZoneId = (zones: StateTimeZone[], device: string): number =>
  zones.find(z => z.identifier === device)?.id ?? 0;

export type EditContext = { userId: number; orgId: number; isHomeOrg: boolean };

/**
 * The /api/game/updateGame body: iOS's createUpdateGame for an edit, plus
 * what APIManager.editGame adds. Fields the form doesn't own are sent as
 * read. Differences from iOS: the storage type is the game's own (iOS sends
 * the app's setting), and the camera length is sent to the second (iOS
 * rounds it down to whole minutes).
 */
export function editGameBody(form: GameForm, src: EditSource, ctx: EditContext): Record<string, unknown> {
  const scout = form.tab === 'SCOUT';
  const r = src.raw;
  const cams = scout ? '' : cameras(r);
  const myTeam = ctx.isHomeOrg ? null : src.homeTeam;
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
    enc_myteam_id: rsaEncrypt(myTeam?.id ?? 0),
    home_team_type: myTeam?.teamType ?? 0,
    enc_oppo_team_id: rsaEncrypt(form.opponent.id),
    away_team_type: form.opponent.teamType,
    amount: rawNumber(r, 'amount'),
    timetofree: rawNumber(r, 'timetofree'),
    facilitycam_room_id: scout ? 0 : toInt(r.facilitycam_room_id),
    facility_cam_uniqueids: cams,
    facility_cam_duration: cams === '' ? 0 : toInt(r.facilitycam_duration),
    facility_cam_startnow: 0,
    // Never 0 for a game that has a zone: the server would wipe it.
    state_timezone_mapping_id: form.zoneId > 0 ? form.zoneId : src.game.stateTimezoneMappingId,
    test_game: toInt(r.test_game) === 1 ? 1 : 0,
    game_mode: form.gameKind,
    // Sending [] would erase a volleyball game's rotation.
    volley_game_rotation: form.category === 5 ? src.stat.rotation : [],
    enc_id: rsaEncrypt(src.game.id),
    // APIManager.editGame adds these (enc_user_id here; the create sends enc_userId).
    storage_type: rawNumber(r, 'storage_type', STORAGE_TYPE),
    enc_user_id: rsaEncrypt(ctx.userId),
    enc_organization_id: rsaEncrypt(ctx.orgId),
  };
  if (isLiveCameraGame(src)) {
    // Recording now: the server keeps the start, and a past one would be refused.
    delete body.game_date;
  }
  if (form.opponent.nameOnly) {
    body.is_opponent = '1';
    body.is_opponent_team_group = '1';
  }
  return body;
}

export type StatMappingWrite = { kind: 'edit' | 'save'; body: Record<string, unknown> };

/**
 * The second write after an edit (editStatGame in iOS): the game's home /
 * away mapping updated, or created when the game has none and a team is set,
 * or nothing. The opponent sent is the one the form shows (iOS sends 0 when
 * the mapping has no away entry).
 */
export function statMappingWrite(form: GameForm, src: EditSource): StatMappingWrite | null {
  const venue = form.tab === 'SCOUT' ? 1 : form.venue;
  if (src.stat.mappingId > 0) {
    const home = src.stat.home[0];
    const away = src.stat.away[0];
    const body: Record<string, unknown> = {
      enc_id: rsaEncrypt(src.stat.mappingId),
      enc_myteam_id: rsaEncrypt(home?.teamId ?? 0),
      enc_oppo_team_id: rsaEncrypt(form.opponent.id),
      venue_type: venue,
      home_team_type: home?.teamType ?? '1',
      away_team_type: form.opponent.teamType,
      home_color_code: home?.homeColor ?? '',
      away_color_code: away?.awayColor ?? '',
    };
    if (form.opponent.nameOnly) {
      body.is_opponent_team_group = '1';
      body.away_team_type = '1';
    } else if (form.opponent.teamType === 0 && form.opponent.id > 0) {
      // Now a SnipBack team: a name-only opponent's flag goes.
      body.is_opponent_team_group = '0';
    }
    return { kind: 'edit', body };
  }
  const myTeamId = src.homeTeam?.id ?? 0;
  if (myTeamId > 0 || form.opponent.id > 0) {
    return {
      kind: 'save',
      body: {
        enc_game_id: rsaEncrypt(src.game.id),
        enc_myteam_id: rsaEncrypt(myTeamId),
        enc_oppo_team_id: rsaEncrypt(form.opponent.id),
        venue_type: venue,
        myteam_color_code: '#000000',
        oppo_color_code: '#000000',
      },
    };
  }
  return null;
}

/**
 * The edited game to store: the server's reply over the copy read, with the
 * camera and zone fields put back from what was sent (the reply has none).
 */
export function savedGameRow(src: EditSource, reply: RawGame, sent: Record<string, unknown>): Game {
  const zone = toInt(sent.state_timezone_mapping_id);
  return mapGame({
    ...src.raw,
    ...reply,
    facilitycam_unique_ids: sent.facility_cam_uniqueids,
    facilitycam_room_id: sent.facilitycam_room_id,
    facilitycam_duration: sent.facility_cam_duration,
    state_timezone_mapping_id: zone > 0 ? zone : src.game.stateTimezoneMappingId,
  });
}
