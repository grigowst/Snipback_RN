/**
 * Step 8: the team editor (create and edit, game defaults, members). Rules,
 * request bodies and the save flows, against a mocked API and a real
 * in-memory Realm (emptied before every test by jest.setupAfterEnv.js).
 */

// RSA is replaced by a readable marker so the request bodies can be checked.
jest.mock('../src/utils/rsa', () => ({ rsaEncrypt: (v: unknown) => `enc(${v})` }));

import type { FreshTeam } from '../src/api/members';
import {
  createTeamBody,
  fetchCategories,
  fetchTeamDefaults,
  mapDefaults,
  newTeamDefaults,
  saveDefaultsBody,
  sendTeamUpdate,
  teamUpdateBody,
  type HomeAway,
} from '../src/api/teamEditor';
import { mapTeam } from '../src/api/teams';
import { readTeamMembers, readTeams } from '../src/db/repositories';
import { createTeamFlow, editTeamFlow, type EditInput } from '../src/teams/teamEditorActions';
import {
  abbrInput,
  acceptNameInput,
  addedEntry,
  defaultValue,
  defaultsChanged,
  editorEntries,
  orgPane,
  setDefault,
  shownDefaults,
  teamNameCheck,
  teamPane,
  withCategory,
} from '../src/teams/teamEditorRules';

type Call = { path: string; body: any };
const ok = (data: unknown) => ({ body: { status: true, message: '', data } });
const refuse = (message: string) => ({ body: { status: false, message } });

function mockFetch(answer: (path: string, body: any) => { body: unknown; status?: number }) {
  const calls: Call[] = [];
  (global as any).fetch = jest.fn(async (url: string, init: { body?: string }) => {
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    const body = JSON.parse(init.body ?? '{}');
    calls.push({ path, body });
    const { body: reply, status = 200 } = answer(path, body);
    return { status, json: async () => reply };
  });
  return { calls, paths: () => calls.map(c => c.path), to: (p: string) => calls.filter(c => c.path === p) };
}

const place = (user_id: number, role_id: number, jersey_number = 9999) => ({
  user_id,
  name: `U${user_id}`,
  email: `${user_id}@example.com`,
  role_id,
  jersey_number,
});
const rawTeam = (extra: Record<string, unknown> = {}) => ({
  id: 11,
  name: 'U14',
  organization_id: 200,
  stat_enable: 1,
  logo_url: 'https://logo.example/u14.png',
  abbr: 'U14',
  players_list: [place(1, 1), place(21, 2, 7), place(22, 5)],
  ...extra,
});
const fresh = (extra: Record<string, unknown> = {}): FreshTeam => {
  const raw = rawTeam(extra) as any;
  return { team: mapTeam(raw, 200), name: raw.name, statEnable: raw.stat_enable, logoUrl: raw.logo_url ?? '', abbr: raw.abbr ?? '' };
};
const defaults = (): HomeAway => ({ home: newTeamDefaults(1, 6), away: newTeamDefaults(2, 6) });

const BY_IDS = '/api/team/list/listTeamByTeamIds';
const UPDATE = '/api/team/update';
const CREATE = '/api/team/create';
const SAVE_DEFAULTS = '/api/team/saveDefaultSettings';

describe('the name field', () => {
  test('a typed forbidden character is refused; "-" and spaces are allowed', () => {
    expect(acceptNameInput('U14', 'U14 B')).toBe('U14 B');
    expect(acceptNameInput('U14', 'U14-')).toBe('U14-');
    for (const c of ['_', '.', '@', '"', '/', '#', '\n']) {
      expect(acceptNameInput('U14', `U14${c}`)).toBe('U14');
    }
    expect(acceptNameInput('U14', 'U1x.4')).toBe('U14'); // a paste with a forbidden character
  });

  test('characters already in the name stay (a name the server saved with "_")', () => {
    expect(acceptNameInput('New6 _ Basketball', 'New6 _ Basketbal')).toBe('New6 _ Basketbal');
    expect(acceptNameInput('New6 _ Basketball', 'New6 _ Basketball!')).toBe('New6 _ Basketball');
    expect(acceptNameInput('New6 _ Basketball', 'New7 _ Basketball')).toBe('New7 _ Basketball');
    expect(acceptNameInput('a_b', 'a_xb')).toBe('a_xb');
  });

  test('a name is needed; spaces around it are dropped', () => {
    expect(teamNameCheck('   ')).toEqual({ ok: false, error: 'Enter a valid team name.' });
    expect(teamNameCheck(' U14 ')).toEqual({ ok: true, value: 'U14' });
  });

  test('the abbreviation is up to 3 capitals', () => {
    expect(abbrInput('abcd')).toBe('ABC');
    expect(abbrInput('u1')).toBe('U1');
  });
});

