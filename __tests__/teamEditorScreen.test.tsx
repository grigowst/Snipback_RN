/**
 * Step 8: creating and editing a team from the tablet hub, against a mocked
 * API (which records every write) and a real in-memory Realm.
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

jest.useFakeTimers();

const USER = { id: 1, name: 'Test Coach', email: 'coach@example.com', token: 'abc' };
const ORGS = [
  { id: 100, name: 'Coach Home', user_id: 1, role_id: 3, organization_type: 2 },
  { id: 200, name: 'Alpha FC', user_id: 1, role_id: 1, organization_type: 1, organization_category: 6 },
  { id: 400, name: 'Gamma FC', user_id: 1, role_id: 2, organization_type: 1 },
];
const place = (user_id: number, name: string, role_id: number, jersey_number = 9999) => ({
  user_id,
  name,
  email: `${user_id}@example.com`,
  role_id,
  jersey_number,
});
const TEAMS = () => [
  { id: 11, name: 'U14', organization_id: 200, stat_enable: 1, logo_url: 'https://logo.example/11.png', abbr: 'U14', players_list: [place(1, 'Test Coach', 1), place(21, 'Pat Player', 2, 7), place(22, 'Fran Follower', 5)] },
  { id: 12, name: 'U16 _ Red', organization_id: 200, stat_enable: 0, logo_url: '', abbr: 'U16', players_list: [place(24, 'Gail Guardian', 2)] },
  { id: 13, name: 'Old - Team', organization_id: 200, stat_enable: 1, logo_url: '', abbr: 'OT', players_list: [] },
  { id: 14, name: 'No Defaults', organization_id: 200, stat_enable: 1, logo_url: '', abbr: '', players_list: [] },
  { id: 41, name: 'G1', organization_id: 400, players_list: [] },
];
const PEOPLE = [
  { id: 21, name: 'Pat Player', email: '21@example.com' },
  { id: 22, name: 'Fran Follower', email: '22@example.com' },
  { id: 24, name: 'Gail Guardian', email: 'gail@example.com' },
  { id: 30, name: 'Nia New', email: 'nia@example.com' },
];
const ROLES = [
  { id: 200, user_id: 1, role_id: 1 },
  { id: 200, user_id: 21, role_id: 2 },
  { id: 200, user_id: 22, role_id: 5 },
  { id: 200, user_id: 24, role_id: 1 },
  { id: 200, user_id: 30, role_id: 7 },
];
const CATEGORIES = [
  { id: 3, category_name: 'Basketball' },
  { id: 6, category_name: 'Tennis' },
  { id: 7, category_name: 'Football' },
];
const settingsRow = (team_id: number, venue: number, extra: Record<string, unknown> = {}) => ({
  team_id,
  type: venue,
  game_type: 1,
  category: 7,
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
const idOf = (enc: unknown) => Number(String(enc).replace(/\D/g, ''));

/** The server: reads answer from its state; writes change it. */
function mockApi(options: { roles?: boolean } = {}) {
  const calls: Call[] = [];
  let teams: any[] = TEAMS();
  (global as any).fetch = jest.fn(async (url: string, init: { body?: string }) => {
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    const body = JSON.parse(init.body ?? '{}');
    calls.push({ path, body });
    const reply = (data: unknown, status = 200) => ({ status, json: async () => data });
    switch (path) {
      case '/api/getUsersOrganizationV1':
        return reply(ok({ organizations: ORGS, paging: { next: -1 } }));
      case '/api/team/list/myteamsV3':
        return reply(ok({ team: teams.filter(t => t.organization_id === body.organization_id), paging: { next: -1 } }));
      case '/api/team/list/listTeamByTeamIds':
        return reply(ok({ team: teams }));
      case '/api/getAllUsersV2':
        return reply(ok({ players: PEOPLE, paging: { next: -1 } }));
      case '/api/getUsersAssociateOrganizations':
        return options.roles === false
          ? reply({ status: false, message: 'later' }, 500)
          : reply(ok({ organizations: ROLES, paging: { next: -1 } }));
      case '/api/game/listGamesV2':
        return reply(ok({ games: [], paging: { next: -1 } }));
      case '/api/game/listGameCategories':
        return reply(ok({ categories: CATEGORIES, paging: { next: -1 } }));
      case '/api/team/listDefaultSettings': {
        const id = idOf(body.enc_team_id);
        return id === 14
          ? reply({ status: false, message: 'No settings found' })
          : reply(ok({ default_settings: [settingsRow(id, 1), settingsRow(id, 2, { game_type: 0 })] }));
      }
      case '/api/team/create': {
        const ids = String(body.playersList).split(',').filter(Boolean).map(Number);
        const created = {
          id: 99,
          name: body.name,
          organization_id: 200,
          abbr: body.abbr,
          players_list: ids.map(id => place(id, PEOPLE.find(p => p.id === id)?.name ?? '', 2)),
        };
        teams = [...teams, created];
        return reply(ok({ team: created }));
      }
      case '/api/team/saveDefaultSettings':
        return reply(ok({ default_settings: body.default_settings }));
      case '/api/team/update': {
        const id = idOf(body.enc_id);
        const ids = String(body.playersList).split(',').filter(Boolean).map(Number);
        const roles = String(body.playersRole).split(',').map(Number);
        const jerseys = String(body.playerJerseyNumbers).split(',').map(Number);
        const named = (u: number) => PEOPLE.find(p => p.id === u)?.name ?? (u === 1 ? 'Test Coach' : `User ${u}`);
        teams = teams.map(t =>
          t.id === id
            ? { ...t, name: body.name, abbr: body.abbr, stat_enable: body.stat_enable, players_list: ids.map((u, i) => place(u, named(u), roles[i], jerseys[i])) }
            : t,
        );
        return reply(ok({ team: [teams.find(t => t.id === id)] }));
      }
      default:
        return reply({ status: false, message: 'not mocked' }, 404);
    }
  });
  const reads = [
    '/api/getUserProfile',
    '/api/getUsersOrganizationV1',
    '/api/team/list/myteamsV3',
    '/api/team/list/listTeamByTeamIds',
    '/api/getAllUsersV2',
    '/api/getUsersAssociateOrganizations',
    '/api/game/listGamesV2',
    '/api/game/listGameCategories',
    '/api/team/listDefaultSettings',
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

const texts = (r: Renderer) =>
  r.root.findAll(n => typeof n.props.children === 'string').map(n => n.props.children as string);
const byLabel = (r: Renderer, label: string) =>
  r.root.findAll(
    n => n.props.accessibilityLabel === label && (n.props.onPress || n.props.onChangeText || n.props.onValueChange),
  )[0];
const teamRows = (r: Renderer) =>
  r.root
    .findAll(n => typeof n.props.accessibilityLabel === 'string' && n.props.onPress)
    .map(n => n.props.accessibilityLabel as string)
    .filter(l => l.startsWith('Team ') && !l.startsWith('Team member'))
    .map(l => l.slice('Team '.length));

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
const selected = (r: Renderer, label: string) => byLabel(r, label).props.accessibilityState.selected;

async function openHub(orgId: number): Promise<Renderer> {
  jest.spyOn(device, 'isTablet').mockReturnValue(true);
  (Keychain.getGenericPassword as jest.Mock).mockResolvedValue({
    username: 'session',
    password: JSON.stringify({ token: 'abc', user: USER, selectedOrgId: orgId }),
  });
  let r!: Renderer;
  await ReactTestRenderer.act(async () => {
    r = ReactTestRenderer.create(<App />);
  });
  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(1000);
  });
  await flush();
  await layout(r, 1024);
  await press(r, 'GAMES/TEAMS');
  return r;
}
async function openEditor(r: Renderer, rowName: string) {
  await press(r, `Options for ${rowName}`);
  await press(r, 'Edit Team');
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('creating a team', () => {
  test('starts with the organisation’s sport and iOS’s defaults, with nobody on the team', async () => {
    mockApi();
    const r = await openHub(200);
    await press(r, 'Add team');

    expect(texts(r)).toContain('CREATE NEW TEAM');
    expect(texts(r)).toContain('Tennis'); // organisation 200's sport
    expect(selected(r, 'Game mode: GAME')).toBe(true);
    expect(selected(r, 'Live streaming: DISABLED')).toBe(true);
    expect(texts(r)).toContain('TEAM MEMBERS (0)');
    expect(byLabel(r, 'Stats').props.value).toBe(true);
  });

  test('sends the name, abbreviation, members and both defaults, then selects the new team', async () => {
    const api = mockApi();
    const r = await openHub(200);
    await press(r, 'Add team');
    await type(r, 'Team name', 'U18');
    await type(r, 'Abbreviation', 'u1x');
    await press(r, 'Change sport');
    await press(r, 'Sport: Basketball');
    await press(r, 'Default for: AWAY DEFAULT');
    await press(r, 'Game mode: SCOUT');
    await press(r, 'Organization member Nia New');
    await press(r, 'Organization member Pat Player');
    await press(r, 'ADD →');
    expect(texts(r)).toContain('TEAM MEMBERS (2)');
    await press(r, 'SAVE');

    expect(api.writes().map(c => c.path)).toEqual(['/api/team/create', '/api/team/saveDefaultSettings']);
    const create = api.to('/api/team/create')[0].body;
    expect(create).toEqual(
      expect.objectContaining({
        name: 'U18',
        abbr: 'U1X',
        stat_enable: 1,
        playersList: '30,21',
        playersRole: '7,2', // their organisation roles
        playerJerseyNumbers: '9999,9999',
        enc_created_by: 'enc(1)',
        enc_organization_id: 'enc(200)',
      }),
    );
    expect(create.default_settings.map((s: any) => [s.type, s.category, s.game_type, s.public])).toEqual([
      [1, 3, 1, 1],
      [2, 3, 2, 0], // Scout clears public snipping
    ]);
    expect(api.to('/api/team/saveDefaultSettings')[0].body.enc_team_id).toBe('enc(99)');
    expect(texts(r)).not.toContain('CREATE NEW TEAM');
    expect(byLabel(r, 'Team U18').props.accessibilityState.selected).toBe(true);
    expect(lastAlert()).toEqual(['Team created', 'U18 was created.']);
  });

  test('a typed "_" is refused, and a name with "-" is refused before anything is sent', async () => {
    const api = mockApi();
    const r = await openHub(200);
    await press(r, 'Add team');
    await type(r, 'Team name', 'U18');
    await type(r, 'Team name', 'U18_');
    expect(byLabel(r, 'Team name').props.value).toBe('U18');

    await type(r, 'Team name', 'U18 - Blue');
    expect(texts(r).some(t => t.includes('a name with "-" can\'t be saved'))).toBe(true);
    await press(r, 'SAVE');
    expect(texts(r).some(t => t.includes('"-" becomes "_"'))).toBe(true);
    expect(api.writes()).toHaveLength(0);
  });

  test('people can’t be added until the organisation’s roles have loaded', async () => {
    mockApi({ roles: false });
    const r = await openHub(200);
    await press(r, 'Add team');
    expect(byLabel(r, 'ADD →').props.accessibilityState.disabled).toBe(true);
  });

  test('a player has no + ADD TEAM and no Edit Team', async () => {
    mockApi();
    const r = await openHub(400);
    expect(byLabel(r, 'Add team').props.accessibilityState.disabled).toBe(true);
    await press(r, 'Options for G1');
    expect(byLabel(r, 'Edit Team')).toBeUndefined();
  });
});

describe('editing a team', () => {
  test('opens with the team as the server has it, the raw name included', async () => {
    mockApi();
    const r = await openHub(200);
    expect(teamRows(r)).toContain('U16 Red'); // the rail shows a cleaned-up name
    await openEditor(r, 'U16 Red');

    expect(texts(r)).toContain('EDIT TEAM');
    expect(byLabel(r, 'Team name').props.value).toBe('U16 _ Red');
    expect(byLabel(r, 'Abbreviation').props.value).toBe('U16');
    expect(byLabel(r, 'Stats').props.value).toBe(false);
    expect(texts(r)).toContain('Football'); // the saved sport
    expect(texts(r)).toContain('TEAM MEMBERS (1)');
  });

  test('changing the abbreviation sends the raw name unchanged, and nothing else is written', async () => {
    const api = mockApi();
    const r = await openHub(200);
    await openEditor(r, 'U16 Red');
    await type(r, 'Abbreviation', 'RED');
    await press(r, 'UPDATE');

    expect(api.writes().map(c => c.path)).toEqual(['/api/team/update']);
    expect(api.to('/api/team/update')[0].body).toEqual(
      expect.objectContaining({ name: 'U16 _ Red', abbr: 'RED', stat_enable: 0, playersList: '24', deletedPlayers: '' }),
    );
    expect(texts(r)).not.toContain('EDIT TEAM');
  });

  test('removing and adding members keeps everyone else’s role and jersey', async () => {
    const api = mockApi();
    const r = await openHub(200);
    await openEditor(r, 'U14');
    await press(r, 'Team member Fran Follower');
    await press(r, '← REMOVE');
    await press(r, 'Organization member Gail Guardian');
    await press(r, 'ADD →');
    await press(r, 'UPDATE');

    expect(api.writes().map(c => c.path)).toEqual(['/api/team/update']);
    expect(api.to('/api/team/update')[0].body).toEqual(
      expect.objectContaining({
        name: 'U14',
        playersList: '1,21,24',
        playersRole: '1,2,1',
        playerJerseyNumbers: '9999,7,9999',
        deletedPlayers: '22',
        logo_url: 'https://logo.example/11.png', // kept, not blanked as iOS does
      }),
    );
  });

  test('a team whose name has "-": its defaults can be saved, its other fields can’t', async () => {
    const api = mockApi();
    const r = await openHub(200);
    await openEditor(r, 'Old - Team');
    await press(r, 'Post to website: PRIVATE');
    await press(r, 'UPDATE');
    expect(api.writes().map(c => c.path)).toEqual(['/api/team/saveDefaultSettings']);
    expect(api.to('/api/team/saveDefaultSettings')[0].body.default_settings[0]).toEqual(
      expect.objectContaining({ type: 1, post_to_website: 0, category: 7 }),
    );

    await openEditor(r, 'Old - Team');
    await type(r, 'Abbreviation', 'XY');
    await press(r, 'UPDATE');
    expect(texts(r).some(t => t.includes('has a "-"'))).toBe(true);
    expect(api.writes()).toHaveLength(1); // still only the defaults save
  });

  test('defaults that can’t be read are shown as such and left alone', async () => {
    const api = mockApi();
    const r = await openHub(200);
    await openEditor(r, 'No Defaults');
    expect(texts(r).some(t => t.startsWith('No settings found'))).toBe(true);
    expect(byLabel(r, 'Change sport')).toBeUndefined();
    await type(r, 'Abbreviation', 'ND');
    await press(r, 'UPDATE');
    expect(api.writes().map(c => c.path)).toEqual(['/api/team/update']);
  });

  test('nothing changed: UPDATE just closes', async () => {
    const api = mockApi();
    const r = await openHub(200);
    await openEditor(r, 'U14');
    await press(r, 'UPDATE');
    expect(api.writes()).toHaveLength(0);
    expect(texts(r)).not.toContain('EDIT TEAM');
  });
});
