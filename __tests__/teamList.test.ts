/**
 * Step 7: the hub's team list (opponents, search, favourites, the team
 * "…" menu). Rules, request bodies and the cache, against a real in-memory
 * Realm (emptied before every test by jest.setupAfterEnv.js).
 */

// RSA is replaced by a readable marker so the request bodies can be checked.
jest.mock('../src/utils/rsa', () => ({ rsaEncrypt: (v: unknown) => `enc(${v})` }));

import { gamesRequestBody } from '../src/api/games';
import {
  fetchOpponents,
  mapOpponent,
  opponentSaveBody,
  opponentsRequestBody,
  saveOpponent,
} from '../src/api/opponents';
import {
  deleteTeamBody,
  duplicateTeam,
  duplicateTeamBody,
  favouriteBody,
  mapTeam,
  setTeamFavourite,
} from '../src/api/teams';
import type { OpponentTeam, Team } from '../src/api/types';
import { teamPagePath, websitePageUrl, websiteTokenRequestBody } from '../src/api/website';
import { ALL_TEAMS, ALL_TEAMS_NAME, teamPickerList } from '../src/dashboard/teamLogic';
import {
  readOpponents,
  readTeamMembers,
  readTeams,
  removeTeamLocally,
  replaceOpponents,
  replaceTeams,
  setFavouriteLocally,
  writeOpponent,
} from '../src/db/repositories';
import { SCHEMA_VERSION } from '../src/db/store';
import { gameListKey } from '../src/games/useGameList';
import { deleteTeamFlow, duplicateTeamFlow, favouriteFlow, saveOpponentFlow } from '../src/teams/teamActions';
import {
  archivedCount,
  duplicateNameCheck,
  hasRowMenu,
  inviteLink,
  myTeamRows,
  opponentRows,
  teamMenuActions,
} from '../src/teams/teamRail';

type FetchCall = [string, { body: string }];
const ok = (data: unknown) => ({ body: { status: true, message: '', data } });

function mockFetch(answer: (path: string, body: any) => { body: unknown; status?: number }) {
  const fn = jest.fn(async (url: string, init: { body?: string }) => {
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    const { body, status = 200 } = answer(path, JSON.parse(init.body ?? '{}'));
    return { status, json: async () => body };
  });
  (global as any).fetch = fn;
  return {
    fn,
    bodies: () => (fn.mock.calls as unknown as FetchCall[]).map(([url, init]) => ({ url, body: JSON.parse(init.body) })),
  };
}

function team(id: number, name: string, extra: Partial<Team> = {}): Team {
  return {
    id,
    organizationId: 200,
    name,
    teamType: 0,
    isDeleted: 0,
    isArchive: 0,
    isFavourite: 0,
    uniqueNumber: `U${id}`,
    organizationName: '',
    logoUrl: '',
    abbr: '',
    noOfPlayers: 0,
    playerLink: '',
    coachLink: '',
    followerLink: '',
    ...extra,
  };
}
const opp = (id: number, name: string, extra: Partial<OpponentTeam> = {}): OpponentTeam => ({
  id,
  organizationId: 200,
  name,
  isDeleted: 0,
  ...extra,
});

const withMembers = (t: Team, ids: number[]) => ({
  team: t,
  members: ids.map(userId => ({
    teamId: t.id,
    orgId: 200,
    userId,
    userName: `U${userId}`,
    userEmail: '',
    roleId: 2,
    jerseyNumber: 9999,
  })),
});

describe('the rail lists', () => {
  test('My Team: All Teams always first, then names containing the search text, any case', () => {
    const list = teamPickerList([team(1, 'U14 Blue'), team(2, 'U16 Red'), team(3, 'Seniors')]);
    expect(myTeamRows(list, '').map(r => r.name)).toEqual([ALL_TEAMS_NAME, 'Seniors', 'U14 Blue', 'U16 Red']);
    expect(myTeamRows(list, ' u1 ').map(r => r.name)).toEqual([ALL_TEAMS_NAME, 'U14 Blue', 'U16 Red']);
    expect(myTeamRows(list, 'zzz').map(r => r.id)).toEqual([ALL_TEAMS.id]);
  });

  test('My Team rows carry the favourite star', () => {
    const list = teamPickerList([team(1, 'A', { isFavourite: 1 }), team(2, 'B')]);
    expect(myTeamRows(list, '').map(r => r.isFavourite)).toEqual([false, true, false]);
  });

  test('Opponents: All Teams first, then this organisation’s live opponents by name, filtered by search', () => {
    const list = [
      opp(5, 'zebras'),
      opp(6, 'Alpha'),
      opp(7, 'Gone', { isDeleted: 1 }),
      opp(8, 'Elsewhere', { organizationId: 300 }),
    ];
    expect(opponentRows(list, 200, '').map(r => [r.id, r.name])).toEqual([
      [0, ALL_TEAMS_NAME],
      [6, 'Alpha'],
      [5, 'zebras'],
    ]);
    expect(opponentRows(list, 200, 'ZEB').map(r => r.id)).toEqual([0, 5]);
  });

  test('Archived (n) counts archived normal teams that aren’t deleted', () => {
    expect(
      archivedCount([
        team(1, 'a', { isArchive: 1 }),
        team(2, 'b', { isArchive: 1, isDeleted: 1 }),
        team(3, 'c', { isArchive: 1, teamType: 1 }),
        team(4, 'd'),
      ]),
    ).toBe(1);
  });
});

