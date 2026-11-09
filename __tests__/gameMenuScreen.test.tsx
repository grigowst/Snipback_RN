/**
 * Step 10: a game's "⋮" menu in the tablet hub and on the phone: Edit Game
 * (the form filled from the game read fresh), Reload, Share and Delete,
 * against a mocked API (which records every write) and a real in-memory Realm.
 *
 * @format
 */

// RSA is replaced by a readable marker so the request bodies can be checked.
jest.mock('../src/utils/rsa', () => ({ rsaEncrypt: (v: unknown) => `enc(${v})` }));

import React from 'react';
import { Alert, Share } from 'react-native';
import ReactTestRenderer, { type ReactTestRenderer as Renderer } from 'react-test-renderer';
import * as Keychain from 'react-native-keychain';
import App from '../App';
import * as device from '../src/utils/device';
import * as zonedTime from '../src/games/zonedTime';

jest.useFakeTimers();

const NOW = Date.UTC(2026, 10, 9, 12, 0) / 1000; // 9 Nov 2026, 12:00 UTC

const USER = { id: 1, name: 'Test Coach', email: 'coach@example.com', token: 'abc' };
const ORGS = [
  { id: 100, name: 'Coach Home', user_id: 1, role_id: 3, organization_type: 2, is_active: 1 },
  { id: 200, name: 'Alpha FC', user_id: 1, role_id: 1, organization_type: 1, is_active: 1, organization_category: 3 },
  { id: 400, name: 'Gamma FC', user_id: 1, role_id: 2, organization_type: 1, is_active: 1 },
];
const TEAMS: Record<number, unknown[]> = {
  200: [
    { id: 11, name: 'U14', organization_id: 200, players_list: [] },
    { id: 12, name: 'U16', organization_id: 200, players_list: [] },
  ],
  400: [{ id: 41, name: 'G1', organization_id: 400, players_list: [] }],
};
const ZONES = [
  { id: 1, state_name: 'Alabama', state_short_code: 'AL', time_zone: 'Central Standard Time', php_equivalent: 'America/Chicago', gmt_value: 'GMT-06:00' },
  { id: 71, state_name: 'India', state_short_code: 'IN', time_zone: 'India Standard Time', php_equivalent: 'Asia/Kolkata', gmt_value: 'GMT+05:30' },
];

/** Alpha FC's U14 game against a name-only opponent, made by another coach (user 9). */
const GAME = {
  id: 700,
  name: 'Home Opener',
  game_date: NOW + 86400,
  organization_id: 200,
  user_id: 9,
  status: 0,
  upload_status: 0,
  game_type: 1,
  game_mode: 1,
  category: 3,
  isLiveBroadcasting: 0,
  public: 1,
  post_to_website: 1,
  statreport_visibility: 0,
  balltracking: 1,
  amount: 0,
  timetofree: 0,
  facilitycam_room_id: 0,
  facilitycam_unique_ids: '',
  facilitycam_duration: 0,
  state_timezone_mapping_id: 71,
  test_game: 0,
  storage_type: 1,
  short_url: 'https://snipb.ac/opener',
  teamMapping: [
    { team_id: 11, name: 'U14', type: 1 },
    { team_id: 3320, name: 'Rivals', type: 2 },
    { team_id: 12, name: 'U16', type: 3 },
  ],
};
const HOME_GAME = { ...GAME, id: 701, name: 'Backyard', organization_id: 100, teamMapping: [] };
const PLAYER_GAME = { ...GAME, id: 702, name: 'Gamma Day', organization_id: 400 };
const STAT = {
  home: [{ id: 11, name: 'U14', team_type: 0 }],
  away: [{ id: 3320, name: 'Rivals', team_type: 1, is_opponent: 1 }],
  venue_type: 1,
  mapping_id: 55,
  stat_count: 0,
  volley_game_rotation: [],
};

type Call = { path: string; body: any };
const ok = (data: unknown) => ({ status: true, message: '', data });