describe('game defaults', () => {
  const read = { ...newTeamDefaults(1, 7), facilitycamRoomId: 4, facilitycamDuration: 3600, facilitycamUniqueIds: 'a,b', isLiveBroadcasting: 2 };

  test('switching to Scout clears what a Scout game doesn’t have (as iOS does)', () => {
    expect(setDefault(read, 'gameType', 2)).toEqual({
      ...read,
      gameType: 2,
      isLiveBroadcasting: 0,
      publicSnipping: 0,
      postToWebsite: 0,
      statreportVisibility: 0,
      balltracking: 0,
      facilitycamRoomId: 0,
      facilitycamDuration: 0,
      facilitycamUniqueIds: '',
    });
  });

  test('any other change keeps everything else as read, facility camera included', () => {
    expect(setDefault(read, 'gameType', 0)).toEqual({ ...read, gameType: 0 });
    expect(setDefault(read, 'publicSnipping', 0)).toEqual({ ...read, publicSnipping: 0 });
    const scout = { ...read, gameType: 2 };
    expect(setDefault(scout, 'gameType', 2)).toEqual(scout); // already Scout: nothing cleared
  });

  test('ball tracking: on is the centre view, the view picks 1 or 2, off clears both', () => {
    const on = setDefault(read, 'tracking', 1);
    expect(on.balltracking).toBe(1);
    expect(setDefault(on, 'view', 2).balltracking).toBe(2);
    expect(setDefault({ ...read, balltracking: 2 }, 'tracking', 1).balltracking).toBe(2);
    expect(setDefault({ ...read, balltracking: 2 }, 'tracking', 0).balltracking).toBe(0);
    expect(setDefault(read, 'view', 2).balltracking).toBe(0); // no view while tracking is off
    expect(defaultValue({ ...read, balltracking: 2 }, 'tracking')).toBe(1);
  });

  test('Scout shows only the game mode; the view shows only while tracking is on', () => {
    expect(shownDefaults({ ...read, gameType: 2 })).toEqual(['gameType']);
    expect(shownDefaults(read)).not.toContain('view');
    expect(shownDefaults({ ...read, balltracking: 1 })).toContain('view');
  });

  test('the sport is set on both rows, and any difference counts as a change', () => {
    const d = defaults();
    expect(defaultsChanged(d, defaults())).toBe(false);
    const sport = withCategory(d, 3);
    expect([sport.home.category, sport.away.category]).toEqual([3, 3]);
    expect(defaultsChanged(d, sport)).toBe(true);
    expect(defaultsChanged(d, { ...d, away: setDefault(d.away, 'postToWebsite', 0) })).toBe(true);
  });

  test('a saved row maps as iOS maps TeamSettings', () => {
    expect(
      mapDefaults({
        id: 4780,
        team_id: 6703,
        game_type: 1,
        category: 7,
        isLiveBroadcasting: 0,
        public: 1,
        post_to_website: 0,
        statreport_visibility: 1,
        balltracking: 0,
        type: 2,
        facilitycam_unique_ids: '',
        facilitycam_duration: 0,
        facilitycam_room_id: 0,
        categoryName: 'Football',
      }),
    ).toEqual({ ...newTeamDefaults(2, 7), postToWebsite: 0 });
  });

  test('a team missing a home or away row is an error, never made up', async () => {
    mockFetch(() => ok({ default_settings: [{ type: 1, game_type: 1 }] }));
    await expect(fetchTeamDefaults(11)).rejects.toThrow("couldn't be read");
  });

  test('the sports list comes from "categories"', async () => {
    mockFetch(() => ok({ categories: [{ id: 3, category_name: 'Basketball' }], paging: { next: -1 } }));
    await expect(fetchCategories()).resolves.toEqual([{ id: 3, name: 'Basketball' }]);
  });
});