describe('who gets a "…" menu, and what is in it', () => {
  test('never on All Teams; every team for everyone; opponents for coaches and admins only', () => {
    expect(hasRowMenu('myTeam', 0, true)).toBe(false);
    expect(hasRowMenu('myTeam', 11, false)).toBe(true);
    expect(hasRowMenu('opponent', 0, true)).toBe(false);
    expect(hasRowMenu('opponent', 5, true)).toBe(true);
    expect(hasRowMenu('opponent', 5, false)).toBe(false);
  });

  test('a coach gets the team options (Edit Team first) without Delete; an admin also gets Delete', () => {
    expect(teamMenuActions({ canManage: true, isAdmin: false, isFavourite: false })).toEqual([
      'edit',
      'invite',
      'webpage',
      'duplicate',
      'favourite',
    ]);
    expect(teamMenuActions({ canManage: true, isAdmin: true, isFavourite: true })).toEqual([
      'edit',
      'invite',
      'webpage',
      'duplicate',
      'unfavourite',
      'delete',
    ]);
  });

  test('anyone else can only star or unstar the team', () => {
    expect(teamMenuActions({ canManage: false, isAdmin: false, isFavourite: false })).toEqual(['favourite']);
    expect(teamMenuActions({ canManage: false, isAdmin: false, isFavourite: true })).toEqual(['unfavourite']);
  });

  test('a copy needs a name that no listed team has (archived names are free, as in iOS)', () => {
    const teams = [team(1, 'U14'), team(2, 'Old', { isArchive: 1 })];
    expect(duplicateNameCheck('   ', teams)).toEqual({ ok: false, error: 'Please enter a name.' });
    expect(duplicateNameCheck('U14', teams)).toEqual({ ok: false, error: 'Team name already exists.' });
    expect(duplicateNameCheck(' U14 copy ', teams)).toEqual({ ok: true, value: 'U14 copy' });
    expect(duplicateNameCheck('Old', teams)).toEqual({ ok: true, value: 'Old' });
    expect(duplicateNameCheck('u14', teams)).toEqual({ ok: true, value: 'u14' }); // exact match only
  });

  test('invite links per role', () => {
    const t = team(1, 'U14', { playerLink: 'p', coachLink: 'c', followerLink: '' });
    expect(inviteLink(t, 'player')).toBe('p');
    expect(inviteLink(t, 'coach')).toBe('c');
    expect(inviteLink(t, 'follower')).toBe('');
  });
});

