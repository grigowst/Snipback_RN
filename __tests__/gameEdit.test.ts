/**
 * Step 10: the game menu and editing a game. Reading the game fresh, the
 * edit form, the update body (everything the form doesn't own goes back as
 * read), the home / away write, the menu's options, reload and delete.
 */

// RSA is replaced by a readable marker so the request bodies can be checked.
jest.mock('../src/utils/rsa', () => ({ rsaEncrypt: (v: unknown) => `enc(${v})` }));

import { fetchGame, fetchStatHomeAway, mapStatHomeAway, statHomeAwayEndpoint, type RawGame } from '../src/api/gameEdit';
import { mapGame } from '../src/api/games';
import { UserRole } from '../src/api/types';
import { readGameList, writeGameListPage } from '../src/db/repositories';
import { deleteGameFlow, editGameFlow, loadEditSource, reloadGameFlow } from '../src/games/gameEditActions';
import {
  editFormFrom,
  editGameBody,
  editSourceOf,
  editZoneId,
  isLiveCameraGame,
  statMappingWrite,
  tabOfGame,
  type EditSource,
} from '../src/games/gameEditRules';
import { GENERIC_OPPONENT, type GameForm } from '../src/games/gameForm';
import { canChangeGame, gameMenuOptions, gameShareLink } from '../src/games/gameMenu';

type Call = { path: string; body: any };
const ok = (data: unknown) => ({ body: { status: true, message: '', data } });
const refused = (message: string) => ({ body: { status: false, message } });

function mockFetch(answer: (path: string, body: any) => { body: unknown; status?: number } | 'network') {
  const calls: Call[] = [];
  (global as any).fetch = jest.fn(async (url: string, init: { body?: string }) => {
    const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ path, body });
    const reply = answer(path, body);
    if (reply === 'network') {
      throw new TypeError('Network request failed');
    }
    return { status: reply.status ?? 200, json: async () => reply.body };
  });
  return calls;
}

/** A volleyball game for R2 against a name-only opponent, with cameras, a price and other teams. */
const RAW: RawGame = {
  id: 125878,
  name: 'RN Test - Game',
  game_date: 1762700100.5,
  organization_id: 11907,
  user_id: 9,
  status: 0,
  game_type: 1,
  game_mode: 2,
  category: 5,
  venue_type: 2,
  upload_status: 0,
  isLiveBroadcasting: 2,
  public: 1,
  post_to_website: 0,
  statreport_visibility: 1,
  balltracking: 2,
  amount: 4.99,
  timetofree: 48,
  facilitycam_room_id: 12,
  facilitycam_unique_ids: 'cam1,cam2',
  facilitycam_duration: 5430,
  state_timezone_mapping_id: 71,
  test_game: 1,
  storage_type: 0,
  short_url: 'https://snipb.ac/x1',
  url: 'https://aicloud.snipback.com/streaming/125878',
  teamMapping: [
    { team_id: 11, name: 'R2', type: 1 },
    { team_id: 3320, name: 'RN Test Opponent', type: 2 },
    { team_id: 12, name: 'U16', type: 3 },
    { team_id: 13, name: 'Archived', type: 3 },
  ],
};
const STAT = {
  home: [{ id: 11, name: 'R2', team_type: 0, myteam_color_code: '#ff0000', oppo_color_code: '#111111' }],
  away: [{ id: 3320, name: 'RN Test Opponent', team_type: 1, is_opponent: 1, myteam_color_code: '#222222', oppo_color_code: '#00ff00' }],
  venue_type: 2,
  mapping_id: 77,
  stat_count: 0,
  volley_game_rotation: [{ period: 1, current_rotation_home: 2, current_rotation_away: 3 }],
};

const source = (raw: RawGame = RAW, stat: Record<string, unknown> = STAT, isHomeOrg = false): EditSource =>
  editSourceOf(mapGame(raw), raw, mapStatHomeAway(stat), isHomeOrg);
const CTX = { userId: 1, orgId: 11907, isHomeOrg: false };

