/**
 * Sign-in, restore, organisation choice and logout, with the network and
 * Keychain mocked.
 *
 * @format
 */

import React from 'react';
import { Alert } from 'react-native';
import ReactTestRenderer, { type ReactTestRenderer as Renderer } from 'react-test-renderer';
import * as Keychain from 'react-native-keychain';
import App from '../App';
import { mapOrganization } from '../src/api/organizations';
import { readOrganizations, replaceOrganizations } from '../src/db/repositories';

jest.useFakeTimers();

const USER = { id: 1, name: 'Test Coach', email: 'coach@example.com', token: 'abc' };

const ORGS = [
  { id: 100, name: 'Coach Home', user_id: 1, role_id: 3, organization_type: 2 },
  { id: 200, name: 'Alpha FC', user_id: 1, role_id: 1, organization_type: 1, organization_is_default: 1 },
  { id: 300, name: 'Beta FC', user_id: 1, role_id: 2, organization_type: 1 },
];

type FetchCall = [string, { method: string; headers: Record<string, string>; body?: string }];
type Route = { status: number; body: unknown } | 'offline';

/** fetch() that answers by URL ending; anything else is a 404. */
function mockApi(routes: Record<string, Route>) {
  const fetchMock = jest.fn((url: string) => {
    const match = Object.keys(routes).find(path => url.endsWith(path));
    const route = match ? routes[match] : { status: 404, body: { status: false, message: 'not mocked' } };
    if (route === 'offline') {
      return Promise.reject(new TypeError('Network request failed'));
    }
    return Promise.resolve({ status: route.status, json: () => Promise.resolve(route.body) });
  });
  (global as any).fetch = fetchMock;
  return fetchMock;
}

const ok = (data?: unknown): Route => ({ status: 200, body: { status: true, message: '', data } });
const orgsRoute = (orgs = ORGS) => ok({ organizations: orgs, paging: { next: -1 } });

const callsTo = (fetchMock: jest.Mock, path: string) =>
  (fetchMock.mock.calls as unknown as FetchCall[]).filter(([url]) => url.endsWith(path));

/** Lets pending promises (fetch, Keychain) settle inside act(). */
async function flush() {
  for (let i = 0; i < 10; i++) {
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
    });
  }
}

async function renderApp(): Promise<Renderer> {
  let renderer!: Renderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  // Past the one-second splash.
  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(1000);
  });
  await flush();
  return renderer;
}

const texts = (r: Renderer) =>
  r.root
    .findAll(node => typeof node.props.children === 'string')
    .map(node => node.props.children as string);

/** The tile grid measures itself before drawing; give it a phone-sized box. */
async function layoutTiles(r: Renderer) {
  const boxes = r.root.findAll(node => typeof node.props.onLayout === 'function');
  await ReactTestRenderer.act(async () => {
    boxes.forEach(box =>
      box.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 700 } } }),
    );
  });
}

const pressable = (r: Renderer, label: string) =>
  r.root.findAll(node => node.props.accessibilityLabel === label && node.props.onPress)[0];

async function signIn(r: Renderer, email: string, password: string) {
  const input = (placeholder: string) =>
    r.root.findAll(node => node.props.placeholder === placeholder && node.props.onChangeText)[0];
  await ReactTestRenderer.act(async () => {
    input('Email Address').props.onChangeText(email);
    input('Password').props.onChangeText(password);
  });
  const button = r.root.findAll(node => node.props.accessibilityState && node.props.onPress)[0];
  await ReactTestRenderer.act(async () => {
    button.props.onPress();
  });
  await flush();
}