describe('request bodies, as iOS sends them', () => {
  test('create: members, fields and both defaults (no facility fields, the home sport on both)', () => {
    const d = { home: newTeamDefaults(1, 3), away: { ...newTeamDefaults(2, 9), gameType: 0 } };
    expect(
      createTeamBody({
        userId: 1,
        orgId: 200,
        name: 'U14',
        abbr: 'U',
        statEnable: 1,
        members: [{ userId: 21, roleId: 2, jerseyNumber: 9999 }, { userId: 22, roleId: 5, jerseyNumber: 9999 }],
        defaults: d,
      }),
    ).toEqual({
      name: 'U14',
      enc_created_by: 'enc(1)',
      enc_organization_id: 'enc(200)',
      playersList: '21,22',
      playersRole: '2,5',
      playerJerseyNumbers: '9999,9999',
      stat_enable: 1,
      logo_url: '',
      abbr: 'U',
      default_settings: [
        { game_type: 1, category: 3, isLiveBroadcasting: 0, public: 1, post_to_website: 1, statreport_visibility: 1, balltracking: 0, type: 1 },
        { game_type: 0, category: 3, isLiveBroadcasting: 0, public: 1, post_to_website: 1, statreport_visibility: 1, balltracking: 0, type: 2 },
      ],
    });
  });

  test('saving defaults sends the facility-camera fields as they are', () => {
    const d = defaults();
    d.home = { ...d.home, facilitycamRoomId: 4, facilitycamDuration: 3600, facilitycamUniqueIds: 'a' };
    const body = saveDefaultsBody(11, d);
    expect(body.enc_team_id).toBe('enc(11)');
    expect(body.default_settings[0]).toEqual(
      expect.objectContaining({ type: 1, facilitycam_room_id: 4, facilitycam_duration: 3600, facilitycam_unique_ids: 'a' }),
    );
    expect(body.default_settings[1]).toEqual(expect.objectContaining({ type: 2, facilitycam_room_id: 0 }));
  });

  test('update: the removed people in deletedPlayers, and the team’s logo as read', () => {
    const f = fresh();
    expect(
      teamUpdateBody(f, { name: 'U14', abbr: 'U', statEnable: 0 }, [{ userId: 1, roleId: 1, jerseyNumber: 9999 }], [21, 22]),
    ).toEqual({
      enc_id: 'enc(11)',
      name: 'U14',
      playersList: '1',
      playersRole: '1',
      playerJerseyNumbers: '9999',
      deletedPlayers: '21,22',
      stat_enable: 0,
      logo_url: 'https://logo.example/u14.png',
      abbr: 'U',
    });
  });
});

describe('the update safety check', () => {
  test('only the people chosen for removal may leave; anyone else missing stops the save', async () => {
    const api = mockFetch(() => ok({ team: [rawTeam()] }));
    const fields = { name: 'U14', abbr: 'U14', statEnable: 1 };
    const without22 = [
      { userId: 1, roleId: 1, jerseyNumber: 9999 },
      { userId: 21, roleId: 2, jerseyNumber: 7 },
    ];
    await expect(sendTeamUpdate(fresh(), fields, without22, [])).rejects.toThrow('would have removed 1 member');
    expect(api.calls).toHaveLength(0);
    await expect(sendTeamUpdate(fresh(), fields, without22, [22])).resolves.toBeDefined();
    expect(api.calls).toHaveLength(1);
  });
});

describe('members', () => {
  test('someone added joins with their organisation role and no jersey (Player if unknown)', () => {
    const roles = new Map([[30, 7]]);
    expect(addedEntry(30, roles)).toEqual({ userId: 30, roleId: 7, jerseyNumber: 9999 });
    expect(addedEntry(31, roles)).toEqual({ userId: 31, roleId: 2, jerseyNumber: 9999 });
  });

  test('the roster sent: the team as read now, minus the removed, plus the added', () => {
    expect(editorEntries(fresh(), [{ userId: 30, roleId: 7, jerseyNumber: 9999 }, { userId: 21, roleId: 2, jerseyNumber: 9999 }], [22])).toEqual([
      { userId: 1, roleId: 1, jerseyNumber: 9999 },
      { userId: 21, roleId: 2, jerseyNumber: 7 }, // kept as read; not added twice
      { userId: 30, roleId: 7, jerseyNumber: 9999 },
    ]);
  });

  test('panes: the organisation’s people not on the team, and the team once each, by name, searchable', () => {
    const people = [
      { id: 1, name: 'zed', email: 'z@x.com', username: '', uniqueId: 0, avatar: '', rawJson: '' },
      { id: 2, name: 'Amy', email: 'amy@x.com', username: '', uniqueId: 0, avatar: '', rawJson: '' },
      { id: 3, name: '', email: 'nobody@x.com', username: '', uniqueId: 0, avatar: '', rawJson: '' },
    ];
    expect(orgPane(people, new Set([1]), '').map(r => r.name)).toEqual(['Amy', 'nobody@x.com']);
    expect(orgPane(people, new Set(), 'X.COM').length).toBe(3);
    const rows = [
      { userId: 5, name: 'Bo', email: '' },
      { userId: 4, name: 'al', email: '' },
      { userId: 5, name: 'Bo', email: '' },
    ];
    expect(teamPane(rows, '').map(r => r.userId)).toEqual([4, 5]);
    expect(teamPane(rows, 'b').map(r => r.userId)).toEqual([5]);
  });
});