describe('reading a game for editing', () => {
  test('the game: /api/getGame with the id encrypted, from games[0] or game', async () => {
    let shape = 0;
    const calls = mockFetch(() => ok(shape++ === 0 ? { games: [RAW] } : { game: RAW }));
    expect((await fetchGame(125878)).game.name).toBe('RN Test - Game');
    expect((await fetchGame(125878)).raw.short_url).toBe('https://snipb.ac/x1');
    expect(calls[0]).toEqual({ path: '/api/getGame', body: { enc_id: 'enc(125878)' } });
  });

  test('a reply for another game, or none, is an error', async () => {
    mockFetch(() => ok({ games: [{ ...RAW, id: 1 }] }));
    await expect(fetchGame(125878)).rejects.toThrow('The game could not be read');
    mockFetch(() => ok({}));
    await expect(fetchGame(125878)).rejects.toThrow('The game could not be read');
  });

  test('home and away: each sport’s list, a plain game id', async () => {
    expect(statHomeAwayEndpoint(3)).toBe('/api/listStatHomeAndAwayTeams');
    expect(statHomeAwayEndpoint(5)).toBe('/api/volleyball/listVolleyStatHomeAndAwayTeams');
    expect(statHomeAwayEndpoint(6)).toBe('/api/tennis/listHomeAndAwayPlayers');
    expect(statHomeAwayEndpoint(7)).toBe('/api/football/listFootballHomeAndAwayTeams');
    const calls = mockFetch(() => ok(STAT));
    const stat = await fetchStatHomeAway(125878, 5);
    expect(calls[0]).toEqual({ path: '/api/volleyball/listVolleyStatHomeAndAwayTeams', body: { game_id: 125878 } });
    expect(stat).toEqual({
      home: [{ teamId: 11, name: 'R2', teamType: 0, isOpponent: false, homeColor: '#ff0000', awayColor: '#111111' }],
      away: [{ teamId: 3320, name: 'RN Test Opponent', teamType: 1, isOpponent: true, homeColor: '#222222', awayColor: '#00ff00' }],
      venueType: 2,
      mappingId: 77,
      statCount: 0,
      rotation: [{ period: 1, current_rotation_home: 2, current_rotation_away: 3 }],
    });
  });

  test('a team with no type or colours: type unknown, colours black (iOS’s model defaults)', () => {
    const stat = mapStatHomeAway({ home: [{ id: '11', name: 'R2' }] });
    expect(stat.home[0]).toEqual({ teamId: 11, name: 'R2', teamType: null, isOpponent: false, homeColor: '#000000', awayColor: '#000000' });
    expect(mapStatHomeAway(undefined)).toEqual({ home: [], away: [], venueType: 0, mappingId: 0, statCount: 0, rotation: [] });
  });

  test('the game’s own team is the first home team; none in HOME', async () => {
    expect(source().homeTeam).toEqual({ id: 11, teamType: 0, name: 'R2' });
    expect(source(RAW, STAT, true).homeTeam).toBeNull();
    expect(source(RAW, { ...STAT, home: [] }).homeTeam).toBeNull();

    const calls = mockFetch(path => (path === '/api/getGame' ? ok({ games: [RAW] }) : ok(STAT)));
    const src = await loadEditSource(125878, false);
    expect(calls.map(c => c.path)).toEqual(['/api/getGame', '/api/volleyball/listVolleyStatHomeAndAwayTeams']);
    expect(src.homeTeam?.id).toBe(11);
  });
});

