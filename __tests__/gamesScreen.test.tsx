/**
 * The phone Games screen against a mocked API and a real in-memory Realm.
 *
 * @format
 */

import React from 'react';
import { Alert } from 'react-native';
import ReactTestRenderer, { type ReactTestRenderer as Renderer } from 'react-test-renderer';
import * as Keychain from 'react-native-keychain';
import App from '../App';
import { mapGame } from '../src/api/games';
import { readGameList, writeGameListPage } from '../src/db/repositories';
import { gameListKey } from '../src/games/useGameList';

jest.useFakeTimers();

const USER = { id: 1, name: 'Test Coach', email: 'coach@example.com', token: 'abc' };
const ORGS = [
  { id: 100, name: 'Coach Home', user_id: 1, role_id: 3, organization_type: 2 },
  { id: 200, name: 'Alpha FC', user_id: 1, role_id: 1, organization_type: 1 },
];
const TEAMS = [{ id: 11, name: 'U14', organization_id: 200, team_type: 0, is_archive: 0, is_deleted: 0 }];

type Body = { page: number; game_type: number };
type GamesHandler = (body: Body) => Promise<unknown> | unknown;

const ok = (data: unknown) => ({ status: true, message: '', data });
const game = (id: number, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  gameDate: 1_793_000_000 - id,
  organization_id: 200,
  status: 2,
  ...extra,
});

/** fetch(): orgs and teams answer at once; games go through `onGames`. */
function mockApi(onGames: GamesHandler) {
  const fn = jest.fn(async (url: string, init: { body?: string }) => {
    const reply = (body: unknown, status = 200) => ({ status, json: async () => body });
    if (url.endsWith('/api/getUsersOrganizationV1')) {
      return reply(ok({ organizations: ORGS, paging: { next: -1 } }));
    }
    if (url.endsWith('/api/team/list/myteamsV3')) {
      return reply(ok({ team: TEAMS, paging: { next: -1 } }));
    }
    if (url.endsWith('/api/game/listGamesV2')) {
      const result = await onGames(JSON.parse(init.body ?? '{}'));
      if (result === 'offline') {
        throw new TypeError('Network request failed');
      }
      return reply(result);
    }
    return reply({ status: false, message: 'not mocked' }, 404);
  });
  (global as any).fetch = fn;
  return fn;
}

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

async function openGames(): Promise<Renderer> {
  (Keychain.getGenericPassword as jest.Mock).mockResolvedValue({
    username: 'session',
    password: JSON.stringify({ token: 'abc', user: USER, selectedOrgId: 200 }),
  });
  let r!: Renderer;
  await ReactTestRenderer.act(async () => {
    r = ReactTestRenderer.create(<App />);
  });
  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(1000);
  });
  await flush();
  // Lay out the tile grid, then tap GAMES/TEAMS.
  const boxes = r.root.findAll(n => typeof n.props.onLayout === 'function');
  await ReactTestRenderer.act(async () => {
    boxes.forEach(b => b.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 700 } } }));
  });
  await ReactTestRenderer.act(async () => {
    pressable(r, 'GAMES/TEAMS').props.onPress();
  });
  await flush();
  return r;
}

const KEY = (tab: 'GAMES' | 'PRACTICES' | 'SCOUT') =>
  gameListKey({ userId: 1, orgId: 200, isHomeUser: false, teamId: 11, tab });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

test('GAMES opens the list for the dashboard org and team, newest first as the server sent', async () => {
  const fetchMock = mockApi(({ game_type, page }) =>
    ok({ games: game_type === 1 && page === 1 ? [game(1, 'Final'), game(2, 'Semi')] : [], paging: { next: -1 } }),
  );
  const r = await openGames();

  expect(texts(r)).toEqual(expect.arrayContaining(['Alpha FC', 'U14', 'Final', 'Semi']));
  const calls = (fetchMock.mock.calls as unknown as [string, { body: string }][]).filter(([u]) =>
    u.endsWith('/api/game/listGamesV2'),
  );
  expect(JSON.parse(calls[0][1].body)).toEqual(expect.objectContaining({ page: 1, game_type: 1, count: 50 }));
  expect(readGameList(KEY('GAMES'))?.games.map(g => g.name)).toEqual(['Final', 'Semi']);
});

test('scrolling to the end loads the next page and appends it', async () => {
  mockApi(({ page }) =>
    page === 1
      ? ok({ games: [game(1, 'Page one')], paging: { next: 2 } })
      : ok({ games: [game(2, 'Page two')], paging: { next: -1 } }),
  );
  const r = await openGames();
  expect(texts(r)).toContain('Page one');

  const list = r.root.findAll(n => typeof n.props.onEndReached === 'function')[0];
  await ReactTestRenderer.act(async () => {
    list.props.onEndReached();
  });
  await flush();

  expect(texts(r)).toEqual(expect.arrayContaining(['Page one', 'Page two']));
  expect(readGameList(KEY('GAMES'))?.games.map(g => g.name)).toEqual(['Page one', 'Page two']);
});

