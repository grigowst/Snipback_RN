/**
 * Step 7: the hub's team list on a tablet: the My Team / Opponent team
 * toggle, search, favourites, archived teams and the "…" menus, against a
 * mocked API (which records every write) and a real in-memory Realm.
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

jest.useFakeTimers();

const USER = { id: 1, name: 'Test Coach', email: 'coach@example.com', token: 'abc' };
const ORGS = [
  { id: 100, name: 'Coach Home', user_id: 1, role_id: 3, organization_type: 2 },
  { id: 200, name: 'Alpha FC', user_id: 1, role_id: 1, organization_type: 1 }, // coach
  { id: 300, name: 'Beta FC', user_id: 1, role_id: 4, organization_type: 1 }, // admin
  { id: 400, name: 'Gamma FC', user_id: 1, role_id: 2, organization_type: 1 }, // player
];
const links = (id: number) => ({
  sharecode_short_url: `https://join.example/p${id}`,
  short_url_coach: `https://join.example/c${id}`,
  short_url_follower: '',
});
/** Each organisation's teams: U14, U16 (starred) and an archived one; ids 11-13 in Alpha FC, 31-33 in Beta FC… */
const TEAMS = (orgId: number) => {
  const base = { 200: 10, 300: 30, 400: 40 }[orgId] ?? 90;
  return [
    { id: base + 1, name: 'U14', organization_id: orgId, unique_number: `U${base + 1}`, is_favourite: 0, ...links(base + 1), players_list: [] },
    { id: base + 2, name: 'U16', organization_id: orgId, unique_number: `U${base + 2}`, is_favourite: 1, ...links(base + 2), players_list: [] },
    { id: base + 3, name: 'Old', organization_id: orgId, unique_number: `U${base + 3}`, is_archive: 1, players_list: [] },
  ];
};
const OPPONENTS = [
  { id: 5, name: 'Rivals', organization_id: 200, is_deleted: 0 },
  { id: 6, name: 'Neighbours', organization_id: 200, is_deleted: 0 },
  { id: 7, name: 'Gone', organization_id: 200, is_deleted: 1 },
];

type Call = { path: string; body: any };
const ok = (data: unknown) => ({ status: true, message: '', data });

/** The server: answers reads from its own state; writes change that state. */
function mockApi() {
  const calls: Call[] = [];
  const teams: Record<number, any[]> = { 200: TEAMS(200), 300: TEAMS(300), 400: TEAMS(400) };
  let opponents = [...OPPONENTS];
  const orgOfTeam = (id: number) => Number(Object.keys(teams).find(o => teams[Number(o)].some(t => t.id === id)));
  (global as any).fetch = jest.fn(async (url: string, init: { body?: string }) => {
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    const body = JSON.parse(init.body ?? '{}');
    calls.push({ path, body });
    const reply = (data: unknown, status = 200) => ({ status, json: async () => data });
    switch (path) {
      case '/api/getUsersOrganizationV1':
        return reply(ok({ organizations: ORGS, paging: { next: -1 } }));
      case '/api/team/list/myteamsV3':
        return reply(ok({ team: teams[body.organization_id] ?? [], paging: { next: -1 } }));
      case '/api/getAllUsersV2':
        return reply(ok({ players: [], paging: { next: -1 } }));
      case '/api/getUsersAssociateOrganizations':
        return reply(ok({ organizations: [], paging: { next: -1 } }));
      case '/api/team/list/listMyOpponentTeam':
        return reply(ok({ team: opponents.filter(o => o.organization_id === body.organization_id), paging: { next: -1 } }));
      case '/api/game/listGamesV2': {
        const games =
          body.team_type === 2 && body.enc_team_id === 'enc(5)' && body.game_type === 1
            ? [{ id: 501, name: 'Final vs Rivals', game_date: 1_700_000_000 }]
            : body.team_type === 1 && body.enc_team_id === 'enc(11)' && body.game_type === 1
              ? [{ id: 111, name: 'U14 league game', game_date: 1_700_000_000 }]
              : [];
        return reply(ok({ games, paging: { next: -1 } }));
      }
      case '/api/team/addingOpponentTeams': {
        const id = body.opponentteamId ?? 8;
        opponents = [...opponents.filter(o => o.id !== id), { id, name: body.team_name, organization_id: body.organization_id, is_deleted: 0 }];
        return reply(ok({ opponentTeams: opponents.find(o => o.id === id) }));
      }
      case '/api/team/duplicateTeam': {
        const sourceId = Number(String(body.enc_team_id).replace(/\D/g, ''));
        const org = orgOfTeam(sourceId);
        const copy = { ...teams[org].find(t => t.id === sourceId), id: 99, name: body.name, unique_number: 'U99', is_favourite: 0 };
        teams[org] = [...teams[org], copy];
        return reply(ok({ team: copy }));
      }
      case '/api/team/setTeamFavourite':
      case '/api/team/unSetTeamFavourite': {
        const star = path.endsWith('/setTeamFavourite');
        teams[body.organization_id] = teams[body.organization_id].map(t => ({
          ...t,
          is_favourite: t.id === body.team_id ? (star ? 1 : 0) : star ? 0 : t.is_favourite,
        }));
        return reply(ok({}));
      }
      case '/api/team/delete': {
        const id = Number(String(body.enc_id).replace(/\D/g, ''));
        const org = orgOfTeam(id);
        teams[org] = teams[org].filter(t => t.id !== id);
        return reply(ok({}));
      }
      case '/api/createWebsiteAccessToken':
        return reply(ok({ token: 'one-time' }));
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
    '/api/team/list/listMyOpponentTeam',
    '/api/createWebsiteAccessToken',
  ];
  return {
    calls,
    writes: () => calls.filter(c => !reads.includes(c.path)),
    to: (path: string) => calls.filter(c => c.path === path),
  };
}

async function flush() {
  for (let i = 0; i < 14; i++) {
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
    });
  }
}