type Options = {
  game?: Record<string, unknown>;
  /** The team's saved home and away defaults (none by default). */
  defaults?: boolean;
  stat?: Record<string, unknown>;
  update?: 'network' | 'refused';
  mapping?: 'refused';
};

function mockApi(options: Options = {}) {
  const calls: Call[] = [];
  const games: Record<number, Record<string, unknown>[]> = {
    100: [HOME_GAME],
    200: [{ ...GAME, ...options.game }],
    400: [PLAYER_GAME],
  };
  const all = () => Object.values(games).flat();
  (global as any).fetch = jest.fn(async (url: string, init: { body?: string }) => {
    const [path, query] = url.replace(/^https?:\/\/[^/]+/, '').split('?');
    const body = init.body ? JSON.parse(init.body) : { query };
    calls.push({ path, body });
    const reply = (data: unknown, status = 200) => ({ status, json: async () => data });
    const idOf = (enc: string) => Number(/enc\((\d+)\)/.exec(enc)?.[1]);
    switch (path) {
      case '/api/getUsersOrganizationV1':
        return reply(ok({ organizations: ORGS, paging: { next: -1 } }));
      case '/api/team/list/myteamsV3':
        return reply(ok({ team: TEAMS[body.organization_id] ?? [], paging: { next: -1 } }));
      case '/api/getAllUsersV2':
        return reply(ok({ players: [], paging: { next: -1 } }));
      case '/api/getUsersAssociateOrganizations':
        return reply(ok({ organizations: [], paging: { next: -1 } }));
      case '/api/team/list/listMyOpponentTeam':
        return reply(ok({ team: [], paging: { next: -1 } }));
      case '/api/game/listGamesV2': {
        const org = idOf(body.enc_organization_id) || 100;
        const list = body.game_type === 1 ? games[org] ?? [] : [];
        return reply(ok({ games: list, paging: { next: -1 } }));
      }
      case '/api/game/getStatesAndTimeZone':
        return reply(ok({ states_and_timezone: ZONES, selected: 1 }));
      case '/api/game/listGameCategories':
        return reply(ok({ categories: [{ id: 3, category_name: 'Basketball' }], paging: { next: -1 } }));
      case '/api/team/listDefaultSettings':
        return reply(
          ok({
            default_settings: options.defaults
              ? [
                  { type: 1, game_type: 1, category: 3, isLiveBroadcasting: 2, public: 1, post_to_website: 1, statreport_visibility: 1, balltracking: 2 },
                  { type: 2, game_type: 1, category: 3, isLiveBroadcasting: 0, public: 0, post_to_website: 0, statreport_visibility: 0, balltracking: 0 },
                ]
              : [],
          }),
        );
      case '/api/filmExchange/destinations':
        return reply(ok({ directory: [], results: [], named: [], page: 1, has_more: false }));
      case '/api/getGame':
        return reply(ok({ games: all().filter(g => g.id === idOf(body.enc_id)) }));
      case '/api/listStatHomeAndAwayTeams':
        return reply(ok({ ...STAT, ...options.stat }));
      case '/api/game/updateGame': {
        if (options.update === 'network') {
          throw new TypeError('Network request failed');
        }
        if (options.update === 'refused') {
          return reply({ status: false, message: 'Game name already used' });
        }
        const id = idOf(body.enc_id);
        for (const list of Object.values(games)) {
          const g = list.find(x => x.id === id);
          if (g) {
            g.name = body.name;
          }
        }
        // The reply has no camera fields, as the server's doesn't.
        const game: Record<string, unknown> = { ...all().find(g => g.id === id)! };
        delete game.facilitycam_unique_ids;
        delete game.facilitycam_duration;
        return reply(ok({ game }));
      }
      case '/api/editStatGameTeamMapping':
        if (options.mapping === 'refused') {
          return reply({ status: false, message: 'Required parameters not found' });
        }
        return reply(ok(STAT));
      case '/api/deleteGame': {
        const id = idOf(body.enc_id);
        for (const org of Object.keys(games)) {
          games[Number(org)] = games[Number(org)].filter(g => g.id !== id);
        }
        return reply(ok({}));
      }
      default:
        return reply({ status: false, message: 'not mocked' }, 404);
    }
  });
  const reads = [
    '/api/getUserProfile',
    '/api/getUsersOrganizationV1',
    '/api/team/list/myteamsV3',
    '/api/getAllUsersV2',
    '/api/getUsersAssociateOrganizations',
    '/api/team/list/listMyOpponentTeam',
    '/api/game/listGamesV2',
    '/api/game/getStatesAndTimeZone',
    '/api/game/listGameCategories',
    '/api/team/listDefaultSettings',
    '/api/filmExchange/destinations',
    '/api/getGame',
    '/api/listStatHomeAndAwayTeams',
  ];
  return {
    calls,
    writes: () => calls.filter(c => !reads.includes(c.path)),
    to: (p: string) => calls.filter(c => c.path === p),
  };
}

