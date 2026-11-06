/**
 * Step 5: the hub's Members and Followers, the phone USERS and TEAMS tiles,
 * and the users sync, against a mocked API and a real in-memory Realm.
 *
 * @format
 */

import React from 'react';
import { Alert } from 'react-native';
import ReactTestRenderer, { type ReactTestRenderer as Renderer } from 'react-test-renderer';
import * as Keychain from 'react-native-keychain';
import App from '../App';
import { readOrgUsers } from '../src/db/repositories';
import * as device from '../src/utils/device';

jest.useFakeTimers();

const USER = { id: 1, name: 'Test Coach', email: 'coach@example.com', token: 'abc' };
const ORGS = [
  { id: 100, name: 'Coach Home', user_id: 1, role_id: 3, organization_type: 2 },
  { id: 200, name: 'Alpha FC', user_id: 1, role_id: 1, organization_type: 1 },
  { id: 300, name: 'Beta FC', user_id: 1, role_id: 2, organization_type: 1 },
];
const place = (user_id: number, name: string, role_id: number, jersey_number = 9999) => ({
  user_id,
  name,
  email: `${user_id}@example.com`,
  role_id,
  jersey_number,
});
const TEAMS = [
  {
    id: 11,
    name: 'U14',
    organization_id: 200,
    players_list: [
      place(1, 'Test Coach', 1),
      place(21, 'Pat Player', 2, 7),
      place(22, 'Fran Follower', 5),
      place(23, 'Max Manager', 7, 12),
    ],
  },
  {
    id: 12,
    name: 'U16',
    organization_id: 200,
    players_list: [place(22, 'Fran Follower', 7), place(24, 'Gail Guardian', 5)],
  },
];
const PEOPLE = [{ id: 22, name: 'Fran Follower', email: 'fran@example.com', avatar: 'https://img/22.png' }];

type FetchCall = [string, { body: string }];
const ok = (data: unknown) => ({ status: true, message: '', data });

/** fetch() for the screens here; `onUsers` lets a test hold the users answer back. */
function mockApi(onUsers: () => Promise<unknown> | unknown = () => ok({ players: PEOPLE, paging: { next: -1 } })) {
  const fn = jest.fn(async (url: string, init: { body?: string }) => {
    const reply = (body: unknown, status = 200) => ({ status, json: async () => body });
    const body = JSON.parse(init.body ?? '{}');
    if (url.endsWith('/api/getUsersOrganizationV1')) {
      return reply(ok({ organizations: ORGS, paging: { next: -1 } }));
    }
    if (url.endsWith('/api/team/list/myteamsV3')) {
      return reply(ok({ team: body.organization_id === 200 ? TEAMS : [], paging: { next: -1 } }));
    }
    if (url.endsWith('/api/getAllUsersV2')) {
      return reply(await onUsers());
    }
    if (url.endsWith('/api/game/listGamesV2')) {
      return reply(ok({ games: [], paging: { next: -1 } }));
    }
    if (url.endsWith('/api/createWebsiteAccessToken')) {
      return reply(ok({ token: 'one-time-123' }));
    }
    return reply({ status: false, message: 'not mocked' }, 404);
  });
  (global as any).fetch = fn;
  return fn;
}

const callsTo = (fetchMock: jest.Mock, path: string) =>
  (fetchMock.mock.calls as unknown as FetchCall[]).filter(([url]) => url.endsWith(path));

async function flush() {
  for (let i = 0; i < 12; i++) {
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
    });
  }
}

const texts = (r: Renderer) =>
  r.root.findAll(n => typeof n.props.children === 'string').map(n => n.props.children as string);

const pressable = (r: Renderer, label: string) =>
  r.root.findAll(n => n.props.accessibilityLabel === label && n.props.onPress)[0];

async function press(r: Renderer, label: string) {
  await ReactTestRenderer.act(async () => {
    pressable(r, label).props.onPress();
  });
  await flush();
}

async function layout(r: Renderer, width: number) {
  const boxes = r.root.findAll(n => typeof n.props.onLayout === 'function');
  await ReactTestRenderer.act(async () => {
    boxes.forEach(b => b.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width, height: 700 } } }));
  });
}

async function openApp(orgId: number, tablet: boolean): Promise<Renderer> {
  jest.spyOn(device, 'isTablet').mockReturnValue(tablet);
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
  await layout(r, tablet ? 1024 : 390);
  return r;
}

async function openHub(orgId: number): Promise<Renderer> {
  const r = await openApp(orgId, true);
  await press(r, orgId === 100 ? 'GAMES' : 'GAMES/TEAMS');
  return r;
}

const isSelected = (r: Renderer, label: string) =>
  pressable(r, label).props.accessibilityState.selected as boolean;