describe('the edit form', () => {
  test('starts from the game as it stands, in the values the server takes', () => {
    expect(editFormFrom(source())).toEqual<GameForm>({
      name: 'RN Test - Game',
      tab: 'GAMES',
      start: 1762700100.5,
      zoneId: 71,
      venue: 2,
      gameKind: 2,
      category: 5,
      opponent: { id: 3320, name: 'RN Test Opponent', teamType: 1, nameOnly: true },
      otherTeamIds: [12, 13],
      isLiveBroadcasting: 2,
      publicSnipping: 1,
      postToWebsite: 0,
      statreportVisibility: 1,
      balltracking: 2,
    });
  });

  test('no away team: the generic opponent; no saved venue: home; odd values clamp', () => {
    const form = editFormFrom(
      source({ ...RAW, isLiveBroadcasting: 1, public: 2, balltracking: 7, game_mode: 0 }, { ...STAT, away: [], venue_type: 0 }),
    );
    expect(form.opponent).toEqual(GENERIC_OPPONENT);
    expect(form.venue).toBe(1);
    expect(form.isLiveBroadcasting).toBe(0);
    expect(form.publicSnipping).toBe(0);
    expect(form.balltracking).toBe(2);
    expect(form.gameKind).toBe(0); // as read: it goes back unchanged
  });

  test('a SnipBack team opponent is type 0 and not name-only', () => {
    const form = editFormFrom(source(RAW, { ...STAT, away: [{ id: 7107, name: 'AA Q DEV', team_type: 0, is_opponent: 0 }] }));
    expect(form.opponent).toEqual({ id: 7107, name: 'AA Q DEV', teamType: 0, nameOnly: false });
  });

  test('the mode follows game_type', () => {
    expect([1, 0, 2, 3].map(tabOfGame)).toEqual(['GAMES', 'PRACTICES', 'SCOUT', 'GAMES']);
  });

  test('a game with no zone gets the device’s row, never the organisation’s', () => {
    const zones = [
      { id: 1, stateName: 'Alabama', stateShortCode: 'AL', timeZoneName: 'CST', identifier: 'America/Chicago', gmtValue: '' },
      { id: 71, stateName: 'India', stateShortCode: 'IN', timeZoneName: 'IST', identifier: 'Asia/Kolkata', gmtValue: '' },
    ];
    expect(editZoneId(zones, 'Asia/Kolkata')).toBe(71);
    expect(editZoneId(zones, 'Europe/Paris')).toBe(0);
  });
});

describe('the update body', () => {
  test('an edit that changes nothing sends back everything as read', () => {
    const src = source();
    expect(editGameBody(editFormFrom(src), src, CTX)).toEqual({
      game_date: 1762700100.5,
      name: 'RN Test - Game',
      game_type: 1,
      isLiveBroadcasting: 2,
      ai_enable: 0,
      public: 1,
      post_to_website: 0,
      statreport_visibility: 1,
      balltracking: 2,
      venue_type: 2,
      teamList: '12,13',
      enc_category: 'enc(5)',
      enc_myteam_id: 'enc(11)',
      home_team_type: 0,
      enc_oppo_team_id: 'enc(3320)',
      away_team_type: 1,
      amount: 4.99,
      timetofree: 48,
      facilitycam_room_id: 12,
      facility_cam_uniqueids: 'cam1,cam2',
      facility_cam_duration: 5430,
      facility_cam_startnow: 0,
      state_timezone_mapping_id: 71,
      test_game: 1,
      game_mode: 2,
      volley_game_rotation: [{ period: 1, current_rotation_home: 2, current_rotation_away: 3 }],
      enc_id: 'enc(125878)',
      storage_type: 0,
      enc_user_id: 'enc(1)',
      enc_organization_id: 'enc(11907)',
      is_opponent: '1',
      is_opponent_team_group: '1',
    });
  });

  test('not a create: no status, ai_status, offline id or enc_userId', () => {
    const src = source();
    const body = editGameBody(editFormFrom(src), src, CTX);
    for (const key of ['status', 'ai_status', 'offline_game_id', 'enc_userId']) {
      expect(body).not.toHaveProperty(key);
    }
  });

  test('the rotation goes only with volleyball; a game with no storage type gets R2', () => {
    const src = source({ ...RAW, storage_type: undefined });
    const form = { ...editFormFrom(src), category: 3 };
    const body = editGameBody(form, src, CTX);
    expect(body.volley_game_rotation).toEqual([]);
    expect(body.storage_type).toBe(1);
  });

  test('the form’s changes are sent; a zone of 0 keeps the game’s own', () => {
    const src = source();
    const form: GameForm = {
      ...editFormFrom(src),
      name: '  Renamed  ',
      zoneId: 0,
      venue: 1,
      opponent: { id: 7107, name: 'AA Q DEV', teamType: 0, nameOnly: false },
      otherTeamIds: [12],
    };
    const body = editGameBody(form, src, CTX);
    expect(body).toMatchObject({
      name: 'Renamed',
      state_timezone_mapping_id: 71,
      venue_type: 1,
      enc_oppo_team_id: 'enc(7107)',
      away_team_type: 0,
      teamList: '12',
    });
    expect(body).not.toHaveProperty('is_opponent');
  });

  test('a camera game recording now: no start is sent; its length goes back as read', () => {
    const live = source({ ...RAW, status: 1 });
    expect(isLiveCameraGame(live)).toBe(true);
    const body = editGameBody(editFormFrom(live), live, CTX);
    expect(body).not.toHaveProperty('game_date');
    expect(body.facility_cam_duration).toBe(5430);

    // Recording without cameras, or cameras before the start: the start goes.
    for (const raw of [{ ...RAW, status: 1, facilitycam_unique_ids: '' }, { ...RAW, status: 0 }]) {
      const src = source(raw);
      expect(isLiveCameraGame(src)).toBe(false);
      expect(editGameBody(editFormFrom(src), src, CTX)).toHaveProperty('game_date');
    }
  });

  test('no cameras: no length either', () => {
    const src = source({ ...RAW, facilitycam_unique_ids: '' });
    expect(editGameBody(editFormFrom(src), src, CTX).facility_cam_duration).toBe(0);
  });

  test('Scout: as iOS sends it, and without cameras', () => {
    const src = source();
    const body = editGameBody({ ...editFormFrom(src), tab: 'SCOUT' }, src, CTX);
    expect(body).toMatchObject({
      game_type: 2,
      isLiveBroadcasting: 0,
      public: 0,
      post_to_website: 0,
      statreport_visibility: 1,
      balltracking: 0,
      venue_type: 1,
      facilitycam_room_id: 0,
      facility_cam_uniqueids: '',
      facility_cam_duration: 0,
    });
  });

  test('HOME: no team of its own', () => {
    const src = source(RAW, STAT, true);
    expect(editGameBody(editFormFrom(src), src, { ...CTX, isHomeOrg: true })).toMatchObject({
      enc_myteam_id: 'enc(0)',
      home_team_type: 0,
    });
  });
});