async function flush() {
  for (let i = 0; i < 16; i++) {
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
    });
  }
}
async function wait(ms: number) {
  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(ms);
  });
  await flush();
}

const texts = (r: Renderer) =>
  r.root.findAll(n => typeof n.props.children === 'string').map(n => n.props.children as string);
const byLabel = (r: Renderer, label: string) =>
  r.root.findAll(n => n.props.accessibilityLabel === label && (n.props.onPress || n.props.onChangeText))[0];
const selected = (r: Renderer, label: string) => byLabel(r, label)?.props.accessibilityState?.selected;
const menuOptions = (r: Renderer) =>
  ['Edit Game', 'Reload Game', 'Share Game', 'Delete'].filter(label => byLabel(r, label) !== undefined);

async function press(r: Renderer, label: string) {
  const node = byLabel(r, label);
  if (!node) {
    throw new Error(`Nothing labelled "${label}"`);
  }
  await ReactTestRenderer.act(async () => {
    node.props.onPress();
  });
  await flush();
}
async function type(r: Renderer, label: string, value: string) {
  await ReactTestRenderer.act(async () => {
    byLabel(r, label).props.onChangeText(value);
  });
  await flush();
}
async function layout(r: Renderer, width: number) {
  const boxes = r.root.findAll(n => typeof n.props.onLayout === 'function');
  await ReactTestRenderer.act(async () => {
    boxes.forEach(b => b.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width, height: 700 } } }));
  });
}
const lastAlert = () => {
  const calls = (Alert.alert as jest.Mock).mock.calls;
  return calls[calls.length - 1];
};
/** Presses a button of the last alert (the delete confirmation). */
async function answerAlert(text: string) {
  const button = (lastAlert()[2] as { text: string; onPress?: () => void }[]).find(b => b.text === text);
  await ReactTestRenderer.act(async () => {
    button?.onPress?.();
  });
  await flush();
}

async function open(orgId: number, tablet = true): Promise<Renderer> {
  jest.setSystemTime(new Date(NOW * 1000));
  jest.spyOn(device, 'isTablet').mockReturnValue(tablet);
  jest.spyOn(zonedTime, 'deviceZone').mockReturnValue('Asia/Kolkata');
  (Keychain.getGenericPassword as jest.Mock).mockResolvedValue({
    username: 'session',
    password: JSON.stringify({ token: 'abc', user: USER, selectedOrgId: orgId }),
  });
  let r!: Renderer;
  await ReactTestRenderer.act(async () => {
    r = ReactTestRenderer.create(<App />);
  });
  await wait(1000);
  await layout(r, tablet ? 1024 : 390);
  await press(r, orgId === 100 ? 'GAMES' : 'GAMES/TEAMS');
  if (orgId === 200 && tablet) {
    await press(r, 'Team U14');
  }
  return r;
}