test("a slow answer for a tab you've left changes nothing", async () => {
  let releaseGames!: () => void;
  const gamesGate = new Promise<void>(resolve => {
    releaseGames = resolve;
  });
  mockApi(async ({ game_type }) => {
    if (game_type === 1) {
      await gamesGate;
      return ok({ games: [game(1, 'Late game')], paging: { next: -1 } });
    }
    return ok({ games: [game(5, 'Practice A')], paging: { next: -1 } });
  });
  const r = await openGames();

  await ReactTestRenderer.act(async () => {
    pressable(r, 'PRACTICES tab').props.onPress();
  });
  await flush();
  expect(texts(r)).toContain('Practice A');

  releaseGames();
  await flush();
  expect(texts(r)).not.toContain('Late game');
  expect(readGameList(KEY('GAMES'))).toBeNull();
});

test('offline: the cached list shows with an error bar', async () => {
  writeGameListPage(KEY('GAMES'), 1, [mapGame(game(1, 'Cached final'))], -1);
  mockApi(() => 'offline');
  const r = await openGames();

  expect(texts(r)).toContain('Cached final');
  expect(texts(r)).toContain('Unable to reach Snipback. Check your internet connection.');
});

test('closing the screen mid-load writes nothing', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  mockApi(async () => {
    await gate;
    return ok({ games: [game(1, 'Too late')], paging: { next: -1 } });
  });
  const r = await openGames();

  await ReactTestRenderer.act(async () => {
    r.unmount();
  });
  release();
  await flush();

  expect(readGameList(KEY('GAMES'))).toBeNull();
});

test('"No games found" shows the empty state, not an error', async () => {
  mockApi(() => ({ status: false, message: 'No games found' }));
  const r = await openGames();

  expect(texts(r)).toContain('No games found.');
  expect(texts(r)).not.toContain('RETRY');
});

const gamesCalls = (fetchMock: jest.Mock) =>
  (fetchMock.mock.calls as unknown as [string, { body: string }][])
    .filter(([u]) => u.endsWith('/api/game/listGamesV2'))
    .map(([, init]) => JSON.parse(init.body) as Body);

test('no load-more while page 1 is refreshing (a cached cursor would skip a page)', async () => {
  writeGameListPage(KEY('GAMES'), 1, [mapGame(game(1, 'Cached'))], 3);
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const fetchMock = mockApi(async ({ page }) => {
    if (page === 1) {
      await gate;
      return ok({ games: [game(1, 'Fresh one')], paging: { next: 2 } });
    }
    return ok({ games: [game(page * 10, `Page ${page}`)], paging: { next: -1 } });
  });
  const r = await openGames();

  const list = r.root.findAll(n => typeof n.props.onEndReached === 'function')[0];
  await ReactTestRenderer.act(async () => {
    list.props.onEndReached();
  });
  await flush();
  expect(gamesCalls(fetchMock).map(b => b.page)).toEqual([1]);

  release();
  await flush();
  expect(readGameList(KEY('GAMES'))?.games.map(g => g.name)).toEqual(['Fresh one']);
});

test('a load-more that finishes after a refresh is dropped', async () => {
  let releasePage2!: () => void;
  const page2Gate = new Promise<void>(resolve => {
    releasePage2 = resolve;
  });
  mockApi(async ({ page }) => {
    if (page === 2) {
      await page2Gate;
      return ok({ games: [game(2, 'Old page two')], paging: { next: -1 } });
    }
    return ok({ games: [game(1, 'Page one')], paging: { next: 2 } });
  });
  const r = await openGames();

  const list = r.root.findAll(n => typeof n.props.onEndReached === 'function')[0];
  await ReactTestRenderer.act(async () => {
    list.props.onEndReached();
  });
  await flush();
  const refresher = r.root.findAll(n => typeof n.props.onRefresh === 'function')[0];
  await ReactTestRenderer.act(async () => {
    refresher.props.onRefresh();
  });
  await flush();

  releasePage2();
  await flush();
  expect(readGameList(KEY('GAMES'))?.games.map(g => g.name)).toEqual(['Page one']);
  expect(texts(r)).not.toContain('Old page two');
});

test('a failed load shows the error, not "No games found."', async () => {
  mockApi(() => ({ status: false, message: 'Server error' }));
  const r = await openGames();

  expect(texts(r)).toContain('Server error');
  expect(texts(r)).not.toContain('No games found.');
});