describe('the home / away write after the game', () => {
  test('a game with a mapping: it is edited, with the teams and venue the form shows', () => {
    const src = source();
    expect(statMappingWrite(editFormFrom(src), src)).toEqual({
      kind: 'edit',
      body: {
        enc_id: 'enc(77)',
        enc_myteam_id: 'enc(11)',
        enc_oppo_team_id: 'enc(3320)',
        venue_type: 2,
        home_team_type: 0,
        away_team_type: '1',
        home_color_code: '#ff0000',
        away_color_code: '#00ff00',
        is_opponent_team_group: '1',
      },
    });
  });

  test('now a SnipBack team: the name-only flag is cleared; the generic opponent sends no flag', () => {
    const src = source();
    const team = statMappingWrite({ ...editFormFrom(src), opponent: { id: 7107, name: 'AA', teamType: 0, nameOnly: false } }, src);
    expect(team?.body).toMatchObject({ enc_oppo_team_id: 'enc(7107)', away_team_type: 0, is_opponent_team_group: '0' });
    const generic = statMappingWrite({ ...editFormFrom(src), opponent: GENERIC_OPPONENT }, src);
    expect(generic?.body).toMatchObject({ enc_oppo_team_id: 'enc(0)', away_team_type: 1 });
    expect(generic?.body).not.toHaveProperty('is_opponent_team_group');
  });

  test('Scout is at home; a home team without a type is sent as "1"', () => {
    const src = source(RAW, { ...STAT, home: [{ id: 11, name: 'R2' }] });
    const write = statMappingWrite({ ...editFormFrom(src), tab: 'SCOUT' }, src);
    expect(write?.body).toMatchObject({ venue_type: 1, home_team_type: '1' });
  });

  test('no mapping: created when a team is set, else nothing', () => {
    const src = source(RAW, { ...STAT, mapping_id: 0 });
    expect(statMappingWrite(editFormFrom(src), src)).toEqual({
      kind: 'save',
      body: {
        enc_game_id: 'enc(125878)',
        enc_myteam_id: 'enc(11)',
        enc_oppo_team_id: 'enc(3320)',
        venue_type: 2,
        myteam_color_code: '#000000',
        oppo_color_code: '#000000',
      },
    });
    const bare = source(RAW, { mapping_id: 0 }, true);
    expect(statMappingWrite(editFormFrom(bare), bare)).toBeNull();
  });
});