const texts = (r: Renderer) =>
  r.root.findAll(n => typeof n.props.children === 'string').map(n => n.props.children as string);
const byLabel = (r: Renderer, label: string) =>
  r.root.findAll(n => n.props.accessibilityLabel === label && (n.props.onPress || n.props.onChangeText))[0];
const labels = (r: Renderer, prefix: string) =>
  r.root
    .findAll(n => typeof n.props.accessibilityLabel === 'string' && n.props.onPress)
    .map(n => n.props.accessibilityLabel as string)
    .filter(l => l.startsWith(prefix));
/** The rail's rows, in order. */
const teamRows = (r: Renderer) => labels(r, 'Team ').map(l => l.slice('Team '.length));
const opponentRowNames = (r: Renderer) => labels(r, 'Opponent team ').map(l => l.slice('Opponent team '.length));
/** The favourite stars on screen (native views only). */
const stars = (node: Renderer['root']) =>
  node.findAll(n => typeof n.type === 'string' && n.props.accessibilityLabel === 'Favourite');
const gameRequests = (api: ReturnType<typeof mockApi>) => api.to('/api/game/listGamesV2').map(c => c.body);

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
/** Presses a button inside the last Alert.alert call. */
async function answerAlert(text: string) {
  const calls = (Alert.alert as jest.Mock).mock.calls;
  const buttons = calls[calls.length - 1][2] as { text: string; onPress?: () => void }[];
  await ReactTestRenderer.act(async () => {
    buttons.find(b => b.text === text)!.onPress!();
  });
  await flush();
}
const lastAlert = () => {
  const calls = (Alert.alert as jest.Mock).mock.calls;
  return calls[calls.length - 1];
};

/** Opens the tablet hub in an organisation. */
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
  await press(r, orgId === 100 ? 'GAMES' : 'GAMES/TEAMS');
  return r;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('My Team', () => {
  test('lists the teams with the favourite starred, a search box and the archived count', async () => {
    mockApi();
    const r = await openHub(200);

    expect(teamRows(r)).toEqual(['Org - All Teams', 'U14', 'U16']); // "Old" is archived
    expect(stars(r.root)).toHaveLength(1);
    expect(texts(r)).toContain('Archived (1)');
    await press(r, 'Archived teams');
    expect(lastAlert()[1]).toBe('Visit website to manage this.');

    await type(r, 'Search teams', 'u14');
    expect(teamRows(r)).toEqual(['Org - All Teams', 'U14']);
  });

  test('HOME has no toggle, search or archive link', async () => {
    mockApi();
    const r = await openHub(100);
    expect(texts(r)).toContain('MY TEAM');
    expect(byLabel(r, 'Opponent team')).toBeUndefined();
    expect(byLabel(r, 'Search teams')).toBeUndefined();
    expect(byLabel(r, 'Archived teams')).toBeUndefined();
  });
});