describe('requests, as iOS sends them', () => {
  test('opponent list: plain ids, 400 a page, the full list', () => {
    expect(opponentsRequestBody(1932, 200, 2)).toEqual({
      page: 2,
      count: 400,
      organization_id: 200,
      user_id: 1932,
      timestamp: 0,
    });
  });

  test('adding sends the name; renaming adds opponentteamId', () => {
    expect(opponentSaveBody({ userId: 1, orgId: 200, name: 'Rivals' })).toEqual({
      user_id: 1,
      organization_id: 200,
      team_name: 'Rivals',
    });
    expect(opponentSaveBody({ userId: 1, orgId: 200, name: 'Rivals', opponentId: 9 })).toEqual({
      user_id: 1,
      organization_id: 200,
      team_name: 'Rivals',
      opponentteamId: 9,
    });
  });

  test('duplicate, favourite and delete bodies', () => {
    expect(duplicateTeamBody(11, 'U14 copy')).toEqual({ enc_team_id: 'enc(11)', name: 'U14 copy' });
    expect(favouriteBody(11, 200)).toEqual({ team_id: 11, organization_id: 200 });
    expect(deleteTeamBody(11)).toEqual({ enc_id: 'enc(11)' });
  });

  test('starring and unstarring use their own endpoints', async () => {
    const api = mockFetch(() => ok({}));
    await setTeamFavourite(11, 200, true);
    await setTeamFavourite(11, 200, false);
    expect(api.bodies().map(c => c.url.replace(/^https?:\/\/[^/]+/, ''))).toEqual([
      '/api/team/setTeamFavourite',
      '/api/team/unSetTeamFavourite',
    ]);
  });

  test('an opponent’s games: team type 2 and the opponent’s id', () => {
    const base = { userId: 1, orgId: 200, isHomeUser: false, tab: 'GAMES' as const, page: 1 };
    expect(gamesRequestBody({ ...base, teamId: 11 })).toEqual(expect.objectContaining({ team_type: 1, enc_team_id: 'enc(11)' }));
    expect(gamesRequestBody({ ...base, teamId: 33, teamType: 2 })).toEqual(
      expect.objectContaining({ team_type: 2, enc_team_id: 'enc(33)' }),
    );
  });

  test('an opponent’s games are cached apart from the team with the same id', () => {
    const p = { userId: 1, orgId: 200, isHomeUser: false, tab: 'GAMES' as const };
    expect(gameListKey({ ...p, teamId: 11 })).toBe('1:200:11:GAMES'); // unchanged for My Team
    expect(gameListKey({ ...p, teamId: 11, teamType: 1 })).toBe('1:200:11:GAMES');
    expect(gameListKey({ ...p, teamId: 11, teamType: 2 })).toBe('1:200:o11:GAMES');
    expect(gameListKey({ ...p, teamId: 0, teamType: 2 })).toBe('1:200:o0:GAMES');
  });

  test('a team’s web page: signed in and landing on team/<unique number>', () => {
    const body = websiteTokenRequestBody({
      userId: 7,
      orgId: 200,
      token: 't',
      tab: 'team',
      redirectPath: teamPagePath('ABC123'),
      nowSeconds: 1,
    });
    expect(body.redirect_url).toBe('team/ABC123');
    expect(body.selected_tab).toBe('team');
    expect(websitePageUrl('team/ABC123')).toBe('https://snipback.com/team/ABC123');
  });
});

describe('answers', () => {
  test('teams carry their invite links', () => {
    const { team: t } = mapTeam(
      { id: 11, name: 'U14', sharecode_short_url: 'https://x/p', short_url_coach: 'https://x/c', short_url_follower: null },
      200,
    );
    expect([t.playerLink, t.coachLink, t.followerLink]).toEqual(['https://x/p', 'https://x/c', '']);
  });

  test('opponents map as iOS maps OpponentTeam', () => {
    expect(mapOpponent({ id: 5, name: 'Rivals', organization_id: 300, is_deleted: 1, game_count: 0 }, 200)).toEqual({
      id: 5,
      organizationId: 300,
      name: 'Rivals',
      isDeleted: 1,
    });
    expect(mapOpponent({ id: '6', name: null }, 200)).toEqual({ id: 6, organizationId: 200, name: '', isDeleted: 0 });
  });

  test('every page of opponents is read from "team"', async () => {
    mockFetch((_, body) =>
      ok({ team: [{ id: body.page * 10, name: `O${body.page}` }], paging: { next: body.page === 1 ? 2 : -1 } }),
    );
    expect((await fetchOpponents(1, 200)).map(o => o.id)).toEqual([10, 20]);
  });

  test('a saved opponent comes back under "opponentTeams", as an object or a list', async () => {
    mockFetch(() => ok({ opponentTeams: { id: 9, name: 'Rivals', organization_id: 200 } }));
    await expect(saveOpponent({ userId: 1, orgId: 200, name: 'Rivals' })).resolves.toEqual(opp(9, 'Rivals'));
    mockFetch(() => ok({ opponentTeams: [{ id: 9, name: 'Rivals', organization_id: 200 }] }));
    await expect(saveOpponent({ userId: 1, orgId: 200, name: 'Rivals' })).resolves.toEqual(opp(9, 'Rivals'));
  });

  test('a rename answered without the team keeps the name sent; an add without it is an error', async () => {
    mockFetch(() => ok({}));
    await expect(saveOpponent({ userId: 1, orgId: 200, name: 'New name', opponentId: 9 })).resolves.toEqual(
      opp(9, 'New name'),
    );
    await expect(saveOpponent({ userId: 1, orgId: 200, name: 'Rivals' })).rejects.toThrow('did not return it');
  });

  test('a copied team comes back under "team"', async () => {
    mockFetch(() => ok({ team: { id: 99, name: 'U14 copy', organization_id: 200, players_list: [] } }));
    await expect(duplicateTeam(11, 'U14 copy', 200)).resolves.toEqual(
      expect.objectContaining({ team: expect.objectContaining({ id: 99, name: 'U14 copy' }) }),
    );
    mockFetch(() => ok({}));
    await expect(duplicateTeam(11, 'U14 copy', 200)).rejects.toThrow('did not return it');
  });

  test('a refusal is shown as the server’s message', async () => {
    mockFetch(() => ({ body: { status: false, message: 'Encrypted parameters are missing' } }));
    await expect(setTeamFavourite(11, 200, true)).rejects.toThrow('Encrypted parameters are missing');
  });
});

