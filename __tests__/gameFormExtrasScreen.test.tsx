/**
 * Step 11: the rest of the game form: volleyball's starting rotations (create
 * and edit), changing My Team when editing, and Map to Teams on the iPad
 * hub's "Org - All Teams". Against a mocked API (which records every write)
 * and a real in-memory Realm.
 *
 * @format
 */

// RSA is replaced by a readable marker so the request bodies can be checked.
jest.mock('../src/utils/rsa', () => ({ rsaEncrypt: (v: unknown) => `enc(${v})` }));

import React from 'react';
import { Alert } from 'react-native';
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
];
const TEAMS: Record<number, unknown[]> = {
  200: [
    { id: 11, name: 'U14', organization_id: 200, players_list: [] },
    { id: 12, name: 'U16', organization_id: 200, players_list: [] },
    { id: 13, name: 'U18', organization_id: 200, players_list: [] },
  ],
};
const ZONES = [
  { id: 71, state_name: 'India', state_short_code: 'IN', time_zone: 'India Standard Time', php_equivalent: 'Asia/Kolkata', gmt_value: 'GMT+05:30' },
];

/** U14's basketball game against a name-only opponent, with U16 as another team. */
const GAME = {
  id: 700,
  name: 'Home Opener',
  game_date: NOW + 86400,
  organization_id: 200,
  user_id: 1,
  status: 0,
  upload_status: 0,
  game_type: 1,
  game_mode: 1,
  category: 3,
  public: 0,
  post_to_website: 0,
  statreport_visibility: 0,
  balltracking: 0,
  isLiveBroadcasting: 0,
  facilitycam_unique_ids: '',
  facilitycam_duration: 0,
  state_timezone_mapping_id: 71,
  storage_type: 1,
  teamMapping: [
    { team_id: 11, name: 'U14', type: 1 },
    { team_id: 3320, name: 'Rivals', type: 2 },
    { team_id: 12, name: 'U16', type: 3 },
  ],
};
/** U14's volleyball game, with set 1's rotations saved. */
const VOLLEY = { ...GAME, id: 703, name: 'Spike Night', category: 5, teamMapping: [{ team_id: 11, name: 'U14', type: 1 }] };

const STAT = {
  home: [{ id: 11, name: 'U14', team_type: 0 }],
  away: [{ id: 3320, name: 'Rivals', team_type: 1, is_opponent: 1 }],
  venue_type: 1,
  mapping_id: 55,
  stat_count: 0,
  volley_game_rotation: [],
};

/** Each team's saved home and away defaults; U16's home ones are public. */
const defaultsOf = (teamId: number) => [
  { type: 1, game_type: 1, category: 3, isLiveBroadcasting: 0, public: teamId === 12 ? 1 : 0, post_to_website: 0, statreport_visibility: 0, balltracking: 0 },
  { type: 2, game_type: 1, category: 3, isLiveBroadcasting: 0, public: 0, post_to_website: 0, statreport_visibility: 0, balltracking: 0 },
];

type Call = { path: string; body: any };
const ok = (data: unknown, message = '') => ({ status: true, message, data });

type Options = {
  /** The home / away answer for game 700 (basketball). */
  stat?: Record<string, unknown>;
  mapping?: 'refused';
  /** This team's defaults answer only when released. */
  holdDefaultsFor?: number;
};