describe('Opponent team', () => {
  test('lists the organisation’s opponents (fetched when opened), and an opponent filters the games', async () => {
    const api = mockApi();
    const r = await openHub(200);
    expect(api.to('/api/team/list/listMyOpponentTeam')).toHaveLength(0); // not until the toggle opens

    await press(r, 'Opponent team');
    expect(api.to('/api/team/list/listMyOpponentTeam')[0].body).toEqual({
      page: 1,
      count: 400,
      organization_id: 200,
      user_id: 1,
      timestamp: 0,
    });
    expect(opponentRowNames(r)).toEqual(['Org - All Teams', 'Neighbours', 'Rivals']); // deleted one hidden
    // "Org - All Teams" of the opponents: team type 2, id 0.
    expect(gameRequests(api).at(-1)).toEqual(expect.objectContaining({ team_type: 2, enc_team_id: 'enc(0)' }));

    await press(r, 'Opponent team Rivals');
    expect(gameRequests(api).at(-1)).toEqual(expect.objectContaining({ team_type: 2, enc_team_id: 'enc(5)' }));
    expect(texts(r)).toContain('Final vs Rivals');

    // Back on My Team, the games are the team's again.
    await press(r, 'My Team');
    await press(r, 'Team U14');
    expect(gameRequests(api).at(-1)).toEqual(expect.objectContaining({ team_type: 1, enc_team_id: 'enc(11)' }));
    expect(texts(r)).toContain('U14 league game');
    expect(texts(r)).not.toContain('Final vs Rivals');
  });

  test('adding an opponent: SAVE waits for a name, then the new opponent is listed and picked', async () => {
    const api = mockApi();
    const r = await openHub(200);
    await press(r, 'Opponent team');
    await press(r, 'Add opponent team');

    expect(texts(r)).toContain('ADD OPPONENT TEAM');
    expect(byLabel(r, 'SAVE').props.accessibilityState.disabled).toBe(true);
    await type(r, 'Opponent team name', ' Visitors ');
    await press(r, 'SAVE');

    expect(api.writes().map(c => [c.path, c.body])).toEqual([
      ['/api/team/addingOpponentTeams', { user_id: 1, organization_id: 200, team_name: 'Visitors' }],
    ]);
    expect(texts(r)).not.toContain('ADD OPPONENT TEAM');
    expect(opponentRowNames(r)).toContain('Visitors');
    expect(byLabel(r, 'Opponent team Visitors').props.accessibilityState.selected).toBe(true);
  });

  test('renaming an opponent from its "…" button', async () => {
    const api = mockApi();
    const r = await openHub(200);
    await press(r, 'Opponent team');
    expect(byLabel(r, 'Options for Org - All Teams')).toBeUndefined();
    await press(r, 'Options for Rivals');

    expect(texts(r)).toContain('EDIT OPPONENT TEAM');
    expect(byLabel(r, 'Opponent team name').props.value).toBe('Rivals');
    await type(r, 'Opponent team name', 'Old Rivals');
    await press(r, 'SAVE');

    expect(api.writes()[0].body).toEqual({ user_id: 1, organization_id: 200, team_name: 'Old Rivals', opponentteamId: 5 });
    expect(opponentRowNames(r)).toEqual(['Org - All Teams', 'Neighbours', 'Old Rivals']);
  });

  test('a player can’t add or rename opponents', async () => {
    mockApi();
    const r = await openHub(400);
    await press(r, 'Opponent team');
    expect(byLabel(r, 'Add opponent team').props.accessibilityState.disabled).toBe(true);
    expect(byLabel(r, 'Options for Rivals')).toBeUndefined();
  });
});