describe('creating a team', () => {
  const input = {
    userId: 1,
    orgId: 200,
    name: ' U18 ',
    abbr: 'u',
    statEnable: 1,
    members: [{ userId: 21, roleId: 2, jerseyNumber: 9999 }],
    defaults: defaults(),
  };
  const created = { team: { id: 77, name: 'U18', organization_id: 200, players_list: [place(21, 2)] } };

  test('creates, stores the team, then saves its defaults again, as iOS does', async () => {
    const api = mockFetch(path => (path === CREATE ? ok(created) : ok({ default_settings: [] })));
    const result = await createTeamFlow(input);
    expect(api.paths()).toEqual([CREATE, SAVE_DEFAULTS]);
    expect(api.to(CREATE)[0].body).toEqual(expect.objectContaining({ name: 'U18', abbr: 'U' }));
    expect(api.to(SAVE_DEFAULTS)[0].body.enc_team_id).toBe('enc(77)');
    expect(result).toEqual({ team: expect.objectContaining({ id: 77 }), renamed: false, defaultsError: null });
    expect(readTeams(200).map(t => t.id)).toEqual([77]);
    expect(readTeamMembers(77).map(m => m.userId)).toEqual([21]);
  });

  test('a name with "-" or no name is refused before anything is sent', async () => {
    const api = mockFetch(() => ok({}));
    await expect(createTeamFlow({ ...input, name: 'U18 - Blue' })).rejects.toThrow('"-" becomes "_"');
    await expect(createTeamFlow({ ...input, name: ' ' })).rejects.toThrow('Enter a valid team name.');
    expect(api.calls).toHaveLength(0);
  });

  test('defaults that fail after the team was created are a partial save; a changed name is reported', async () => {
    mockFetch(path =>
      path === CREATE ? ok({ team: { ...created.team, name: 'U18 changed' } }) : refuse('Defaults refused'),
    );
    await expect(createTeamFlow(input)).resolves.toEqual({
      team: expect.objectContaining({ id: 77, name: 'U18 changed' }),
      renamed: true,
      defaultsError: 'Defaults refused',
    });
  });
});

