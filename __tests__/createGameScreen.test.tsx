/**
 * Step 9: creating a game from the tablet hub and the phone games list,
 * against a mocked API (which records every write) and a real in-memory Realm.
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
  { id: 200, name: 'Alpha FC', user_id: 1, role_id: 1, organization_type: 1, is_active: 1, organization_category: 7 },
  { id: 400, name: 'Gamma FC', user_id: 1, role_id: 2, organization_type: 1, is_active: 1 },
  { id: 500, name: 'Old FC', user_id: 1, role_id: 1, organization_type: 1, is_active: 0 },
];
const TEAMS: Record<number, unknown[]> = {
  200: [
    { id: 11, name: 'U14', organization_id: 200, players_list: [] },
    { id: 12, name: 'U16', organization_id: 200, players_list: [] },
  ],
  400: [{ id: 41, name: 'G1', organization_id: 400, players_list: [] }],
  500: [{ id: 51, name: 'O1', organization_id: 500, players_list: [] }],
};
const ZONES = [
  { id: 1, state_name: 'Alabama', state_short_code: 'AL', time_zone: 'Central Standard Time', php_equivalent: 'America/Chicago', gmt_value: 'GMT-06:00' },
  { id: 71, state_name: 'India', state_short_code: 'IN', time_zone: 'India Standard Time', php_equivalent: 'Asia/Kolkata', gmt_value: 'GMT+05:30' },
];
const row = (venue: number, extra: Record<string, unknown>) => ({
  type: venue,
  game_type: 1,
  category: 3,
  isLiveBroadcasting: 0,
  public: 1,
  post_to_website: 1,
  statreport_visibility: 1,
  balltracking: 0,
  facilitycam_unique_ids: '',
  facilitycam_duration: 0,
  facilitycam_room_id: 0,
  ...extra,
});

type Call = { path: string; body: any };
const ok = (data: unknown) => ({ status: true, message: '', data });

function mockApi(options: { saveFails?: 'network' | 'refused' } = {}) {
  const calls: Call[] = [];
  (global as any).fetch = jest.fn(async (url: string, init: { body?: string }) => {
    const [path, query] = url.replace(/^https?:\/\/[^/]+/, '').split('?');
    const body = init.body ? JSON.parse(init.body) : { query };
    calls.push({ path, body });
    const reply = (data: unknown, status = 200) => ({ status, json: async () => data });
    switch (path) {
      case '/api/getUsersOrganizationV1':
        return reply(ok({ organizations: ORGS, paging: { next: -1 } }));
      case '/api/team/list/myteamsV3':
        return reply(ok({ team: TEAMS[body.organization_id] ?? [], paging: { next: -1 } }));
      case '/api/getAllUsersV2':
        return reply(ok({ players: [], paging: { next: -1 } }));
      case '/api/getUsersAssociateOrganizations':
        return reply(ok({ organizations: [], paging: { next: -1 } }));
      case '/api/game/listGamesV2':
        return reply(ok({ games: [], paging: { next: -1 } }));
      case '/api/game/getStatesAndTimeZone':
        return reply(ok({ states_and_timezone: ZONES, selected: query === 'organization_id=200' ? 1 : 0 }));
      case '/api/game/listGameCategories':
        return reply(ok({ categories: [{ id: 3, category_name: 'Basketball' }, { id: 7, category_name: 'Football' }], paging: { next: -1 } }));
      case '/api/team/listDefaultSettings':
        return reply(
          ok({
            default_settings: [
              row(1, { isLiveBroadcasting: 2, balltracking: 2 }),
              row(2, { public: 0, post_to_website: 0, statreport_visibility: 0 }),
            ],
          }),
        );
      case '/api/filmExchange/destinations':
        return reply(
          ok({
            directory: body.q === '' ? [{ team_id: 5, label: 'Rival High · Varsity', sport: 'Basketball' }] : [],
            results:
              body.q === 'ne'
                ? [
                    { team_id: 7107, label: 'AA Q DEV · 001 new', sport: 'Football' },
                    { team_id: 11, label: 'Alpha FC · U14', sport: 'Football' },
                  ]
                : [],
            named: body.q === '' ? [{ opponent_id: 3320, name: 'RN Test Opponent', abbr: '' }] : [],
            page: 1,
            has_more: false,
          }),
        );
      case '/api/game/saveGame':
        if (options.saveFails === 'network') {
          throw new TypeError('Network request failed');
        }
        if (options.saveFails === 'refused') {
          return reply({ status: false, message: 'Game name already used' });
        }
        return reply(ok({ game: { id: 900, name: body.name, game_type: body.game_type, game_date: body.game_date } }));
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
    '/api/game/listGamesV2',
    '/api/game/getStatesAndTimeZone',
    '/api/game/listGameCategories',
    '/api/team/listDefaultSettings',
    '/api/filmExchange/destinations',
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

async function open(orgId: number, tablet = true): Promise<Renderer> {
  jest.setSystemTime(new Date(NOW * 1000));
  jest.spyOn(device, 'isTablet').mockReturnValue(tablet);
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
  return r;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('who can open the form', () => {
  test('a club organisation needs a team picked first', async () => {
    mockApi();
    const r = await open(200);
    await press(r, 'Team Org - All Teams');
    await press(r, 'Add game');
    expect(lastAlert()[1]).toBe('Please choose a team and continue');
    expect(texts(r).some(t => t.startsWith('CREATE GAME'))).toBe(false);
  });

  test('a player gets Permission Denied; an inactive organisation says so', async () => {
    mockApi();
    let r = await open(400);
    expect(byLabel(r, 'Add game')).toBeDefined();
    await press(r, 'Add game');
    expect(lastAlert()).toEqual(['Alert', 'Permission Denied']);

    r = await open(500);
    await press(r, 'Team O1');
    await press(r, 'Add game');
    expect(lastAlert()[0]).toBe('Organization Deactivated');
  });

  test('on a phone, + GAME is hidden for players and shown for coaches', async () => {
    mockApi();
    let r = await open(400, false);
    expect(byLabel(r, 'Add game')).toBeUndefined();
    r = await open(200, false);
    expect(byLabel(r, 'Add game')).toBeDefined();
  });
});

describe('creating a game', () => {
  async function openForm(tab: 'GAMES' | 'PRACTICES' | 'SCOUT' = 'GAMES') {
    const api = mockApi();
    const r = await open(200);
    await press(r, 'Team U14');
    await press(r, `${tab} tab`);
    jest.setSystemTime(new Date(NOW * 1000)); // the form starts at "now"
    await press(r, 'Add game');
    await wait(300);
    return { api, r };
  }

  test('opens with the list’s mode, the organisation’s zone and the team’s home defaults', async () => {
    const { r } = await openForm('PRACTICES');
    expect(texts(r)).toContain('CREATE GAME FOR U14');
    expect(selected(r, 'Mode: PRACTICE')).toBe(true);
    expect(texts(r)).toContain('Alabama(AL) - Central Standard Time(GMT-06:00)'); // the org's own zone
    expect(texts(r)).toContain('Mon, Nov 9, 2026 · 6:00 AM'); // now, on that zone's clock
    expect(texts(r)).toContain('Basketball'); // the team's sport
    await press(r, 'Advanced features');
    expect(selected(r, 'Live snipping: PUBLIC')).toBe(true);
    expect(selected(r, 'Secondary low-quality (LQ) stream: ENABLED')).toBe(true);
    expect(selected(r, 'Ball view: CORNER VIEW')).toBe(true);
    expect(texts(r)).toContain('All Practices/Scout are Private');
  });

  test('sends everything the form shows, then shows that mode’s list, refreshed', async () => {
    const { api, r } = await openForm('PRACTICES');
    await type(r, 'Name', 'Final');
    await press(r, 'Mode: GAMES');
    await press(r, 'Venue: AWAY'); // the away defaults: private, no stream, no tracking
    await press(r, 'Game type: CONFERENCE');
    await press(r, 'Choose opponent team');
    await wait(300);
    await press(r, 'Opponent RN Test Opponent');
    expect(texts(r)).toContain('A name-only opponent (not a SnipBack team).');
    await press(r, 'Choose other teams');
    await press(r, 'Other team U16');
    await press(r, 'DONE');
    const listCalls = api.to('/api/game/listGamesV2').length;
    await press(r, 'CREATE');

    expect(api.writes().map(c => c.path)).toEqual(['/api/game/saveGame']);
    expect(api.to('/api/game/saveGame')[0].body).toEqual(
      expect.objectContaining({
        name: 'Final',
        game_date: NOW,
        game_type: 1,
        venue_type: 2,
        game_mode: 2,
        enc_category: 'enc(3)',
        enc_myteam_id: 'enc(11)',
        enc_oppo_team_id: 'enc(3320)',
        away_team_type: 1,
        is_opponent: '1',
        teamList: '12',
        state_timezone_mapping_id: 1,
        public: 0,
        post_to_website: 0,
        statreport_visibility: 0,
        isLiveBroadcasting: 0,
        balltracking: 0,
        storage_type: 1,
        enc_organization_id: 'enc(200)',
      }),
    );
    expect(texts(r).some(t => t.startsWith('CREATE GAME'))).toBe(false);
    expect(lastAlert()).toEqual(['Game created', 'Final was created.']);
    expect(selected(r, 'GAMES tab')).toBe(true);
    const after = api.to('/api/game/listGamesV2').slice(listCalls);
    expect(after.some(c => c.body.game_type === 1 && c.body.enc_team_id === 'enc(11)')).toBe(true);
  });

  test('the start moves on the venue’s clock; another zone keeps the same moment', async () => {
    const { api, r } = await openForm();
    await type(r, 'Name', 'Timing');
    await press(r, 'Change start');
    await press(r, 'Hour later');
    await press(r, '5 minutes later');
    await press(r, 'DONE');
    expect(texts(r)).toContain('Mon, Nov 9, 2026 · 7:05 AM');
    await press(r, 'Change time zone');
    await press(r, 'Time zone India(IN) - India Standard Time(GMT+05:30)');
    expect(texts(r)).toContain('Mon, Nov 9, 2026 · 6:35 PM');
    await press(r, 'CREATE');
    expect(api.to('/api/game/saveGame')[0].body).toEqual(
      expect.objectContaining({ game_date: NOW + 3900, state_timezone_mapping_id: 71 }),
    );
  });

  test('a SnipBack team opponent; your own team is refused', async () => {
    const { api, r } = await openForm();
    await type(r, 'Name', 'Rivalry');
    await press(r, 'Choose opponent team');
    await type(r, 'Search opponent teams', 'ne');
    await wait(300);
    expect(api.to('/api/filmExchange/destinations').at(-1)!.body).toEqual(
      expect.objectContaining({ q: 'ne', purpose: 'opponent', sport_category_id: 3, exclude_team_ids: '11' }),
    );
    await press(r, 'Opponent Alpha FC · U14');
    expect(texts(r)).toContain('The opponent team cannot be the same as your team.');
    await press(r, 'Opponent AA Q DEV · 001 new');
    await press(r, 'CREATE');
    const body = api.to('/api/game/saveGame')[0].body;
    expect(body).toEqual(expect.objectContaining({ enc_oppo_team_id: 'enc(7107)', away_team_type: 0 }));
    expect(body.is_opponent).toBeUndefined();
  });

  test('a slow answer to an older search never replaces the newer one', async () => {
    const { r } = await openForm();
    // From here, the search for "ab" answers only when released; "abc" answers at once.
    const realFetch = (global as any).fetch;
    let releaseOld: () => void = () => {};
    (global as any).fetch = jest.fn(async (url: string, init: { body?: string }) => {
      const body = init.body ? JSON.parse(init.body) : {};
      if (String(url).includes('/api/filmExchange/destinations') && body.q === 'ab') {
        await new Promise<void>(resolve => {
          releaseOld = resolve;
        });
        return { status: 200, json: async () => ok({ directory: [], results: [{ team_id: 801, label: 'Old Result' }], named: [], page: 1, has_more: false }) };
      }
      if (String(url).includes('/api/filmExchange/destinations') && body.q === 'abc') {
        return { status: 200, json: async () => ok({ directory: [], results: [{ team_id: 802, label: 'New Result' }], named: [], page: 1, has_more: false }) };
      }
      return realFetch(url, init);
    });
    await press(r, 'Choose opponent team');
    await type(r, 'Search opponent teams', 'ab');
    await wait(300);
    await type(r, 'Search opponent teams', 'abc');
    await wait(300);
    expect(byLabel(r, 'Opponent New Result')).toBeDefined();
    await ReactTestRenderer.act(async () => {
      releaseOld();
    });
    await flush();
    expect(byLabel(r, 'Opponent New Result')).toBeDefined();
    expect(byLabel(r, 'Opponent Old Result')).toBeUndefined();
  });

  test('Scout hides the venue and advanced options and is sent as iOS sends it', async () => {
    const { api, r } = await openForm('SCOUT');
    expect(byLabel(r, 'Venue: HOME')).toBeUndefined();
    expect(byLabel(r, 'Advanced features')).toBeUndefined();
    await type(r, 'Name', 'Scouting');
    await press(r, 'CREATE');
    expect(api.to('/api/game/saveGame')[0].body).toEqual(
      expect.objectContaining({ game_type: 2, venue_type: 1, public: 0, post_to_website: 0, statreport_visibility: 1, isLiveBroadcasting: 0, balltracking: 0 }),
    );
  });

  test('a name is needed; a typed "_" is refused', async () => {
    const { api, r } = await openForm();
    await press(r, 'CREATE');
    expect(texts(r)).toContain('Please enter a name.');
    await type(r, 'Name', 'A');
    await type(r, 'Name', 'A_');
    expect(byLabel(r, 'Name').props.value).toBe('A');
    expect(api.writes()).toHaveLength(0);
  });

  test('no answer from the server: no retry, the list is refreshed, and the form says the game may exist', async () => {
    mockApi({ saveFails: 'network' });
    const r = await open(200);
    await press(r, 'Team U14');
    await press(r, 'Add game');
    await wait(300);
    await type(r, 'Name', 'Maybe');
    const api = { calls: ((global as any).fetch as jest.Mock).mock.calls };
    const before = api.calls.filter((c: any[]) => String(c[0]).includes('listGamesV2')).length;
    await press(r, 'CREATE');
    const saves = api.calls.filter((c: any[]) => String(c[0]).includes('saveGame'));
    expect(saves).toHaveLength(1);
    expect(texts(r).some(t => t.includes('may still have been created'))).toBe(true);
    expect(api.calls.filter((c: any[]) => String(c[0]).includes('listGamesV2')).length).toBeGreaterThan(before);
    expect(texts(r)).toContain('CREATE GAME FOR U14'); // still open
  });

  test('a refusal shows the server’s message', async () => {
    mockApi({ saveFails: 'refused' });
    const r = await open(200);
    await press(r, 'Team U14');
    await press(r, 'Add game');
    await wait(300);
    await type(r, 'Name', 'Dup');
    await press(r, 'CREATE');
    expect(texts(r)).toContain('Game name already used');
  });

  test('HOME: no team, opponent or other teams; filed under the home organisation', async () => {
    jest.spyOn(zonedTime, 'deviceZone').mockReturnValue('Asia/Kolkata'); // HOME has no zone of its own
    const api = mockApi();
    const r = await open(100);
    await press(r, 'Add game');
    await wait(300);
    expect(texts(r)).toContain('CREATE GAME');
    expect(byLabel(r, 'Choose opponent team')).toBeUndefined();
    expect(byLabel(r, 'Choose other teams')).toBeUndefined();
    await type(r, 'Name', 'Home practice');
    await press(r, 'CREATE');
    expect(api.to('/api/game/saveGame')[0].body).toEqual(
      expect.objectContaining({ enc_myteam_id: 'enc(0)', enc_organization_id: 'enc(100)', enc_category: 'enc(0)', state_timezone_mapping_id: 71 }),
    );
  });
});