describe('a team’s "…" menu', () => {
  test('a coach gets the team options but not Delete', async () => {
    mockApi();
    const r = await openHub(200);
    expect(byLabel(r, 'Options for Org - All Teams')).toBeUndefined();
    await press(r, 'Options for U14');
    for (const option of ['Team Invite Links', 'Team Webpage', 'Duplicate Team', 'Set as Favourite']) {
      expect(byLabel(r, option)).toBeDefined();
    }
    expect(byLabel(r, 'Delete Team')).toBeUndefined();
  });

  test('a player can only star the team', async () => {
    mockApi();
    const r = await openHub(400);
    await press(r, 'Options for U16');
    expect(byLabel(r, 'Unfavourite')).toBeDefined();
    expect(byLabel(r, 'Team Invite Links')).toBeUndefined();
    expect(byLabel(r, 'Duplicate Team')).toBeUndefined();
  });

  test('starring asks first, then moves the star', async () => {
    const api = mockApi();
    const r = await openHub(200);
    await press(r, 'Options for U14');
    await press(r, 'Set as Favourite');
    expect(lastAlert()[0]).toBe('Set U14 as Favourite?');
    expect(api.writes()).toHaveLength(0);
    await answerAlert('Set');

    expect(api.writes().map(c => [c.path, c.body])).toEqual([
      ['/api/team/setTeamFavourite', { team_id: 11, organization_id: 200 }],
    ]);
    expect(stars(r.root)).toHaveLength(1);
    // The star sits in U14's row now.
    expect(stars(byLabel(r, 'Team U14'))).toHaveLength(1);
  });

  test('duplicate: the name starts as the team’s, an existing name is refused, the copy is picked', async () => {
    const api = mockApi();
    const r = await openHub(200);
    await press(r, 'Options for U14');
    await press(r, 'Duplicate Team');

    expect(byLabel(r, 'New team name').props.value).toBe('U14');
    await press(r, 'DUPLICATE');
    expect(texts(r)).toContain('Team name already exists.');
    expect(api.writes()).toHaveLength(0);

    await type(r, 'New team name', 'U14 Blue');
    await press(r, 'DUPLICATE');
    expect(api.writes().map(c => [c.path, c.body])).toEqual([
      ['/api/team/duplicateTeam', { enc_team_id: 'enc(11)', name: 'U14 Blue' }],
    ]);
    expect(teamRows(r)).toEqual(['Org - All Teams', 'U14', 'U14 Blue', 'U16']);
    expect(byLabel(r, 'Team U14 Blue').props.accessibilityState.selected).toBe(true);
    expect(lastAlert()).toEqual(['Team created', 'U14 Blue was created.']);
  });

  test('an admin can delete a team after confirming; the selection falls back to All Teams', async () => {
    const api = mockApi();
    const r = await openHub(300);
    await press(r, 'Team U14');
    await press(r, 'Options for U14');
    await press(r, 'Delete Team');
    expect(lastAlert()[0]).toBe('Are you sure to delete U14?');
    expect(api.writes()).toHaveLength(0);
    await answerAlert('Delete');

    expect(api.writes().map(c => [c.path, c.body])).toEqual([['/api/team/delete', { enc_id: 'enc(31)' }]]);
    expect(teamRows(r)).toEqual(['Org - All Teams', 'U16']);
    expect(byLabel(r, 'Team Org - All Teams').props.accessibilityState.selected).toBe(true);
    expect(lastAlert()).toEqual(['Deleted', 'U14 was deleted.']);
  });

  test('invite links: each role shares its own link; a missing one says so', async () => {
    mockApi();
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction', activityType: undefined });
    const r = await openHub(200);
    await press(r, 'Options for U14');
    await press(r, 'Team Invite Links');
    expect(texts(r)).toContain('Invite user as');

    await press(r, 'COACH');
    expect(share).toHaveBeenLastCalledWith({ url: 'https://join.example/c11' }); // Jest runs as iOS
    await press(r, 'PLAYER');
    expect(share).toHaveBeenLastCalledWith({ url: 'https://join.example/p11' });
    await press(r, 'FOLLOWER');
    expect(share).toHaveBeenCalledTimes(2);
    expect(lastAlert()).toEqual(['Alert', 'No share url for this team as follower']);
  });

  test('Team Webpage opens the team’s page on the website, signed in', async () => {
    const api = mockApi();
    const r = await openHub(200);
    await press(r, 'Options for U16');
    await press(r, 'Team Webpage');

    expect(api.to('/api/createWebsiteAccessToken')[0].body).toEqual(
      expect.objectContaining({ redirect_url: 'team/U12', selected_tab: 'team' }),
    );
    const web = r.root.findAll(n => n.props.testID === 'webview')[0];
    expect(web.props.source).toEqual({ uri: 'https://snipback.com/authentication/one-time' });
  });
});
