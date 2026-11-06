// RSA is replaced by a readable marker so the request bodies can be checked.
jest.mock('../src/utils/rsa', () => ({ rsaEncrypt: (v: unknown) => `enc(${v})` }));

import { fetchOrgUsers, mapPerson, usersRequestBody } from '../src/api/users';
import { createWebsiteLink, websiteTokenRequestBody } from '../src/api/website';
import { readOrgUsers, readPeople, replaceOrgUsers } from '../src/db/repositories';

type FetchCall = [string, { body: string }];

function mockFetch(handler: (url: string, body: any) => { status?: number; body: unknown }) {
  const fn = jest.fn(async (url: string, init: { body: string }) => {
    const { status = 200, body } = handler(url, JSON.parse(init.body));
    return { status, json: async () => body };
  });
  (global as any).fetch = fn;
  return fn;
}

const ok = (data: unknown) => ({ body: { status: true, message: '', data } });

describe('the users list (getAllUsers)', () => {
  test('a row maps the way Models/User.swift maps it, keeping the raw row', () => {
    const person = mapPerson({
      id: 5,
      name: 'Ann',
      email: 'ann@example.com',
      username: 'ann',
      unique_id: '77',
      avatar: 'https://img/5.png',
      organization: [{ org_id: 200, role_id: 5 }],
    });
    expect(person).toEqual({
      id: 5,
      name: 'Ann',
      email: 'ann@example.com',
      username: 'ann',
      uniqueId: 77,
      avatar: 'https://img/5.png',
      rawJson: expect.any(String),
    });
    expect(JSON.parse(person.rawJson).organization).toEqual([{ org_id: 200, role_id: 5 }]);
  });

  test('the request matches iOS: 400 a page, organisation, encrypted user, full list', () => {
    expect(usersRequestBody(7, 200, 3)).toEqual({
      count: 400,
      page: 3,
      organization_id: 200,
      enc_user_id: 'enc(7)',
      timestamp: 0,
    });
  });

  test('every page is followed and rows without an id are dropped', async () => {
    const fetchMock = mockFetch((url, body) =>
      body.page === 1
        ? ok({ players: [{ id: 1, name: 'A' }, { id: 0, name: 'nobody' }], paging: { next: 2 } })
        : ok({ players: [{ id: 2, name: 'B' }], paging: { next: -1 } }),
    );
    const people = await fetchOrgUsers(7, 200);
    expect(people.map(p => p.id)).toEqual([1, 2]);
    const calls = fetchMock.mock.calls as unknown as FetchCall[];
    expect(calls.map(([url]) => url.endsWith('/api/getAllUsersV2'))).toEqual([true, true]);
  });
});

describe('the users cache', () => {
  const p = (id: number, name = `P${id}`) => mapPerson({ id, name });

  test('a person shared with another organisation survives when this one drops them', () => {
    replaceOrgUsers(200, [p(1), p(2)]);
    replaceOrgUsers(300, [p(2), p(3)]);

    // Org 200 no longer lists person 2 (or 1).
    replaceOrgUsers(200, [p(4)]);

    expect(readOrgUsers(200).map(x => x.id)).toEqual([4]);
    expect(readOrgUsers(300).map(x => x.id).sort()).toEqual([2, 3]);
    // Person 1 was only in org 200, so the row is gone; person 2 is kept for org 300.
    expect([...readPeople([1, 2, 3, 4]).keys()].sort()).toEqual([2, 3, 4]);
  });

  test('a newer row replaces the cached one for every organisation', () => {
    replaceOrgUsers(200, [p(1, 'Old')]);
    replaceOrgUsers(300, [p(1, 'New')]);
    expect(readOrgUsers(200)[0].name).toBe('New');
  });
});

describe('the website sign-in link (createWebsiteAccessToken)', () => {
  const input = { userId: 7, orgId: 200, token: 'session-token', tab: 'team' as const };

  test('the request matches iOS', () => {
    expect(websiteTokenRequestBody({ ...input, nowSeconds: 1_793_000_000 })).toEqual({
      enc_user_id: 'enc(7)',
      enc_orgId: 'enc(200)',
      enc_access_token: 'enc(session-token)',
      user_login: 1,
      redirect_url: 'listUserTeam',
      selected_tab: 'team',
      timestamp: 1_793_000_000,
      deviceType: 'iOS', // Jest runs as iOS
    });
  });

  test('the timestamp is whole seconds', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_793_000_000_999);
    expect(websiteTokenRequestBody(input).timestamp).toBe(1_793_000_000);
    jest.restoreAllMocks();
  });

  test('the answer becomes the website authentication URL', async () => {
    const fetchMock = mockFetch(() => ok({ token: 'one-time' }));
    await expect(createWebsiteLink({ ...input, tab: 'user' })).resolves.toBe(
      'https://snipback.com/authentication/one-time',
    );
    const [url, init] = (fetchMock.mock.calls as unknown as FetchCall[])[0];
    expect(url).toMatch(/\/api\/createWebsiteAccessToken$/);
    expect(JSON.parse(init.body).selected_tab).toBe('user');
  });

  test('a refusal or an empty token is an error', async () => {
    mockFetch(() => ({ body: { status: false, message: 'Invalid session' } }));
    await expect(createWebsiteLink(input)).rejects.toThrow('Invalid session');
    mockFetch(() => ok({ token: '' }));
    await expect(createWebsiteLink(input)).rejects.toThrow('Unable to open the website');
  });
});