const cardNames = (r: Renderer) =>
  r.root
    .findAll(n => typeof n.props.accessibilityLabel === 'string' && n.props.onPress)
    .map(n => n.props.accessibilityLabel as string)
    .filter(l => l.startsWith('Member '))
    .map(l => l.slice('Member '.length));

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('tablet hub, coach', () => {
  test('Followers lists the organisation’s followers and managers, then one team’s', async () => {
    mockApi();
    const r = await openHub(200);

    await press(r, 'FOLLOWERS segment');
    await layout(r, 800);
    expect(isSelected(r, 'FOLLOWERS segment')).toBe(true);
    // All Teams: each person once; the coach and the player are not followers.
    expect(cardNames(r)).toEqual(['Fran Follower', 'Gail Guardian', 'Max Manager']);
    expect(texts(r)).toContain('Follower · Manager');

    await press(r, 'Team U14');
    expect(cardNames(r)).toEqual(['Fran Follower', 'Max Manager']);
    expect(texts(r)).toContain('12'); // Max's jersey on U14

    // The users list supplies Fran's photo.
    const photos = r.root.findAll(n => n.props.source?.uri === 'https://img/22.png');
    expect(photos.length).toBeGreaterThan(0);

    await press(r, 'Show Managers');
    expect(cardNames(r)).toEqual(['Max Manager']);
  });

  test('tapping your own card points to your profile; another opens the placeholder', async () => {
    mockApi();
    // Make the coach a follower of U14 too, so their own card shows.
    TEAMS[0].players_list.push(place(1, 'Test Coach', 5));
    try {
      const r = await openHub(200);
      await press(r, 'FOLLOWERS segment');
      await layout(r, 800);

      await press(r, 'Member Test Coach');
      expect(Alert.alert).toHaveBeenCalledWith('Alert', 'Please edit your profile in profile settings');

      await press(r, 'Member Gail Guardian');
      expect(texts(r)).toContain('EDIT MEMBER');
    } finally {
      TEAMS[0].players_list.pop();
    }
  });

  test('Members opens the website roster, signed in, and the hub stays on its tab', async () => {
    const fetchMock = mockApi();
    const r = await openHub(200);

    await press(r, 'MEMBERS segment');

    const tokenCalls = callsTo(fetchMock, '/api/createWebsiteAccessToken');
    expect(tokenCalls).toHaveLength(1);
    const body = JSON.parse(tokenCalls[0][1].body);
    expect(body).toEqual(
      expect.objectContaining({ selected_tab: 'team', redirect_url: 'listUserTeam', user_login: 1 }),
    );
    // Real RSA-2048: one 256-byte block each, base64.
    expect(body.enc_user_id).toHaveLength(344);
    expect(body.enc_orgId).toHaveLength(344);
    expect(body.enc_access_token).toHaveLength(344);

    const web = r.root.findAll(n => n.props.testID === 'webview')[0];
    expect(web.props.source).toEqual({ uri: 'https://snipback.com/authentication/one-time-123' });
    expect(isSelected(r, 'GAMES segment')).toBe(true);
    expect(isSelected(r, 'MEMBERS segment')).toBe(false);
  });
});

describe('tablet hub, not a coach', () => {
  test('a player gets Permission Denied and stays on Games; nothing is requested', async () => {
    const fetchMock = mockApi();
    const r = await openHub(300);

    await press(r, 'FOLLOWERS segment');
    expect(Alert.alert).toHaveBeenLastCalledWith('Permission Denied', expect.any(String));
    expect(isSelected(r, 'GAMES segment')).toBe(true);
    expect(cardNames(r)).toEqual([]);

    await press(r, 'MEMBERS segment');
    expect(Alert.alert).toHaveBeenCalledTimes(2);
    expect(callsTo(fetchMock, '/api/createWebsiteAccessToken')).toHaveLength(0);
  });

  test('HOME gets the iOS Home Organization alert', async () => {
    mockApi();
    const r = await openHub(100);

    await press(r, 'MEMBERS segment');
    expect(Alert.alert).toHaveBeenCalledWith(
      'Not Available in Home Organization',
      expect.stringContaining('sales@snipback.com'),
    );
    expect(isSelected(r, 'GAMES segment')).toBe(true);
  });
});

describe('phone USERS and TEAMS tiles', () => {
  test.each([
    ['USERS', 'user'],
    ['TEAMS', 'team'],
  ])('%s opens the website’s %s pages, signed in', async (tile, tab) => {
    const fetchMock = mockApi();
    const r = await openApp(200, false);

    await press(r, tile);

    const tokenCalls = callsTo(fetchMock, '/api/createWebsiteAccessToken');
    expect(tokenCalls).toHaveLength(1);
    expect(JSON.parse(tokenCalls[0][1].body).selected_tab).toBe(tab);
    expect(r.root.findAll(n => n.props.testID === 'webview')[0].props.source.uri).toBe(
      'https://snipback.com/authentication/one-time-123',
    );
  });
});

describe('the users sync', () => {
  test('opening an organisation caches its users list', async () => {
    const fetchMock = mockApi();
    await openApp(200, false);

    const calls = callsTo(fetchMock, '/api/getAllUsersV2');
    expect(JSON.parse(calls[0][1].body)).toEqual(
      expect.objectContaining({ organization_id: 200, count: 400, page: 1, timestamp: 0 }),
    );
    expect(readOrgUsers(200).map(p => p.name)).toEqual(['Fran Follower']);
  });

  test('a users sync that finishes after logout writes nothing', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    mockApi(async () => {
      await gate;
      return ok({ players: PEOPLE, paging: { next: -1 } });
    });
    const r = await openApp(200, false);

    await press(r, 'SETTINGS');
    const logOut = r.root.findAll(
      n => n.props.onPress && n.findAll(c => c.props.children === 'LOG OUT').length > 0,
    )[0];
    await ReactTestRenderer.act(async () => {
      logOut.props.onPress();
    });
    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
    await ReactTestRenderer.act(async () => {
      buttons.find((b: { text: string }) => b.text === 'Log Out').onPress();
    });
    await flush();

    release();
    await flush();

    expect(readOrgUsers(200)).toEqual([]);
    expect(texts(r)).toContain('SIGN IN');
  });
});