async function openEdit(options: Options = {}, tablet = true, allTeams = false) {
  const api = mockApi(options);
  const r = await open(200, tablet);
  if (allTeams) {
    await press(r, 'Team Org - All Teams');
  }
  await press(r, 'More options for Home Opener');
  await press(r, 'Edit Game');
  await wait(300);
  return { api, r };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('the menu', () => {
  test('a coach: Edit Game, Reload Game, Share Game and Delete', async () => {
    mockApi();
    const r = await open(200);
    await press(r, 'More options for Home Opener');
    expect(texts(r)).toContain('Home Opener');
    expect(menuOptions(r)).toEqual(['Edit Game', 'Reload Game', 'Share Game', 'Delete']);
    await press(r, 'DISMISS');
    expect(byLabel(r, 'Edit Game')).toBeUndefined();
  });

  test('a player: Reload and Share only', async () => {
    mockApi();
    const r = await open(400);
    await press(r, 'More options for Gamma Day');
    expect(menuOptions(r)).toEqual(['Reload Game', 'Share Game']);
  });

  test('an opponent’s games in the hub: Share only', async () => {
    mockApi();
    const r = await open(200);
    await press(r, 'Opponent team');
    await wait(300);
    await press(r, 'More options for Home Opener');
    expect(menuOptions(r)).toEqual(['Share Game']);
  });

  test('Share Game sends the game’s short link', async () => {
    mockApi();
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction', activityType: undefined });
    const r = await open(200);
    await press(r, 'More options for Home Opener');
    await press(r, 'Share Game');
    expect(share).toHaveBeenCalledWith({ url: 'https://snipb.ac/opener' });
  });

  test('a home user can’t edit or delete another user’s game', async () => {
    const api = mockApi();
    const r = await open(100);
    await press(r, 'More options for Backyard');
    await press(r, 'Edit Game');
    expect(lastAlert()).toEqual(['Alert', 'Permission Denied']);
    await press(r, 'Delete');
    expect(lastAlert()).toEqual(['Alert', 'Permission Denied']);
    expect(api.to('/api/getGame')).toHaveLength(0);
    expect(api.writes()).toHaveLength(0);
  });

  test('Reload Game reads the game again and refreshes the list', async () => {
    const api = mockApi();
    const r = await open(200);
    const lists = api.to('/api/game/listGamesV2').length;
    await press(r, 'More options for Home Opener');
    await press(r, 'Reload Game');
    expect(api.to('/api/getGame')[0].body).toEqual({ enc_id: 'enc(700)' });
    expect(api.to('/api/game/listGamesV2').length).toBeGreaterThan(lists);
    expect(lastAlert()).toEqual(['Reloaded', 'Your game is ready to use now.']);
    expect(api.writes()).toHaveLength(0);
  });
});

describe('Edit Game', () => {
  test('reads the game and its teams fresh, and fills the form from them', async () => {
    const { api, r } = await openEdit();
    expect(api.calls.map(c => c.path).filter(p => ['/api/getGame', '/api/listStatHomeAndAwayTeams'].includes(p))).toEqual([
      '/api/getGame',
      '/api/listStatHomeAndAwayTeams',
    ]);
    expect(api.to('/api/listStatHomeAndAwayTeams')[0].body).toEqual({ game_id: 700 });
    expect(texts(r)).toContain('EDIT GAME');
    expect(byLabel(r, 'Name').props.value).toBe('Home Opener');
    expect(selected(r, 'Mode: GAMES')).toBe(true);
    expect(texts(r)).toContain('India(IN) - India Standard Time(GMT+05:30)'); // the game's zone, not the org's
    expect(texts(r)).toContain('Tue, Nov 10, 2026 · 5:30 PM'); // its start on that clock
    expect(texts(r)).toContain('U14'); // My team
    expect(texts(r)).toContain('Rivals');
    expect(texts(r)).toContain('U16'); // other teams
    await press(r, 'Advanced features');
    expect(selected(r, 'Live snipping: PUBLIC')).toBe(true);
    expect(selected(r, 'Ball tracking: ENABLED')).toBe(true);
    expect(texts(r)).toContain('Payment, cameras and the test-game setting are kept as they are.');
    expect(api.writes()).toHaveLength(0);
  });

  test('UPDATE sends the game, then its home and away teams, and the list shows the new name', async () => {
    const { api, r } = await openEdit();
    await type(r, 'Name', 'Season Opener');
    await press(r, 'Venue: AWAY');
    await press(r, 'UPDATE');

    expect(api.writes().map(c => c.path)).toEqual(['/api/game/updateGame', '/api/editStatGameTeamMapping']);
    expect(api.to('/api/game/updateGame')[0].body).toEqual(
      expect.objectContaining({
        enc_id: 'enc(700)',
        name: 'Season Opener',
        game_date: NOW + 86400,
        venue_type: 2,
        teamList: '12',
        enc_myteam_id: 'enc(11)',
        enc_oppo_team_id: 'enc(3320)',
        is_opponent: '1',
        state_timezone_mapping_id: 71,
        balltracking: 1,
        storage_type: 1,
        enc_user_id: 'enc(1)',
        enc_organization_id: 'enc(200)',
      }),
    );
    expect(api.to('/api/editStatGameTeamMapping')[0].body).toEqual(
      expect.objectContaining({ enc_id: 'enc(55)', enc_myteam_id: 'enc(11)', venue_type: 2, is_opponent_team_group: '1' }),
    );
    expect(lastAlert()).toEqual(['Game updated', 'Season Opener was updated.']);
    expect(texts(r)).not.toContain('EDIT GAME');
    expect(byLabel(r, 'More options for Season Opener')).toBeDefined();
  });

  test('the teams refused after the game saved: said so, and nothing is sent again', async () => {
    const { api, r } = await openEdit({ mapping: 'refused' });
    await press(r, 'UPDATE');
    expect(api.to('/api/game/updateGame')).toHaveLength(1);
    expect(lastAlert()).toEqual([
      'Game saved',
      'Home Opener was saved, but its home and away teams were not updated: Required parameters not found',
    ]);
  });

  test('no answer: no retry, and the form says the changes may have been saved', async () => {
    const { api, r } = await openEdit({ update: 'network' });
    await press(r, 'UPDATE');
    expect(api.to('/api/game/updateGame')).toHaveLength(1);
    expect(api.to('/api/editStatGameTeamMapping')).toHaveLength(0);
    expect(texts(r).some(t => t.includes('The changes may still have been saved'))).toBe(true);
    expect(texts(r)).toContain('EDIT GAME');
  });

  test('a refusal shows the server’s message and keeps the form', async () => {
    const { r } = await openEdit({ update: 'refused' });
    await press(r, 'UPDATE');
    expect(texts(r)).toContain('Game name already used');
    expect(texts(r)).toContain('EDIT GAME');
  });

  test('stats already taken: the opponent can’t be changed', async () => {
    const { r } = await openEdit({ stat: { stat_count: 3 } });
    await press(r, 'Choose opponent team');
    expect(lastAlert()).toEqual(['Alert', 'Unable to edit as stat already initiated.']);
    expect(texts(r)).not.toContain('OPPONENT TEAM');
  });

  test('a camera game recording now: the start and zone are shown, not changeable, and the start isn’t sent', async () => {
    const { api, r } = await openEdit({
      game: { status: 1, facilitycam_unique_ids: 'cam1', facilitycam_duration: 3600, facilitycam_room_id: 4 },
    });
    expect(byLabel(r, 'Change start')).toBeUndefined();
    expect(byLabel(r, 'Change time zone')).toBeUndefined();
    expect(texts(r)).toContain('Recording now: the start and time zone can’t be changed.'.replace('’', "'"));
    await press(r, 'UPDATE');
    const body = api.to('/api/game/updateGame')[0].body;
    expect(body).not.toHaveProperty('game_date');
    expect(body).toMatchObject({ facility_cam_uniqueids: 'cam1', facility_cam_duration: 3600, facilitycam_room_id: 4 });
  });

  test('a game without a zone gets the device’s, not the organisation’s', async () => {
    const { api, r } = await openEdit({ game: { state_timezone_mapping_id: 0 } });
    expect(texts(r)).toContain('India(IN) - India Standard Time(GMT+05:30)'); // the device's (the org's is Alabama)
    await press(r, 'UPDATE');
    expect(api.to('/api/game/updateGame')[0].body.state_timezone_mapping_id).toBe(71);
  });

  test('the team’s defaults: not applied on opening; a new venue applies that venue’s, as in iOS', async () => {
    const { r } = await openEdit({ defaults: true, game: { public: 0, balltracking: 0 } });
    await press(r, 'Advanced features');
    expect(selected(r, 'Live snipping: PRIVATE')).toBe(true); // the game's, not the home defaults'
    await press(r, 'Venue: AWAY');
    await press(r, 'Venue: HOME');
    expect(selected(r, 'Live snipping: PUBLIC')).toBe(true); // the home defaults now
    expect(selected(r, 'Ball view: CORNER VIEW')).toBe(true);
  });

  test('a game already played keeps its options when the venue changes', async () => {
    const { api, r } = await openEdit({ defaults: true, game: { status: 2, public: 0 } });
    expect(api.to('/api/team/listDefaultSettings')).toHaveLength(0);
    await press(r, 'Advanced features');
    await press(r, 'Venue: AWAY');
    await press(r, 'Venue: HOME');
    expect(selected(r, 'Live snipping: PRIVATE')).toBe(true);
  });

  test('from Org - All Teams: allowed, and the game’s own team is left out of the opponent search and Other Teams', async () => {
    const { api, r } = await openEdit({}, true, true);
    expect(texts(r)).toContain('EDIT GAME');
    await press(r, 'Choose opponent team');
    await wait(300);
    const search = api.to('/api/filmExchange/destinations');
    expect(search[search.length - 1].body).toMatchObject({ enc_organization_id: 'enc(200)', exclude_team_ids: '11' });
    await press(r, 'BACK');
    await press(r, 'Choose other teams');
    expect(byLabel(r, 'Other team U16')).toBeDefined();
    expect(byLabel(r, 'Other team U14')).toBeUndefined();
  });

  test('the opponent search is the game’s own program’s', async () => {
    const { api, r } = await openEdit({ game: { organization_id: 210 } });
    await press(r, 'Choose opponent team');
    await wait(300);
    const search = api.to('/api/filmExchange/destinations');
    expect(search[search.length - 1].body.enc_organization_id).toBe('enc(210)');
  });

  test('on the phone too', async () => {
    const { api, r } = await openEdit({}, false);
    expect(texts(r)).toContain('EDIT GAME');
    await press(r, 'UPDATE');
    expect(api.writes().map(c => c.path)).toEqual(['/api/game/updateGame', '/api/editStatGameTeamMapping']);
  });
});

describe('Delete', () => {
  test('asks first; DELETE moves the game to Deleted Film and it leaves the list', async () => {
    const api = mockApi();
    const r = await open(200);
    await press(r, 'More options for Home Opener');
    await press(r, 'Delete');
    expect(lastAlert()[1]).toBe('Are you sure you want to delete Home Opener?');
    expect(api.writes()).toHaveLength(0);

    await answerAlert('DELETE');
    expect(api.writes()).toEqual([{ path: '/api/deleteGame', body: { enc_id: 'enc(700)', deleteGameFlag: 0 } }]);
    expect(lastAlert()).toEqual(['Deleted', 'Home Opener was deleted.']);
    expect(byLabel(r, 'More options for Home Opener')).toBeUndefined();
  });

  test('CANCEL sends nothing', async () => {
    const api = mockApi();
    const r = await open(200);
    await press(r, 'More options for Home Opener');
    await press(r, 'Delete');
    await answerAlert('CANCEL');
    expect(api.writes()).toHaveLength(0);
    expect(byLabel(r, 'More options for Home Opener')).toBeDefined();
  });
});