describe('saving an edit', () => {
  const UPDATE = '/api/game/updateGame';
  const EDIT_MAPPING = '/api/editStatGameTeamMapping';
  const KEY = '1:11907:11:GAMES';

  // The reply leaves out the camera and zone fields, as the server's does.
  const reply = (body: any) => {
    const game: Record<string, unknown> = { ...RAW, name: body.name };
    for (const key of ['facilitycam_unique_ids', 'facilitycam_duration', 'facilitycam_room_id', 'state_timezone_mapping_id']) {
      delete game[key];
    }
    return ok({ game });
  };

  test('the game, then its home / away teams; the stored row keeps its cameras and zone', async () => {
    writeGameListPage(KEY, 1, [mapGame(RAW)], -1);
    const calls = mockFetch((path, body) => (path === UPDATE ? reply(body) : ok(STAT)));
    const src = source();
    const result = await editGameFlow({ form: { ...editFormFrom(src), name: 'RN Test - Renamed' }, src, ctx: CTX });

    expect(calls.map(c => c.path)).toEqual([UPDATE, EDIT_MAPPING]);
    expect(result.teamsError).toBeNull();
    const stored = readGameList(KEY)!.games[0];
    expect(stored.name).toBe('RN Test - Renamed');
    expect(stored.facilitycamDuration).toBe(5430);
    expect(stored.stateTimezoneMappingId).toBe(71);
    expect(JSON.parse(stored.rawJson).facilitycam_unique_ids).toBe('cam1,cam2');
  });

  test('a name is needed before anything is sent', async () => {
    const calls = mockFetch(() => ok({}));
    const src = source();
    await expect(editGameFlow({ form: { ...editFormFrom(src), name: '  ' }, src, ctx: CTX })).rejects.toThrow('Please enter a name.');
    expect(calls).toHaveLength(0);
  });

  test('the game saved but its teams refused: said so, and the game is not sent again', async () => {
    const calls = mockFetch((path, body) => (path === UPDATE ? reply(body) : refused('Required parameters not found')));
    const src = source();
    const result = await editGameFlow({ form: editFormFrom(src), src, ctx: CTX });
    expect(result.teamsError).toBe('Required parameters not found');
    expect(calls.filter(c => c.path === UPDATE)).toHaveLength(1);
  });

  test('the game refused: the error, and no second write', async () => {
    const calls = mockFetch(() => refused('Game not found'));
    const src = source();
    await expect(editGameFlow({ form: editFormFrom(src), src, ctx: CTX })).rejects.toThrow('Game not found');
    expect(calls.map(c => c.path)).toEqual([UPDATE]);
  });

  test('a reply without the game: nothing stored, the teams still saved', async () => {
    writeGameListPage(KEY, 1, [mapGame(RAW)], -1);
    const calls = mockFetch(() => ok({}));
    const src = source();
    const result = await editGameFlow({ form: { ...editFormFrom(src), name: 'Other' }, src, ctx: CTX });
    expect(result.game).toBeNull();
    expect(readGameList(KEY)!.games[0].name).toBe('RN Test - Game');
    expect(calls.map(c => c.path)).toEqual([UPDATE, EDIT_MAPPING]);
  });

  test('changed to Scout: the stored row has no cameras, as sent', async () => {
    writeGameListPage(KEY, 1, [mapGame(RAW)], -1);
    mockFetch((path, body) => (path === UPDATE ? reply(body) : ok(STAT)));
    const src = source();
    const result = await editGameFlow({ form: { ...editFormFrom(src), tab: 'SCOUT' }, src, ctx: CTX });
    expect(result.game?.facilitycamDuration).toBe(0);
    expect(JSON.parse(result.game!.rawJson).facilitycam_unique_ids).toBe('');
  });

  test('no mapping but a team: the mapping is created', async () => {
    const calls = mockFetch((path, body) => (path === UPDATE ? reply(body) : ok({})));
    const src = source(RAW, { ...STAT, mapping_id: 0 });
    await editGameFlow({ form: editFormFrom(src), src, ctx: CTX });
    expect(calls.map(c => c.path)).toEqual([UPDATE, '/api/saveStatGameTeamMapping']);
    expect(calls[1].body.enc_game_id).toBe('enc(125878)');
  });

  test('no mapping and no teams: one write', async () => {
    const calls = mockFetch((path, body) => reply(body));
    const src = source(RAW, { mapping_id: 0 }, true);
    await editGameFlow({ form: editFormFrom(src), src, ctx: { ...CTX, isHomeOrg: true } });
    expect(calls.map(c => c.path)).toEqual([UPDATE]);
  });
});

