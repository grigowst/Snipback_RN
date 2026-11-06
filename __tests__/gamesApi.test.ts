// RSA is replaced by a readable marker so the request bodies can be checked.
jest.mock('../src/utils/rsa', () => ({ rsaEncrypt: (v: unknown) => `enc(${v})` }));

import { fetchGamesPage, gamesRequestBody, mapGame } from '../src/api/games';
import { readGameList, writeGameListPage } from '../src/db/repositories';

type FetchCall = [string, { body: string }];

function mockFetch(status: number, body: unknown) {
  const fn = jest.fn(async () => ({ status, json: async () => body }));
  (global as any).fetch = fn;
  return fn;
}

describe('mapGame (Models/Games.swift)', () => {
  test('game_id and gameDate win only when they are numbers', () => {
    expect(mapGame({ id: 1, game_id: 2, game_date: 10, gameDate: 20 })).toEqual(
      expect.objectContaining({ id: 2, gameDate: 20 }),
    );
    expect(mapGame({ id: 1, game_id: null, game_date: 10, gameDate: null })).toEqual(
      expect.objectContaining({ id: 1, gameDate: 10 }),
    );
  });

  test('teams are ordered by mapping type (home, away, others)', () => {
    const game = mapGame({
      id: 1,
      teamMapping: [
        { team_id: 30, name: 'Other', type: 3 },
        { team_id: 10, name: 'Home', type: 1 },
        { team_id: 20, name: 'Away', type: 2 },
      ],
    });
    expect(game.teamIds).toEqual([10, 20, 30]);
    expect(game.teamNames).toBe('Home,Away,Other');
  });

  test('uploading with low-quality upload and stream complete reads as ended', () => {
    expect(mapGame({ id: 1, status: 1, upload_status_low: 2, stream_status_low: 2 }).status).toBe(2);
    expect(mapGame({ id: 1, status: 1, upload_status_low: 2, stream_status_low: 1 }).status).toBe(1);
    expect(mapGame({ id: 1, status: 0, upload_status_low: 2, stream_status_low: 2 }).status).toBe(0);
  });

  test('the score comes from additional_details; the raw row is kept', () => {
    const game = mapGame({
      id: 1,
      additional_details: { home_team_point: 3, away_team_point: 1, game_result: '1' },
    });
    expect(game).toEqual(expect.objectContaining({ homeTeamPoint: 3, awayTeamPoint: 1, gameResult: '1' }));
    expect(JSON.parse(game.rawJson).id).toBe(1);
  });
});

describe('the games request (getAllGamesNew)', () => {
  const base = { userId: 7, orgId: 50, isHomeUser: false, teamId: 11, page: 1 };

  test.each([
    ['GAMES', 1],
    ['PRACTICES', 0],
    ['SCOUT', 2],
  ] as const)('%s asks for game_type %d', (tab, gameType) => {
    expect(gamesRequestBody({ ...base, tab })).toEqual({
      page: 1,
      count: 50,
      timestamp: 0,
      search: '',
      enc_team_id: 'enc(11)',
      enc_organization_id: 'enc(50)',
      enc_userId: 'enc(7)',
      team_type: 1,
      game_type: gameType,
    });
  });

  test('HOME sends organisation 0', () => {
    expect(gamesRequestBody({ ...base, isHomeUser: true, tab: 'GAMES' }).enc_organization_id).toBe(
      'enc(0)',
    );
  });

  test('"No games found" is an empty last page, not an error', async () => {
    mockFetch(200, { status: false, message: ' No games found ' });
    await expect(fetchGamesPage({ ...base, tab: 'GAMES' })).resolves.toEqual({ games: [], next: -1 });
  });

  test('other failures still fail', async () => {
    mockFetch(200, { status: false, message: 'Server error' });
    await expect(fetchGamesPage({ ...base, tab: 'GAMES' })).rejects.toThrow('Server error');
  });

  test('the list is read from data.games, or data.game', async () => {
    const fetchMock = mockFetch(200, {
      status: true,
      message: '',
      data: { game: [{ id: 5, name: 'Final' }], paging: { next: 2 } },
    });
    const page = await fetchGamesPage({ ...base, tab: 'GAMES' });
    expect(page.games.map(g => g.id)).toEqual([5]);
    expect(page.next).toBe(2);
    const [url] = fetchMock.mock.calls[0] as unknown as FetchCall;
    expect(url).toMatch(/\/api\/game\/listGamesV2$/);
  });
});

describe('cached game lists', () => {
  const g = (id: number, extra: Record<string, unknown> = {}) => mapGame({ id, name: `G${id}`, ...extra });

  test('page 1 replaces the list; later pages append without duplicates', () => {
    writeGameListPage('k', 1, [g(1), g(2)], 2);
    writeGameListPage('k', 2, [g(2), g(3)], -1);
    expect(readGameList('k')?.games.map(x => x.id)).toEqual([1, 2, 3]);
    expect(readGameList('k')?.nextPage).toBe(-1);

    writeGameListPage('k', 1, [g(4)], -1);
    expect(readGameList('k')?.games.map(x => x.id)).toEqual([4]);
  });

  test('deleted games are left out; an unknown list is null', () => {
    writeGameListPage('k', 1, [g(1), g(2, { is_deleted: 1 })], -1);
    expect(readGameList('k')?.games.map(x => x.id)).toEqual([1]);
    expect(readGameList('never')).toBeNull();
  });

  test('a game shared by two lists is stored once and updates in both', () => {
    writeGameListPage('a', 1, [g(1)], -1);
    writeGameListPage('b', 1, [g(1, { name: 'Renamed' })], -1);
    expect(readGameList('a')?.games[0].name).toBe('Renamed');
  });
});

test('fractional numbers from the API: gameDate keeps them, integer fields truncate, Realm accepts the row', () => {
  const g = mapGame({ id: 9.0, game_date: 1793000000.734, status: 2.0, facilitycam_duration: 754.6 });
  expect(g.gameDate).toBeCloseTo(1793000000.734, 3);
  expect(g.facilitycamDuration).toBe(754);
  expect(() => writeGameListPage('frac', 1, [g], -1)).not.toThrow();
  expect(readGameList('frac')?.games[0].gameDate).toBeCloseTo(1793000000.734, 3);
});