function mockApi(options: Options = {}) {
  const calls: Call[] = [];
  let held: (() => void)[] = [];
  const hidden = new Set<number>();
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
        const org = idOf(body.enc_organization_id);
        const games = org === 200 && body.game_type === 1 ? [GAME, VOLLEY] : org === 200 && body.game_type === 0 ? [{ ...GAME, id: 710, name: 'Drill', game_type: 0 }] : [];
        return reply(ok({ games: games.filter(g => !hidden.has(g.id)), paging: { next: -1 } }));
      }
      case '/api/game/getStatesAndTimeZone':
        return reply(ok({ states_and_timezone: ZONES, selected: 71 }));
      case '/api/game/listGameCategories':
        return reply(ok({ categories: [{ id: 3, category_name: 'Basketball' }, { id: 5, category_name: 'Volleyball' }], paging: { next: -1 } }));
      case '/api/team/listDefaultSettings': {
        const teamId = idOf(body.enc_team_id);
        const answer = reply(ok({ default_settings: defaultsOf(teamId) }));
        if (options.holdDefaultsFor === teamId) {
          return new Promise(resolve => held.push(() => resolve(answer)));
        }
        return answer;
      }
      case '/api/filmExchange/destinations':
        return reply(ok({ directory: [], results: [], named: [], page: 1, has_more: false }));
      case '/api/game/saveGame':
        return reply(ok({ game: { id: 900, name: body.name, game_type: body.game_type, game_date: body.game_date } }));
      case '/api/getGame': {
        const id = idOf(body.enc_id);
        return reply(ok({ game: [id === 703 ? VOLLEY : GAME] }));
      }
      case '/api/listStatHomeAndAwayTeams':
        return reply(ok({ ...STAT, ...options.stat }));
      case '/api/volleyball/listVolleyStatHomeAndAwayTeams':
        return reply(ok({ ...STAT, away: [], volley_game_rotation: [{ period: 1, current_rotation_home: 2, current_rotation_away: 3 }] }));
      case '/api/game/updateGame':
        return reply(ok({ game: { ...(idOf(body.enc_id) === 703 ? VOLLEY : GAME), name: body.name } }));
      case '/api/editStatGameTeamMapping':
        return reply(ok(STAT));
      case '/api/gameTeamMapping':
        if (options.mapping === 'refused') {
          return reply({ status: false, message: 'Team mapping failed' });
        }
        return reply(ok({}, 'Game mapped successfully'));
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
    '/api/volleyball/listVolleyStatHomeAndAwayTeams',
  ];
  return {
    calls,
    writes: () => calls.filter(c => !reads.includes(c.path)),
    to: (p: string) => calls.filter(c => c.path === p),
    /** Answers the held defaults requests. */
    release: () => {
      held.forEach(answer => answer());
      held = [];
    },
    /** The server stops listing a game. */
    hide: (id: number) => hidden.add(id),
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
const anyLabel = (r: Renderer, label: string) => r.root.findAll(n => n.props.accessibilityLabel === label)[0];
const state = (r: Renderer, label: string) => byLabel(r, label)?.props.accessibilityState;

async function press(r: Renderer, label: string, times = 1) {
  for (let i = 0; i < times; i++) {
    const node = byLabel(r, label);
    if (!node) {
      throw new Error(`Nothing labelled "${label}"`);
    }
    await ReactTestRenderer.act(async () => {
      node.props.onPress();
    });
    await flush();
  }
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

async function open(tablet = true, team: string | null = 'U14'): Promise<Renderer> {
  jest.setSystemTime(new Date(NOW * 1000));
  jest.spyOn(device, 'isTablet').mockReturnValue(tablet);
  jest.spyOn(zonedTime, 'deviceZone').mockReturnValue('Asia/Kolkata');
  (Keychain.getGenericPassword as jest.Mock).mockResolvedValue({
    username: 'session',
    password: JSON.stringify({ token: 'abc', user: USER, selectedOrgId: 200 }),
  });
  let r!: Renderer;
  await ReactTestRenderer.act(async () => {
    r = ReactTestRenderer.create(<App />);
  });
  await wait(1000);
  await layout(r, tablet ? 1024 : 390);
  await press(r, 'GAMES/TEAMS');
  if (tablet && team) {
    await press(r, `Team ${team}`);
  }
  return r;
}

async function openEdit(game: string, options: Options = {}) {
  const api = mockApi(options);
  const r = await open();
  await press(r, `More options for ${game}`);
  await press(r, 'Edit Game');
  await wait(300);
  return { api, r };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('volleyball’s starting rotations', () => {
  test('creating: shown for volleyball only, and sent as picked', async () => {
    const api = mockApi();
    const r = await open();
    await press(r, 'Add game');
    await wait(300);
    await type(r, 'Name', 'Spike Day');
    expect(anyLabel(r, 'Set 1 home rotation: none')).toBeUndefined(); // basketball
    await press(r, 'Change category');
    await press(r, 'Category: Volleyball');
    expect(texts(r)).toContain('Starting rotations');
    expect(state(r, 'Set 1 home rotation down')?.disabled).toBe(true); // "--" is the lowest
    await press(r, 'Set 1 home rotation up', 2);
    await press(r, 'Set 3 away rotation up');
    expect(anyLabel(r, 'Set 1 home rotation: 2')).toBeDefined();
    await press(r, 'Set 3 away rotation up', 6);
    expect(state(r, 'Set 3 away rotation up')?.disabled).toBe(true); // 6 is the highest
    await press(r, 'CREATE');
    expect(api.to('/api/game/saveGame')[0].body.volley_game_rotation).toEqual([
      { period: 1, current_rotation_home: 2, current_rotation_away: 0 },
      { period: 3, current_rotation_home: 0, current_rotation_away: 6 },
    ]);
  });

  test('editing: the game’s rotations shown, and a change sent', async () => {
    const { api, r } = await openEdit('Spike Night');
    expect(api.to('/api/volleyball/listVolleyStatHomeAndAwayTeams')).toHaveLength(1);
    expect(anyLabel(r, 'Set 1 home rotation: 2')).toBeDefined();
    expect(anyLabel(r, 'Set 1 away rotation: 3')).toBeDefined();
    await press(r, 'Set 1 home rotation down');
    await press(r, 'UPDATE');
    expect(api.to('/api/game/updateGame')[0].body.volley_game_rotation).toEqual([
      { period: 1, current_rotation_home: 1, current_rotation_away: 3 },
    ]);
  });
});

describe('My Team when editing', () => {
  test('another team: sent in the game and its home / away teams, and taken out of Other Teams', async () => {
    const { api, r } = await openEdit('Home Opener');
    await press(r, 'Choose my team');
    expect(texts(r)).toContain('MY TEAM');
    expect(state(r, 'My team U14')?.selected).toBe(true);
    await press(r, 'My team U16');
    expect(texts(r)).toContain('U16');
    await press(r, 'UPDATE');
    expect(api.to('/api/game/updateGame')[0].body).toMatchObject({ enc_myteam_id: 'enc(12)', home_team_type: 0, teamList: '' });
    expect(api.to('/api/editStatGameTeamMapping')[0].body).toMatchObject({ enc_myteam_id: 'enc(12)' });
  });

  test('a late answer for the first team’s defaults doesn’t replace the new team’s', async () => {
    const { api, r } = await openEdit('Home Opener', { holdDefaultsFor: 11 });
    await press(r, 'Choose my team');
    await press(r, 'My team U16'); // U16's defaults answer at once
    await ReactTestRenderer.act(async () => {
      api.release(); // then U14's, late
    });
    await flush();
    await press(r, 'Advanced features');
    await press(r, 'Venue: AWAY');
    await press(r, 'Venue: HOME');
    expect(state(r, 'Live snipping: PUBLIC')?.selected).toBe(true); // U16's, not U14's
  });

  test('the opponent’s own team is refused', async () => {
    const { r } = await openEdit('Home Opener', { stat: { away: [{ id: 13, name: 'U18', team_type: 0, is_opponent: 0 }] } });
    await press(r, 'Choose my team');
    await press(r, 'My team U18');
    expect(lastAlert()).toEqual(['Alert', 'My team cannot be same as opponent team']);
    expect(texts(r)).toContain('MY TEAM'); // still choosing
  });

  test('the new team’s defaults apply when the venue changes; the opponent search leaves it out', async () => {
    const { api, r } = await openEdit('Home Opener');
    await press(r, 'Choose my team');
    await press(r, 'My team U16');
    expect(api.to('/api/team/listDefaultSettings').map(c => c.body.enc_team_id)).toEqual(['enc(11)', 'enc(12)']);
    await press(r, 'Advanced features');
    expect(state(r, 'Live snipping: PRIVATE')?.selected).toBe(true); // as the game has it
    await press(r, 'Venue: AWAY');
    await press(r, 'Venue: HOME');
    expect(state(r, 'Live snipping: PUBLIC')?.selected).toBe(true); // U16's home defaults
    await press(r, 'Choose opponent team');
    await wait(300);
    const search = api.to('/api/filmExchange/destinations');
    expect(search[search.length - 1].body.exclude_team_ids).toBe('12');
  });
});

describe('Map to Teams (iPad, "Org - All Teams")', () => {
  test('rows can be ticked only on a club’s "Org - All Teams" of its own teams, on the tablet', async () => {
    mockApi();
    let r = await open();
    expect(byLabel(r, 'Tick Home Opener')).toBeUndefined();
    await press(r, 'Team Org - All Teams');
    expect(byLabel(r, 'Tick Home Opener')).toBeDefined();
    await press(r, 'Opponent team');
    await wait(300);
    expect(byLabel(r, 'Tick Home Opener')).toBeUndefined();

    r = await open(false);
    expect(byLabel(r, 'Tick Home Opener')).toBeUndefined();
  });

  test('+ GAME with nothing ticked says how to map or create; nothing is sent', async () => {
    const api = mockApi();
    const r = await open(true, 'Org - All Teams');
    await press(r, 'Add game');
    expect(lastAlert()[1]).toBe('Tick games to map them to a team, or pick a team to create a game.');
    expect(texts(r)).not.toContain('MAP TO TEAMS');
    expect(api.writes()).toHaveLength(0);
  });

  test('the ticked games are mapped to the team picked, as another team; then the list is read again', async () => {
    const api = mockApi();
    const r = await open(true, 'Org - All Teams');
    await press(r, 'Tick Home Opener');
    await press(r, 'Tick Spike Night');
    await press(r, 'Tick Spike Night'); // unticked again
    expect(state(r, 'Tick Home Opener')).toEqual({ checked: true });
    await press(r, 'Add game');
    expect(texts(r)).toContain('MAP TO TEAMS');
    expect(texts(r)).toContain('1 game ticked.');
    expect(byLabel(r, 'Map to U14')).toBeDefined();
    expect(byLabel(r, 'Map to Org - All Teams')).toBeUndefined();

    await press(r, 'MAP');
    expect(texts(r)).toContain('Please choose a team to map');
    expect(api.writes()).toHaveLength(0);

    const lists = api.to('/api/game/listGamesV2').length;
    await press(r, 'Map as: OTHER TEAM');
    await press(r, 'Map to U16');
    await press(r, 'MAP');
    expect(api.writes()).toEqual([
      { path: '/api/gameTeamMapping', body: { game_id: '700', team_id: 12, team_type: 'other_team', created_by: 1 } },
    ]);
    expect(lastAlert()).toEqual(['', 'Game mapped successfully']);
    expect(texts(r)).not.toContain('MAP TO TEAMS');
    expect(api.to('/api/game/listGamesV2').length).toBeGreaterThan(lists);
    expect(byLabel(r, 'Tick Home Opener').props.accessibilityState).toEqual({ checked: false });
  });

  test('MY TEAM is the default; a refusal shows the server’s message and keeps the sheet', async () => {
    const api = mockApi({ mapping: 'refused' });
    const r = await open(true, 'Org - All Teams');
    await press(r, 'Tick Home Opener');
    await press(r, 'Add game');
    await press(r, 'Map to U14');
    await press(r, 'MAP');
    expect(api.to('/api/gameTeamMapping')[0].body.team_type).toBe('my_team');
    expect(texts(r)).toContain('Team mapping failed');
    expect(texts(r)).toContain('MAP TO TEAMS');
  });

  test('a ticked game the server no longer lists is not sent', async () => {
    const api = mockApi();
    const r = await open(true, 'Org - All Teams');
    await press(r, 'Tick Home Opener');
    await press(r, 'Tick Spike Night');
    api.hide(700);
    const refresh = r.root.findAll(n => typeof n.props.onRefresh === 'function')[0];
    await ReactTestRenderer.act(async () => {
      refresh.props.onRefresh();
    });
    await flush();
    expect(byLabel(r, 'Tick Home Opener')).toBeUndefined();
    await press(r, 'Add game');
    await press(r, 'Map to U16');
    await press(r, 'MAP');
    expect(api.to('/api/gameTeamMapping')[0].body.game_id).toBe('703');
  });

  test('ticks are cleared on another tab', async () => {
    mockApi();
    const r = await open(true, 'Org - All Teams');
    await press(r, 'Tick Home Opener');
    await press(r, 'PRACTICES tab');
    await press(r, 'GAMES tab');
    await wait(100);
    expect(byLabel(r, 'Tick Home Opener').props.accessibilityState).toEqual({ checked: false });
  });
});