describe('the menu', () => {
  test('admins, coaches and home users: Edit, Reload, Share, Delete; others Reload and Share', () => {
    for (const role of [UserRole.Admin, UserRole.Coach, UserRole.HomeUser]) {
      expect(gameMenuOptions({ role, opponentFilter: false })).toEqual(['edit', 'reload', 'share', 'delete']);
    }
    for (const role of [UserRole.Player, UserRole.Follower, UserRole.Manager]) {
      expect(gameMenuOptions({ role, opponentFilter: false })).toEqual(['reload', 'share']);
    }
  });

  test('an opponent’s games: only Share', () => {
    expect(gameMenuOptions({ role: UserRole.Admin, opponentFilter: true })).toEqual(['share']);
  });

  test('edit: the creator, an admin or a coach; not another user’s home game', () => {
    const viewer = (role: UserRole, isTablet = true) => ({ role, userId: 1, isTablet });
    expect(canChangeGame('edit', { userId: 1 }, viewer(UserRole.HomeUser))).toBe(true);
    expect(canChangeGame('edit', { userId: 9 }, viewer(UserRole.Coach))).toBe(true);
    expect(canChangeGame('edit', { userId: 9 }, viewer(UserRole.Admin))).toBe(true);
    expect(canChangeGame('edit', { userId: 9 }, viewer(UserRole.HomeUser))).toBe(false);
    expect(canChangeGame('edit', { userId: 9 }, viewer(UserRole.HomeUser, false))).toBe(false);
  });

  test('delete: on the iPad as edit; on the iPhone anyone offered Delete', () => {
    expect(canChangeGame('delete', { userId: 9 }, { role: UserRole.HomeUser, userId: 1, isTablet: true })).toBe(false);
    expect(canChangeGame('delete', { userId: 9 }, { role: UserRole.HomeUser, userId: 1, isTablet: false })).toBe(true);
    expect(canChangeGame('delete', { userId: 9 }, { role: UserRole.Player, userId: 1, isTablet: false })).toBe(false);
  });

  test('the shared link: the short link, else the game’s link, else its watch page', () => {
    const game = (raw: Record<string, unknown>) => ({ id: 5, rawJson: JSON.stringify(raw) });
    expect(gameShareLink(game({ short_url: 'https://s/1', url: 'https://u/1' }))).toBe('https://s/1');
    expect(gameShareLink(game({ short_url: '', url: 'https://u/1' }))).toBe('https://u/1');
    expect(gameShareLink(game({}))).toBe('https://aicloud.snipback.com/streaming/5');
    expect(gameShareLink({ id: 6, rawJson: 'not json' })).toBe('https://aicloud.snipback.com/streaming/6');
  });
});

describe('reload and delete', () => {
  const KEY = '1:11907:11:GAMES';

  test('reload: the server’s copy replaces the stored one', async () => {
    writeGameListPage(KEY, 1, [mapGame(RAW)], -1);
    mockFetch(() => ok({ games: [{ ...RAW, name: 'Renamed on the website' }] }));
    await reloadGameFlow(125878);
    expect(readGameList(KEY)!.games[0].name).toBe('Renamed on the website');
  });

  test('delete: to Deleted Film (flag 0), then left out of every list', async () => {
    writeGameListPage(KEY, 1, [mapGame(RAW), mapGame({ ...RAW, id: 2, name: 'Other' })], -1);
    const calls = mockFetch(() => ok({}));
    await deleteGameFlow(125878);
    expect(calls).toEqual([{ path: '/api/deleteGame', body: { enc_id: 'enc(125878)', deleteGameFlag: 0 } }]);
    expect(readGameList(KEY)!.games.map(g => g.name)).toEqual(['Other']);
  });

  test('a refused delete changes nothing here', async () => {
    writeGameListPage(KEY, 1, [mapGame(RAW)], -1);
    mockFetch(() => refused('Permission denied'));
    await expect(deleteGameFlow(125878)).rejects.toThrow('Permission denied');
    expect(readGameList(KEY)!.games).toHaveLength(1);
  });
});
