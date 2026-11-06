/**
 * Sign-in, restore and logout, with the network and Keychain mocked.
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

type FetchCall = [string, { method: string; headers: Record<string, string>; body?: string }];

function mockFetch(status: number, body: unknown) {
  const fetchMock = jest.fn(() => Promise.resolve({ status, json: () => Promise.resolve(body) }));
  (global as any).fetch = fetchMock;
  return fetchMock;
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
  return renderer;
}

const texts = (r: Renderer) =>
  r.root
    .findAll(node => typeof node.props.children === 'string')
    .map(node => node.props.children as string);

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
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

test('login posts an encrypted password with the iOS headers, saves the session and opens the dashboard', async () => {
  const fetchMock = mockFetch(200, { status: true, message: '', data: { user: USER } });
  const r = await renderApp();

  await signIn(r, ' coach@example.com ', 'secret');

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0] as unknown as FetchCall;
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
  expect(texts(r)).toContain('LOG OUT');
});

test('a rejected login shows the server message and stays on the login screen', async () => {
  mockFetch(200, { status: false, message: 'Invalid credentials' });
  const r = await renderApp();

  await signIn(r, 'coach@example.com', 'wrong');

  expect(Alert.alert).toHaveBeenCalledWith('Error', 'Invalid credentials');
  expect(Keychain.setGenericPassword).not.toHaveBeenCalled();
  expect(texts(r)).toContain('SIGN IN');
});

test('a saved session opens the dashboard and later requests carry the token', async () => {
  (Keychain.getGenericPassword as jest.Mock).mockResolvedValueOnce({
    username: 'session',
    password: JSON.stringify({ token: 'abc', user: USER }),
  });
  const r = await renderApp();
  expect(texts(r)).toContain('LOG OUT');

  const fetchMock = mockFetch(200, { status: true, message: '' });
  const { apiRequest } = require('../src/api/client');
  await apiRequest('/api/anything');
  const [, init] = fetchMock.mock.calls[0] as unknown as FetchCall;
  expect(init.headers.Authorization).toBe('Bearer abc');
  expect(init.headers.token).toBe('abc');
});

test('logging out clears the session and returns to the login screen', async () => {
  (Keychain.getGenericPassword as jest.Mock).mockResolvedValueOnce({
    username: 'session',
    password: JSON.stringify({ token: 'abc', user: USER }),
  });
  const r = await renderApp();

  const logOut = r.root.findAll(
    node => node.props.onPress && node.findAll(n => n.props.children === 'LOG OUT').length > 0,
  )[0];
  await ReactTestRenderer.act(async () => {
    logOut.props.onPress();
  });
  // Confirm in the alert.
  const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
  await ReactTestRenderer.act(async () => {
    buttons.find((b: { text: string }) => b.text === 'Log Out').onPress();
  });

  expect(Keychain.resetGenericPassword).toHaveBeenCalled();
  expect(texts(r)).toContain('SIGN IN');
});

test('a 401 from any request signs the user out', async () => {
  (Keychain.getGenericPassword as jest.Mock).mockResolvedValueOnce({
    username: 'session',
    password: JSON.stringify({ token: 'abc', user: USER }),
  });
  const r = await renderApp();

  mockFetch(401, { status: false, message: 'Unauthorized' });
  const { apiRequest } = require('../src/api/client');
  await ReactTestRenderer.act(async () => {
    await expect(apiRequest('/api/anything')).rejects.toThrow('Unauthorized');
  });

  expect(Keychain.resetGenericPassword).toHaveBeenCalled();
  expect(texts(r)).toContain('SIGN IN');
});