describe('the cache (schema v7)', () => {
  test('the schema is version 7 or later', () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(7);
  });

  test('invite links are stored with the team', () => {
    replaceTeams(200, [withMembers(team(11, 'U14', { playerLink: 'p', coachLink: 'c', followerLink: 'f' }), [])]);
    expect(readTeams(200)[0]).toEqual(expect.objectContaining({ playerLink: 'p', coachLink: 'c', followerLink: 'f' }));
  });

  test('an organisation’s opponent list replaces only its own', () => {
    replaceOpponents(200, [opp(1, 'A'), opp(2, 'B')]);
    replaceOpponents(300, [opp(3, 'C', { organizationId: 300 })]);
    replaceOpponents(200, [opp(2, 'B2')]);
    expect(readOpponents(200)).toEqual([opp(2, 'B2')]);
    expect(readOpponents(300).map(o => o.id)).toEqual([3]);
  });

  test('one saved opponent is added or updated', () => {
    replaceOpponents(200, [opp(1, 'A')]);
    writeOpponent(opp(1, 'A renamed'));
    writeOpponent(opp(2, 'B'));
    expect(readOpponents(200).map(o => o.name).sort()).toEqual(['A renamed', 'B']);
  });

  test('starring clears the organisation’s other star, but not another organisation’s', () => {
    replaceTeams(200, [withMembers(team(11, 'U14', { isFavourite: 1 }), []), withMembers(team(12, 'U16'), [])]);
    replaceTeams(300, [withMembers(team(31, 'X', { organizationId: 300, isFavourite: 1 }), [])]);
    setFavouriteLocally(200, 12, true);
    expect(readTeams(200).map(t => [t.id, t.isFavourite])).toEqual([
      [11, 0],
      [12, 1],
    ]);
    expect(readTeams(300)[0].isFavourite).toBe(1);
    setFavouriteLocally(200, 12, false);
    expect(readTeams(200).every(t => t.isFavourite === 0)).toBe(true);
  });

  test('a deleted team leaves the cache with its roster; other teams stay', () => {
    replaceTeams(200, [withMembers(team(11, 'U14'), [1, 2]), withMembers(team(12, 'U16'), [3])]);
    removeTeamLocally(11);
    expect(readTeams(200).map(t => t.id)).toEqual([12]);
    expect(readTeamMembers(11)).toEqual([]);
    expect(readTeamMembers(12).map(m => m.userId)).toEqual([3]);
  });
});

describe('the menu actions', () => {
  test('duplicate stores the new team and says when the server changed its name', async () => {
    mockFetch(() => ok({ team: { id: 99, name: 'U14 _ copy', organization_id: 200, players_list: [] } }));
    const result = await duplicateTeamFlow({ orgId: 200, teamId: 11, name: 'U14 - copy' });
    expect(result).toEqual({ team: expect.objectContaining({ id: 99, name: 'U14 _ copy' }), renamed: true });
    expect(readTeams(200).map(t => t.id)).toEqual([99]);

    mockFetch(() => ok({ team: { id: 98, name: 'Same', organization_id: 200, players_list: [] } }));
    expect((await duplicateTeamFlow({ orgId: 200, teamId: 11, name: 'Same' })).renamed).toBe(false);
  });

  test('favourite and delete change the cache only after the server agrees', async () => {
    replaceTeams(200, [withMembers(team(11, 'U14'), [1])]);
    mockFetch(() => ({ body: { status: false, message: 'No' } }));
    await expect(favouriteFlow(200, 11, true)).rejects.toThrow('No');
    await expect(deleteTeamFlow(11)).rejects.toThrow('No');
    expect(readTeams(200)).toEqual([expect.objectContaining({ id: 11, isFavourite: 0 })]);

    mockFetch(() => ok({}));
    await favouriteFlow(200, 11, true);
    expect(readTeams(200)[0].isFavourite).toBe(1);
    await deleteTeamFlow(11);
    expect(readTeams(200)).toEqual([]);
  });

  test('an opponent name is sent trimmed and stored as the server saved it', async () => {
    const api = mockFetch(() => ok({ opponentTeams: { id: 9, name: 'Rivals', organization_id: 200 } }));
    const result = await saveOpponentFlow({ userId: 1, orgId: 200, name: '  Rivals ' });
    expect(api.bodies()[0].body.team_name).toBe('Rivals');
    expect(result.renamed).toBe(false);
    expect(readOpponents(200)).toEqual([opp(9, 'Rivals')]);
  });
});