describe('editing a team', () => {
  const base = (extra: Partial<EditInput> = {}): EditInput => ({
    userId: 1,
    teamId: 11,
    opened: { name: 'U14', abbr: 'U14', statEnable: 1 },
    fields: { name: 'U14', abbr: 'U14', statEnable: 1 },
    added: [],
    removed: [],
    defaults: { opened: defaults(), now: defaults() },
    ...extra,
  });
  const server = (team: Record<string, unknown> = {}, update?: (body: any) => unknown) =>
    mockFetch((path, body) => {
      if (path === BY_IDS) {
        return ok({ team: [rawTeam(team)] });
      }
      if (path === UPDATE) {
        return ok(update ? update(body) : { team: [rawTeam({ ...team, name: body.name, abbr: body.abbr })] });
      }
      return ok({ default_settings: [] });
    });

  test('nothing changed: nothing is sent', async () => {
    const api = server();
    await expect(editTeamFlow(base())).resolves.toBeNull();
    expect(api.calls).toHaveLength(0);
  });

  test('only the defaults changed: only they are saved, even for a team whose name has "-"', async () => {
    const api = server({ name: 'U14 - Blue' });
    const now = withCategory(defaults(), 3);
    const result = await editTeamFlow(base({ opened: { name: 'U14 - Blue', abbr: 'U14', statEnable: 1 }, fields: { name: 'U14 - Blue', abbr: 'U14', statEnable: 1 }, defaults: { opened: defaults(), now } }));
    expect(api.paths()).toEqual([SAVE_DEFAULTS]);
    expect(api.to(SAVE_DEFAULTS)[0].body.default_settings.map((r: any) => r.category)).toEqual([3, 3]);
    expect(result).toEqual({ team: null, renamed: false, defaultsError: null });
  });

  test('a team change on a team whose name has "-" is refused before any write, defaults included', async () => {
    const api = server({ name: 'U14 - Blue' });
    const opened = { name: 'U14 - Blue', abbr: 'U14', statEnable: 1 };
    await expect(
      editTeamFlow(base({ opened, fields: { ...opened, abbr: 'UB' }, defaults: { opened: defaults(), now: withCategory(defaults(), 3) } })),
    ).rejects.toThrow('has a "-"');
    expect(api.paths()).toEqual([BY_IDS]); // read only
  });

  test('renaming to a name with "-" is refused; renaming without one is sent', async () => {
    const api = server();
    await expect(editTeamFlow(base({ fields: { name: 'U14 - Red', abbr: 'U14', statEnable: 1 } }))).rejects.toThrow('"-" becomes "_"');
    expect(api.to(UPDATE)).toHaveLength(0);
    await editTeamFlow(base({ fields: { name: 'U14 Red', abbr: 'U14', statEnable: 1 } }));
    expect(api.to(UPDATE)[0].body).toEqual(expect.objectContaining({ name: 'U14 Red', logo_url: 'https://logo.example/u14.png' }));
  });

  test('fields the user didn’t change are sent as the server has them now', async () => {
    const api = server({ name: 'U14 renamed elsewhere', abbr: 'XX', stat_enable: 0 });
    await editTeamFlow(base({ added: [{ userId: 30, roleId: 5, jerseyNumber: 9999 }] }));
    expect(api.to(UPDATE)[0].body).toEqual(
      expect.objectContaining({ name: 'U14 renamed elsewhere', abbr: 'XX', stat_enable: 0 }),
    );
  });

  test('members: removed ones leave (and are listed in deletedPlayers), added ones join, others are kept as read', async () => {
    const api = server({ players_list: [place(1, 1), place(21, 2, 7), place(22, 5), place(23, 7, 12)] });
    await editTeamFlow(base({ added: [{ userId: 30, roleId: 2, jerseyNumber: 9999 }], removed: [22] }));
    expect(api.to(UPDATE)[0].body).toEqual(
      expect.objectContaining({
        playersList: '1,21,23,30',
        playersRole: '1,2,7,2',
        playerJerseyNumbers: '9999,7,12,9999',
        deletedPlayers: '22',
      }),
    );
  });

  test('a team the server lists someone twice on is refused', async () => {
    const api = server({ players_list: [place(1, 1), place(1, 1), place(21, 2)] });
    await expect(editTeamFlow(base({ fields: { name: 'U14', abbr: 'UB', statEnable: 1 } }))).rejects.toThrow('someone twice');
    expect(api.to(UPDATE)).toHaveLength(0);
  });

  test('the server saving a different name is reported', async () => {
    server({}, body => ({ team: [rawTeam({ name: `${body.name}!` })] }));
    const result = await editTeamFlow(base({ fields: { name: 'U14', abbr: 'UB', statEnable: 1 } }));
    expect(result).toEqual(expect.objectContaining({ renamed: true }));
  });

  test('defaults failing after the team was saved are a partial save; on their own they are an error', async () => {
    mockFetch((path, body) =>
      path === BY_IDS ? ok({ team: [rawTeam()] }) : path === UPDATE ? ok({ team: [rawTeam({ abbr: body.abbr })] }) : refuse('No defaults'),
    );
    const now = withCategory(defaults(), 3);
    await expect(
      editTeamFlow(base({ fields: { name: 'U14', abbr: 'UB', statEnable: 1 }, defaults: { opened: defaults(), now } })),
    ).resolves.toEqual(expect.objectContaining({ defaultsError: 'No defaults' }));
    await expect(editTeamFlow(base({ defaults: { opened: defaults(), now } }))).rejects.toThrow('No defaults');
  });

  test('defaults that couldn’t be read are never sent', async () => {
    const api = server();
    await editTeamFlow(base({ fields: { name: 'U14', abbr: 'UB', statEnable: 1 }, defaults: null }));
    expect(api.paths()).toEqual([BY_IDS, UPDATE]);
  });
});