function savedSession(extra: Record<string, unknown> = {}) {
  (Keychain.getGenericPassword as jest.Mock).mockResolvedValue({
    username: 'session',
    password: JSON.stringify({ token: 'abc', user: USER, ...extra }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  (Keychain.getGenericPassword as jest.Mock).mockResolvedValue(false);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

test('login posts an encrypted password with the iOS headers and saves the session', async () => {
  const fetchMock = mockApi({ '/api/loginV2': ok({ user: USER }), '/api/getUsersOrganizationV1': orgsRoute() });
  const r = await renderApp();

  await signIn(r, ' coach@example.com ', 'secret');

  const logins = callsTo(fetchMock, '/api/loginV2');
  expect(logins).toHaveLength(1);
  const [url, init] = logins[0];
  expect(url).toMatch(/^https:\/\/.+\/api\/loginV2$/);
  expect(init.method).toBe('POST');

  const body = JSON.parse(init.body!);
  expect(body.email).toBe('coach@example.com');
  expect(body.enc_password).toHaveLength(344);
  expect(body.password).toBeUndefined();
  expect(body).toHaveProperty('deviceID');
  expect(body).toHaveProperty('timeZone');

  expect(init.headers).toEqual(
    expect.objectContaining({
      'Content-Type': 'application/json',
      device_id: expect.any(String),
      deviceInfo: expect.stringMatching(/\|15\.4\.7\|851\|22$/), // Jest runs as iOS
      Timezone: expect.any(String),
    }),
  );
  expect(init.headers.Authorization).toBeUndefined();

  expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
    'session',
    JSON.stringify({ token: 'abc', user: USER }),
    expect.anything(),
  );
});

test('after sign-in the dashboard loads organisations and picks the default one', async () => {
  const fetchMock = mockApi({ '/api/loginV2': ok({ user: USER }), '/api/getUsersOrganizationV1': orgsRoute() });
  const r = await renderApp();
  // The default-org choice is read back from the Keychain before it is saved.
  (Keychain.getGenericPassword as jest.Mock).mockResolvedValue({
    username: 'session',
    password: JSON.stringify({ token: 'abc', user: USER }),
  });

  await signIn(r, 'coach@example.com', 'secret');

  const orgCalls = callsTo(fetchMock, '/api/getUsersOrganizationV1');
  expect(orgCalls).toHaveLength(1);
  const orgBody = JSON.parse(orgCalls[0][1].body!);
  expect(orgBody).toEqual(
    expect.objectContaining({ count: 400, page: 1, timestamp: 0, enc_user_id: expect.any(String) }),
  );
  expect(orgBody.enc_user_id).toHaveLength(344);
  expect(orgCalls[0][1].headers.Authorization).toBe('Bearer abc');

  // "Alpha FC" is flagged as the default organisation.
  expect(texts(r)).toContain('Alpha FC');
  expect(texts(r)).toContain(' | Test Coach');
  const saved = (Keychain.setGenericPassword as jest.Mock).mock.calls.map(c => JSON.parse(c[1]));
  expect(saved[saved.length - 1].selectedOrgId).toBe(200);
});

test('a rejected login shows the server message and stays on the login screen', async () => {
  mockApi({ '/api/loginV2': { status: 200, body: { status: false, message: 'Invalid credentials' } } });
  const r = await renderApp();

  await signIn(r, 'coach@example.com', 'wrong');

  expect(Alert.alert).toHaveBeenCalledWith('Error', 'Invalid credentials');
  expect(Keychain.setGenericPassword).not.toHaveBeenCalled();
  expect(texts(r)).toContain('SIGN IN');
});

test('a saved session reopens on the saved organisation', async () => {
  mockApi({ '/api/getUsersOrganizationV1': orgsRoute() });
  savedSession({ selectedOrgId: 300 });
  const r = await renderApp();

  expect(texts(r)).toContain('Beta FC');
  expect(texts(r)).not.toContain('Alpha FC');
});

test('a saved organisation the user has left falls back to HOME', async () => {
  mockApi({ '/api/getUsersOrganizationV1': orgsRoute() });
  savedSession({ selectedOrgId: 999 });
  const r = await renderApp();

  expect(texts(r)).toContain('HOME');
});

test('organisations that fail to load show a retry bar', async () => {
  mockApi({ '/api/getUsersOrganizationV1': { status: 500, body: { status: false, message: 'Server error' } } });
  savedSession();
  const r = await renderApp();

  expect(texts(r)).toContain('Server error');
  expect(texts(r)).toContain('RETRY');
});

test('Settings → Log Out clears the session and returns to the login screen', async () => {
  mockApi({ '/api/getUsersOrganizationV1': orgsRoute() });
  savedSession();
  const r = await renderApp();
  await layoutTiles(r);

  await ReactTestRenderer.act(async () => {
    pressable(r, 'SETTINGS').props.onPress();
  });
  await flush();
  const logOut = r.root.findAll(
    node => node.props.onPress && node.findAll(n => n.props.children === 'LOG OUT').length > 0,
  )[0];
  await ReactTestRenderer.act(async () => {
    logOut.props.onPress();
  });
  const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
  await ReactTestRenderer.act(async () => {
    buttons.find((b: { text: string }) => b.text === 'Log Out').onPress();
  });
  await flush();

  expect(Keychain.resetGenericPassword).toHaveBeenCalled();
  expect(texts(r)).toContain('SIGN IN');
});

test('a 401 from any request signs the user out', async () => {
  mockApi({ '/api/getUsersOrganizationV1': orgsRoute() });
  savedSession();
  const r = await renderApp();

  const fetchMock = mockApi({ '/api/anything': { status: 401, body: { status: false, message: 'Unauthorized' } } });
  const { apiRequest } = require('../src/api/client');
  await ReactTestRenderer.act(async () => {
    await expect(apiRequest('/api/anything')).rejects.toThrow('Unauthorized');
  });
  await flush();

  expect(callsTo(fetchMock, '/api/anything')[0][1].headers.Authorization).toBe('Bearer abc');
  expect(Keychain.resetGenericPassword).toHaveBeenCalled();
  expect(texts(r)).toContain('SIGN IN');
});

test('the organisation picker lists the tree and switching saves the choice', async () => {
  mockApi({ '/api/getUsersOrganizationV1': orgsRoute() });
  savedSession({ selectedOrgId: 200 });
  const r = await renderApp();
  expect(texts(r)).toContain('Alpha FC');

  await ReactTestRenderer.act(async () => {
    pressable(r, 'Change organization').props.onPress();
  });
  const shown = texts(r);
  for (const name of ['+ Add New Organisation', 'HOME', 'Alpha FC', 'Beta FC']) {
    expect(shown).toContain(name);
  }

  const betaRow = r.root.findAll(
    node =>
      node.props.onPress &&
      node.props.accessibilityState &&
      node.findAll(n => n.props.children === 'Beta FC').length > 0,
  )[0];
  await ReactTestRenderer.act(async () => {
    betaRow.props.onPress();
  });
  await flush();

  expect(texts(r)).toContain('Beta FC');
  const saved = (Keychain.setGenericPassword as jest.Mock).mock.calls.map(c => JSON.parse(c[1]));
  expect(saved[saved.length - 1].selectedOrgId).toBe(300);
});

test('"+ Add New Organisation" explains how to set one up instead of selecting', async () => {
  mockApi({ '/api/getUsersOrganizationV1': orgsRoute() });
  savedSession({ selectedOrgId: 200 });
  const r = await renderApp();

  await ReactTestRenderer.act(async () => {
    pressable(r, 'Change organization').props.onPress();
  });
  const addRow = r.root.findAll(
    node =>
      node.props.onPress &&
      node.props.accessibilityState &&
      node.findAll(n => n.props.children === '+ Add New Organisation').length > 0,
  )[0];
  await ReactTestRenderer.act(async () => {
    addRow.props.onPress();
  });

  expect(Alert.alert).toHaveBeenCalledWith('', expect.stringContaining('info@snipback.com'));
  expect(Keychain.setGenericPassword).not.toHaveBeenCalled();
});


// ---- Step 3: the local store -------------------------------------------

const TEAMS_PATH = '/api/team/list/myteamsV3';
const cacheOrgs = (orgs = ORGS) => replaceOrganizations(1, orgs.map(mapOrganization));
const teamsRoute = (teams: Record<string, unknown>[]) => ok({ team: teams, paging: { next: -1 } });

test('offline: the dashboard opens from the cache and shows the error bar', async () => {
  cacheOrgs();
  mockApi({ '/api/getUsersOrganizationV1': 'offline' });
  savedSession({ selectedOrgId: 200 });
  const r = await renderApp();

  expect(texts(r)).toContain('Alpha FC');
  expect(texts(r)).toContain('Unable to reach Snipback. Check your internet connection.');
  expect(texts(r)).toContain('RETRY');
});

test('a failed later page leaves the cached organisations untouched', async () => {
  cacheOrgs();
  mockApi({});
  // Page 1 answers and points to page 2; page 2 fails.
  (global as any).fetch = jest.fn((url: string, init: { body: string }) => {
    const page = JSON.parse(init.body).page;
    if (url.endsWith('/api/getUsersOrganizationV1') && page === 1) {
      return Promise.resolve({
        status: 200,
        json: () => Promise.resolve({ status: true, message: '', data: { organizations: [ORGS[0]], paging: { next: 2 } } }),
      });
    }
    return Promise.resolve({ status: 500, json: () => Promise.resolve({ status: false, message: 'Server error' }) });
  });
  savedSession({ selectedOrgId: 300 });
  const r = await renderApp();

  expect(readOrganizations(1).map(o => o.orgId).sort()).toEqual([100, 200, 300]);
  expect(texts(r)).toContain('Beta FC');
});

test('an organisation the server no longer returns is removed, and the dashboard falls back to HOME', async () => {
  cacheOrgs();
  mockApi({ '/api/getUsersOrganizationV1': orgsRoute(ORGS.slice(0, 2)) });
  savedSession({ selectedOrgId: 300 });
  const r = await renderApp();

  expect(readOrganizations(1).map(o => o.orgId).sort()).toEqual([100, 200]);
  expect(texts(r)).toContain('HOME');
  expect(texts(r)).not.toContain('Beta FC');
});

test('logging out empties the local store', async () => {
  mockApi({ '/api/getUsersOrganizationV1': orgsRoute() });
  savedSession();
  const r = await renderApp();
  expect(readOrganizations(1)).toHaveLength(3);
  await layoutTiles(r);

  await ReactTestRenderer.act(async () => {
    pressable(r, 'SETTINGS').props.onPress();
  });
  await flush();
  const logOut = r.root.findAll(
    node => node.props.onPress && node.findAll(n => n.props.children === 'LOG OUT').length > 0,
  )[0];
  await ReactTestRenderer.act(async () => {
    logOut.props.onPress();
  });
  const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
  await ReactTestRenderer.act(async () => {
    buttons.find((b: { text: string }) => b.text === 'Log Out').onPress();
  });
  await flush();

  expect(readOrganizations(1)).toEqual([]);
});

test("signing in clears another account's cached data", async () => {
  replaceOrganizations(99, [mapOrganization({ id: 1, name: 'Other', user_id: 99, role_id: 1 })]);
  mockApi({ '/api/loginV2': ok({ user: USER }), '/api/getUsersOrganizationV1': orgsRoute() });
  const r = await renderApp();

  await signIn(r, 'coach@example.com', 'secret');

  expect(readOrganizations(99)).toEqual([]);
});

test('phones outside HOME get the team picker; a single team adds TEAM WEBPAGE', async () => {
  const fetchMock = mockApi({
    '/api/getUsersOrganizationV1': orgsRoute(),
    [TEAMS_PATH]: teamsRoute([
      { id: 11, name: 'U12', organization_id: 200, team_type: 0, is_archive: 0, is_deleted: 0 },
      { id: 12, name: 'U14', organization_id: 200, team_type: 0, is_archive: 0, is_deleted: 0, is_favourite: 1 },
    ]),
  });
  savedSession({ selectedOrgId: 200 });
  const r = await renderApp();
  await layoutTiles(r);

  const teamCalls = callsTo(fetchMock, TEAMS_PATH);
  expect(JSON.parse(teamCalls[0][1].body!)).toEqual(
    expect.objectContaining({ organization_id: 200, count: 250, page: 1, timestamp: 0 }),
  );
  // The favourite team is chosen by default.
  expect(texts(r)).toContain('U14');
  expect(pressable(r, 'TEAM WEBPAGE')).toBeDefined();

  // Choosing "Org - All Teams" removes TEAM WEBPAGE.
  await ReactTestRenderer.act(async () => {
    pressable(r, 'Change team').props.onPress();
  });
  const allTeamsRow = r.root.findAll(
    node =>
      node.props.onPress &&
      node.props.accessibilityState &&
      node.findAll(n => n.props.children === 'Org - All Teams').length > 0,
  )[0];
  await ReactTestRenderer.act(async () => {
    allTeamsRow.props.onPress();
  });
  await layoutTiles(r);
  expect(pressable(r, 'TEAM WEBPAGE')).toBeUndefined();
});

test('HOME on a phone has no team picker', async () => {
  mockApi({ '/api/getUsersOrganizationV1': orgsRoute(), [TEAMS_PATH]: teamsRoute([]) });
  savedSession({ selectedOrgId: 100 });
  const r = await renderApp();

  expect(texts(r)).toContain('HOME');
  expect(pressable(r, 'Change team')).toBeUndefined();
});

test('the profile refresh updates only terms and organisations, never unique_id or the token', async () => {
  mockApi({
    '/api/getUsersOrganizationV1': orgsRoute(),
    '/api/getUserProfile': ok({
      user: { id: 1, name: 'Renamed', token: 'other', is_terms_accepted: 0, organization: [{ id: 5 }] },
    }),
  });
  savedSession({ selectedOrgId: 200 });
  (Keychain.getGenericPassword as jest.Mock).mockResolvedValue({
    username: 'session',
    password: JSON.stringify({ token: 'abc', user: { ...USER, unique_id: 78180 }, selectedOrgId: 200 }),
  });
  await renderApp();

  const saved = (Keychain.setGenericPassword as jest.Mock).mock.calls.map(c => JSON.parse(c[1]));
  const last = saved[saved.length - 1];
  expect(last.token).toBe('abc');
  expect(last.user).toEqual(
    expect.objectContaining({
      unique_id: 78180,
      name: 'Test Coach',
      token: 'abc',
      is_terms_accepted: 0,
      organization: [{ id: 5 }],
    }),
  );
});

test('an organisation sync that finishes after logout writes nothing', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  (global as any).fetch = jest.fn(async (url: string) => {
    if (url.endsWith('/api/getUsersOrganizationV1')) {
      await gate;
      return { status: 200, json: async () => ({ status: true, message: '', data: { organizations: ORGS, paging: { next: -1 } } }) };
    }
    return { status: 404, json: async () => ({ status: false, message: 'not mocked' }) };
  });
  savedSession();
  const r = await renderApp();
  await layoutTiles(r);

  // Log out while the organisation list is still loading.
  await ReactTestRenderer.act(async () => {
    pressable(r, 'SETTINGS').props.onPress();
  });
  await flush();
  const logOut = r.root.findAll(
    node => node.props.onPress && node.findAll(n => n.props.children === 'LOG OUT').length > 0,
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

  expect(readOrganizations(1)).toEqual([]);
  expect(texts(r)).toContain('SIGN IN');
});
