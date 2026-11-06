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

jest.useFakeTimers();

const USER = { id: 1, name: 'Test Coach', email: 'coach@example.com', token: 'abc' };

const ORGS = [
  { id: 100, name: 'Coach Home', user_id: 1, role_id: 3, organization_type: 2 },
  { id: 200, name: 'Alpha FC', user_id: 1, role_id: 1, organization_type: 1, organization_is_default: 1 },
  { id: 300, name: 'Beta FC', user_id: 1, role_id: 2, organization_type: 1 },
];

type FetchCall = [string, { method: string; headers: Record<string, string>; body?: string }];
type Route = { status: number; body: unknown };

/** fetch() that answers by URL ending; anything else is a 404. */
function mockApi(routes: Record<string, Route>) {
  const fetchMock = jest.fn((url: string) => {
    const match = Object.keys(routes).find(path => url.endsWith(path));
    const route = match ? routes[match] : { status: 404, body: { status: false, message: 'not mocked' } };
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
