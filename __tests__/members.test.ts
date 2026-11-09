// RSA is replaced by a readable marker so the request bodies can be checked.
jest.mock('../src/utils/rsa', () => ({ rsaEncrypt: (v: unknown) => `enc(${v})` }));

import {
  addMemberBody,
  assertNobodyDropped,
  fetchTeamFresh,
  memberProfileBody,
  removeMemberBody,
  rosterUpdateBody,
  rosterWith,
  searchPeople,
  sendRoster,
  type FreshTeam,
} from '../src/api/members';
import { mapTeam } from '../src/api/teams';
import { UserRole } from '../src/api/types';
import { fetchOrgRoles, mapPerson } from '../src/api/users';
import {
  readOrgRoles,
  readOrgUsers,
  readTeamMembers,
  replaceOrgRoles,
  replaceOrgUsers,
  replaceTeams,
} from '../src/db/repositories';
import {
  PartialSaveError,
  addMemberFlow,
  addToTeamFlow,
  removeMemberFlow,
  saveMemberEdit,
} from '../src/teams/memberActions';
import {
  addRoleOptions,
  defaultAddRole,
  editRoleOptions,
  isValidEmail,
  jerseyTaken,
  jerseyText,
  parseJersey,
  parseName,
  splitName,
} from '../src/teams/memberRules';

// ---- A small fake server ---------------------------------------------------

type Call = { path: string; body: any };
type Handler = (body: any) => { status?: number; body: unknown } | Promise<{ status?: number; body: unknown }>;

const ok = (data: unknown) => ({ body: { status: true, message: '', data } });
const fail = (message: string) => ({ body: { status: false, message } });

function server(routes: Record<string, Handler>) {
  const calls: Call[] = [];
  (global as any).fetch = jest.fn(async (url: string, init: { body: string }) => {
    const path = Object.keys(routes).find(p => url.endsWith(p));
    const body = JSON.parse(init.body);
    calls.push({ path: path ?? url, body });
    const reply = path ? await routes[path](body) : { status: 404, body: { status: false, message: 'not mocked' } };
    return { status: reply.status ?? 200, json: async () => reply.body };
  });
  return {
    calls,
    to: (path: string) => calls.filter(c => c.path === path),
    writes: () => calls.filter(c => !['/api/team/list/listTeamByTeamIds', '/api/searchUser'].includes(c.path)),
  };
}

// Team 11 "U14" in org 200: a coach, a player (#7), a follower and a manager (#12).
const place = (user_id: number, role_id: number, jersey_number: number = 9999) => ({
  user_id,
  name: `User ${user_id}`,
  email: `${user_id}@example.com`,
  role_id,
  jersey_number,
});
const rawTeam = (players = [place(1, 1), place(21, 2, 7), place(22, 5), place(23, 7, 12)]) => ({
  id: 11,
  name: 'U14',
  organization_id: 200,
  stat_enable: 1,
  logo_url: null,
  abbr: 'U',
  players_list: players,
});
/** listTeamByTeamIds answers with other teams too; the asked-for one is among them. */
const teamsByIds = (team = rawTeam()) => ok({ team: [{ id: 99, name: 'Other', players_list: [] }, team] });

const fresh = (players?: ReturnType<typeof place>[]): FreshTeam => ({
  team: mapTeam(rawTeam(players), 200),
  name: 'U14',
  statEnable: 1,
  logoUrl: '',
  abbr: 'U',
});

const BY_IDS = '/api/team/list/listTeamByTeamIds';
const UPDATE_TEAM = '/api/team/update';
const UPDATE_USER = '/api/updateUser';
const ADD_USER = '/api/addUser';
const REMOVE_USER = '/api/removeUserFromOrganization';

beforeEach(() => {
  replaceTeams(200, [mapTeam(rawTeam(), 200)]);
});

// ---- Requests ----------------------------------------------------------------

describe('reading one team fresh (getMyTeamsByIds)', () => {
  test('sends the ids encrypted and picks the team out of the reply by id', async () => {
    const s = server({ [BY_IDS]: () => teamsByIds() });
    const team = await fetchTeamFresh(7, 11);
    expect(s.calls[0].body).toEqual({ enc_teamIds: 'enc(11)', enc_userId: 'enc(7)' });
    expect(team).toEqual(expect.objectContaining({ name: 'U14', statEnable: 1, logoUrl: '', abbr: 'U' }));
    expect(team.team.members.map(m => m.userId)).toEqual([1, 21, 22, 23]);
  });

  test('a reply without the team is an error, never an empty roster', async () => {
    server({ [BY_IDS]: () => ok({ team: [{ id: 99, players_list: [] }] }) });
    await expect(fetchTeamFresh(7, 11)).rejects.toThrow("Couldn't load this team");
  });
});

describe('sending a roster (/api/team/update)', () => {
  test('everyone else keeps their team role and jersey; the member is changed or added', () => {
    expect(rosterWith(fresh(), { userId: 22, roleId: 7, jerseyNumber: 5 })).toEqual([
      { userId: 1, roleId: 1, jerseyNumber: 9999 },
      { userId: 21, roleId: 2, jerseyNumber: 7 },
      { userId: 22, roleId: 7, jerseyNumber: 5 },
      { userId: 23, roleId: 7, jerseyNumber: 12 },
    ]);
    expect(rosterWith(fresh(), { userId: 30, roleId: 2, jerseyNumber: 9999 }).map(e => e.userId)).toEqual([
      1, 21, 22, 23, 30,
    ]);
  });

  test('the body is iOS’s: comma lists in one order, and the team’s own settings as read', () => {
    const entries = rosterWith(fresh(), { userId: 21, roleId: 2, jerseyNumber: 8 });
    expect(rosterUpdateBody(fresh(), entries)).toEqual({
      enc_id: 'enc(11)',
      name: 'U14',
      playersList: '1,21,22,23',
      playersRole: '1,2,5,7',
      playerJerseyNumbers: '9999,8,9999,12',
      deletedPlayers: '',
      stat_enable: 1,
      logo_url: '',
      abbr: 'U',
    });
  });

  test('a list that would drop someone, or has someone twice, is refused', () => {
    const f = fresh();
    const entries = rosterWith(f, { userId: 21, roleId: 2, jerseyNumber: 8 });
    expect(() => assertNobodyDropped(f, entries.filter(e => e.userId !== 22))).toThrow(
      'would have removed 1 member',
    );
    expect(() => assertNobodyDropped(f, [...entries, entries[0]])).toThrow('someone twice');
    expect(() => assertNobodyDropped(f, entries)).not.toThrow();
  });

  test('a refused list is never sent', async () => {
    const s = server({ [UPDATE_TEAM]: () => ok({ team: [rawTeam()] }) });
    const f = fresh();
    await expect(sendRoster(f, [{ userId: 1, roleId: 1, jerseyNumber: 9999 }])).rejects.toThrow('would have removed');
    expect(s.calls).toHaveLength(0);
  });

  test('the reply is the team as the server now has it', async () => {
    server({ [UPDATE_TEAM]: () => ok({ team: [rawTeam([place(1, 1), place(21, 2, 8), place(22, 5), place(23, 7, 12)])] }) });
    const f = fresh();
    const team = await sendRoster(f, rosterWith(f, { userId: 21, roleId: 2, jerseyNumber: 8 }));
    expect(team.members.find(m => m.userId === 21)?.jerseyNumber).toBe(8);
  });
});

test('the other request bodies match iOS', () => {
  expect(memberProfileBody({ memberId: 21, orgId: 200, name: 'Pat Player', roleId: 2, teamId: 11 })).toEqual({
    name: 'Pat Player',
    enc_id: 'enc(21)',
    newrole: 2,
    teamList: '11',
    enc_organization_id: 'enc(200)',
  });
  expect(memberProfileBody({ memberId: 21, orgId: 200, name: 'P', roleId: 2, teamId: 0 }).teamList).toBe('');
  // team_id is a plain number: the team, or 0 for the organisation.
  expect(removeMemberBody({ memberId: 21, orgId: 200, teamId: 11 })).toEqual({
    enc_user_id: 'enc(21)',
    team_id: 11,
    enc_organization_id: 'enc(200)',
  });
  expect(
    addMemberBody({ email: 'a@b.co', name: 'Ann', roleId: 5, teamId: 11, createdBy: 7, orgId: 200, message: 'Hi' }),
  ).toEqual({
    email: 'a@b.co',
    name: 'Ann',
    avatar: '',
    teamList: '11',
    enc_createdby: 'enc(7)',
    enc_organization_id: 'enc(200)',
    roleId: 5,
    customMsg: 'Hi',
  });
});

test('searching everyone on Snipback reads data.players', async () => {
  const s = server({ '/api/searchUser': () => ok({ players: [{ id: 5, name: 'Ann', email: 'a@b.co' }, { id: 0 }] }) });
  expect((await searchPeople('ann')).map(p => p.name)).toEqual(['Ann']);
  expect(s.calls[0].body).toEqual({ search: 'ann' });
});

// ---- Editing -----------------------------------------------------------------

describe('saving the member editor', () => {
  const edit = {
    viewerId: 7,
    orgId: 200,
    teamId: 11,
    memberId: 21,
    oldName: 'User 21',
    name: 'User 21',
    oldRoleId: 2,
    roleId: 2,
    jerseyNumber: 7,
  };

  test('only the jersey changed: no profile call; the full roster goes back with the new number', async () => {
    const s = server({
      [BY_IDS]: () => teamsByIds(),
      [UPDATE_TEAM]: body => ok({ team: [rawTeam([place(1, 1), place(21, 2, 8), place(22, 5), place(23, 7, 12)])], echo: body }),
    });
    await saveMemberEdit({ ...edit, jerseyNumber: 8 });

    expect(s.to(UPDATE_USER)).toHaveLength(0);
    const sent = s.to(UPDATE_TEAM)[0].body;
    expect(sent.playersList).toBe('1,21,22,23');
    expect(sent.playersRole).toBe('1,2,5,7');
    expect(sent.playerJerseyNumbers).toBe('9999,8,9999,12');
    expect(sent.stat_enable).toBe(1);
    expect(readTeamMembers(11).find(m => m.userId === 21)?.jerseyNumber).toBe(8);
  });

  test('a role change saves the organisation role, then the same role on the team (read fresh again)', async () => {
    const s = server({
      [BY_IDS]: () => teamsByIds(),
      [UPDATE_USER]: () => ok({ user: { id: 21 } }),
      [UPDATE_TEAM]: () => ok({ team: [rawTeam()] }),
    });
    await saveMemberEdit({ ...edit, roleId: UserRole.Coach });

    expect(s.to(UPDATE_USER)[0].body).toEqual(expect.objectContaining({ newrole: 1, teamList: '11' }));
    expect(s.to(BY_IDS)).toHaveLength(2);
    expect(s.to(UPDATE_TEAM)[0].body.playersRole).toBe('1,1,5,7');
    // Order: check, profile, read again, team.
    expect(s.writes().map(c => c.path)).toEqual([UPDATE_USER, UPDATE_TEAM]);
  });

  test('nothing changed: nothing is written', async () => {
    const s = server({ [BY_IDS]: () => teamsByIds() });
    await saveMemberEdit(edit);
    expect(s.writes()).toHaveLength(0);
  });

  test('an untouched jersey field keeps the server’s number, even a 0', async () => {
    const s = server({
      [BY_IDS]: () => teamsByIds(rawTeam([place(1, 1), place(21, 2, 0), place(22, 5)])),
      [UPDATE_USER]: () => ok({}),
      [UPDATE_TEAM]: () => ok({ team: [rawTeam()] }),
    });
    await saveMemberEdit({ ...edit, jerseyNumber: null });
    expect(s.writes()).toHaveLength(0);

    await saveMemberEdit({ ...edit, jerseyNumber: null, roleId: UserRole.Manager });
    expect(s.to(UPDATE_TEAM)[0].body.playerJerseyNumbers).toBe('9999,0,9999');
  });

  test('someone no longer on the team, or a taken number, stops before any write', async () => {
    let s = server({ [BY_IDS]: () => teamsByIds(rawTeam([place(1, 1)])) });
    await expect(saveMemberEdit({ ...edit, jerseyNumber: 8 })).rejects.toThrow('no longer on this team');
    expect(s.writes()).toHaveLength(0);

    s = server({ [BY_IDS]: () => teamsByIds() });
    await expect(saveMemberEdit({ ...edit, jerseyNumber: 12, name: 'New' })).rejects.toThrow('# number already exists');
    expect(s.writes()).toHaveLength(0);
  });

  test('All Teams: only the name and organisation role are saved', async () => {
    const s = server({ [UPDATE_USER]: () => ok({}) });
    await saveMemberEdit({ ...edit, teamId: 0, name: 'Pat' });
    expect(s.calls.map(c => c.path)).toEqual([UPDATE_USER]);
    expect(s.calls[0].body.teamList).toBe('');
  });

  test('a team failure after the profile was saved says so', async () => {
    server({
      [BY_IDS]: () => teamsByIds(),
      [UPDATE_USER]: () => ok({}),
      [UPDATE_TEAM]: () => fail('Server busy'),
    });
    const error = await saveMemberEdit({ ...edit, roleId: UserRole.Manager }).catch(e => e);
    expect(error).toBeInstanceOf(PartialSaveError);
    expect(error.message).toBe("The name and role were saved, but the team couldn't be updated: Server busy");
  });
});

// ---- Adding ------------------------------------------------------------------

describe('adding a member', () => {
  const add = {
    viewerId: 7,
    orgId: 200,
    teamId: 11,
    email: ' new@example.com ',
    name: 'New Person',
    roleId: UserRole.Follower,
    jerseyNumber: 9999,
    message: '',
  };

  test('already put on the team by addUser with the same role and no number: no roster update', async () => {
    const s = server({
      [ADD_USER]: () => ok({ user: { id: 30, name: 'New Person', email: 'new@example.com' } }),
      [BY_IDS]: () => teamsByIds(rawTeam([place(1, 1), place(21, 2, 7), place(22, 5), place(23, 7, 12), place(30, 5)])),
    });
    await addMemberFlow(add);
    expect(s.to(ADD_USER)[0].body).toEqual(expect.objectContaining({ email: 'new@example.com', teamList: '11', roleId: 5 }));
    expect(s.to(UPDATE_TEAM)).toHaveLength(0);
    expect(readTeamMembers(11).map(m => m.userId)).toContain(30);
  });

  test('not on the team yet: the full roster goes back with them added', async () => {
    const s = server({
      [ADD_USER]: () => ok({ user: { id: 30, name: 'New Person' } }),
      [BY_IDS]: () => teamsByIds(),
      [UPDATE_TEAM]: () => ok({ team: [rawTeam()] }),
    });
    await addMemberFlow({ ...add, jerseyNumber: 33 });
    const sent = s.to(UPDATE_TEAM)[0].body;
    expect(sent.playersList).toBe('1,21,22,23,30');
    expect(sent.playersRole).toBe('1,2,5,7,5');
    expect(sent.playerJerseyNumbers).toBe('9999,7,9999,12,33');
  });

  test('a taken number stops before anyone is added or invited', async () => {
    const s = server({ [BY_IDS]: () => teamsByIds() });
    await expect(addMemberFlow({ ...add, jerseyNumber: 7 })).rejects.toThrow('# number already exists');
    expect(s.to(ADD_USER)).toHaveLength(0);
  });

  test('a team failure after the add says they were added to the organisation', async () => {
    server({
      [ADD_USER]: () => ok({ user: { id: 30, name: 'New Person' } }),
      [BY_IDS]: () => teamsByIds(),
      [UPDATE_TEAM]: () => fail('Server busy'),
    });
    const error = await addMemberFlow(add).catch(e => e);
    expect(error).toBeInstanceOf(PartialSaveError);
    expect(error.message).toBe(
      "New Person was added to the organisation, but the team couldn't be updated: Server busy",
    );
  });

  test('without a team only addUser is called', async () => {
    const s = server({ [ADD_USER]: () => ok({ user: { id: 30 } }) });
    await addMemberFlow({ ...add, teamId: 0 });
    expect(s.calls.map(c => c.path)).toEqual([ADD_USER]);
    expect(s.calls[0].body.teamList).toBe('');
  });
});

describe('adding someone already in the organisation to a team', () => {
  const input = { viewerId: 7, teamId: 11, memberId: 30, name: 'Org Coach', roleId: UserRole.Follower, jerseyNumber: 9999 };

  test('only the roster is written (no addUser, so their organisation role is untouched)', async () => {
    const s = server({ [BY_IDS]: () => teamsByIds(), [UPDATE_TEAM]: () => ok({ team: [rawTeam()] }) });
    await addToTeamFlow(input);
    expect(s.writes().map(c => c.path)).toEqual([UPDATE_TEAM]);
    expect(s.to(UPDATE_TEAM)[0].body.playersList).toBe('1,21,22,23,30');
    expect(s.to(UPDATE_TEAM)[0].body.playersRole).toBe('1,2,5,7,5');
  });

  test('already on the team, or a taken number: nothing is written', async () => {
    let s = server({ [BY_IDS]: () => teamsByIds() });
    await expect(addToTeamFlow({ ...input, memberId: 21, name: 'User 21' })).rejects.toThrow('already on this team');
    await expect(addToTeamFlow({ ...input, jerseyNumber: 12 })).rejects.toThrow('# number already exists');
    expect(s.writes()).toHaveLength(0);
  });
});

// ---- Removing ----------------------------------------------------------------

describe('removing a member', () => {
  test('from a team: only that team place goes from the cache', async () => {
    replaceTeams(200, [mapTeam(rawTeam(), 200), mapTeam({ id: 12, organization_id: 200, players_list: [place(21, 2)] }, 200)]);
    const s = server({ [REMOVE_USER]: () => ok({}) });
    await removeMemberFlow({ orgId: 200, teamId: 11, memberId: 21 });
    expect(s.calls[0].body).toEqual({ enc_user_id: 'enc(21)', team_id: 11, enc_organization_id: 'enc(200)' });
    expect(readTeamMembers(11).map(m => m.userId)).toEqual([1, 22, 23]);
    expect(readTeamMembers(12).map(m => m.userId)).toEqual([21]);
  });

  test('from the organisation: their team places, user link and role go', async () => {
    replaceOrgUsers(200, [mapPerson({ id: 21, name: 'P' }), mapPerson({ id: 22, name: 'F' })]);
    replaceOrgRoles(200, [{ userId: 21, roleId: 2 }, { userId: 22, roleId: 5 }]);
    server({ [REMOVE_USER]: () => ok({}) });
    await removeMemberFlow({ orgId: 200, teamId: 0, memberId: 21 });
    expect(readTeamMembers(11).map(m => m.userId)).toEqual([1, 22, 23]);
    expect(readOrgUsers(200).map(p => p.id)).toEqual([22]);
    expect([...readOrgRoles(200).keys()]).toEqual([22]);
  });

  test('a refusal leaves the cache alone', async () => {
    server({ [REMOVE_USER]: () => fail('Not allowed') });
    await expect(removeMemberFlow({ orgId: 200, teamId: 11, memberId: 21 })).rejects.toThrow('Not allowed');
    expect(readTeamMembers(11).map(m => m.userId)).toContain(21);
  });
});

// ---- Organisation roles ------------------------------------------------------

test('organisation roles: every page, this organisation’s rows only, replaced per organisation', async () => {
  const s = server({
    '/api/getUsersAssociateOrganizations': body =>
      body.page === 1
        ? ok({ organizations: [{ id: 200, user_id: 21, role_id: 2 }, { id: 999, user_id: 22, role_id: 4 }], paging: { next: 2 } })
        : ok({ organizations: [{ id: 200, user_id: 23, role_id: 7 }], paging: { next: -1 } }),
  });
  const roles = await fetchOrgRoles(7, 200);
  expect(roles).toEqual([
    { userId: 21, roleId: 2 },
    { userId: 23, roleId: 7 },
  ]);
  expect(s.calls[0].body).toEqual({
    count: 400,
    page: 1,
    enc_organization_id: 'enc(200)',
    enc_user_id: 'enc(7)',
    timestamp: 0,
  });

  replaceOrgRoles(200, roles);
  replaceOrgRoles(300, [{ userId: 21, roleId: 1 }]);
  replaceOrgRoles(200, [{ userId: 23, roleId: 7 }]);
  expect([...readOrgRoles(200)]).toEqual([[23, 7]]);
  expect([...readOrgRoles(300)]).toEqual([[21, 1]]);
});

// ---- Form rules --------------------------------------------------------------

describe('form rules', () => {
  test('roles when adding: admins only by an admin', () => {
    expect(addRoleOptions(false)).toEqual([2, 5, 7, 1, 6]);
    expect(addRoleOptions(true)).toEqual([2, 5, 7, 1, 6, 4]);
    expect(defaultAddRole('members')).toBe(UserRole.Player);
    expect(defaultAddRole('followers')).toBe(UserRole.Follower);
  });

  test('roles when editing follow iOS, current role first', () => {
    expect(editRoleOptions(UserRole.Admin, true)).toEqual([4, 1]);
    expect(editRoleOptions(UserRole.Admin, false)).toEqual([4]);
    expect(editRoleOptions(UserRole.Coach, true)).toEqual([1, 4]);
    expect(editRoleOptions(UserRole.Coach, false)).toEqual([1]);
    expect(editRoleOptions(UserRole.Follower, false)).toEqual([5, 2, 7, 6, 1]);
    expect(editRoleOptions(UserRole.Player, true)).toEqual([2, 5, 7, 6, 1, 4]);
  });

  test('names and jersey numbers', () => {
    expect(parseName('  Ann ', ' Lee ')).toEqual({ ok: true, value: 'Ann Lee' });
    expect(parseName('Ann', '  ')).toEqual({ ok: true, value: 'Ann' });
    expect(parseName('  ', 'Lee')).toEqual({ ok: false, error: 'Please enter a name.' });
    expect(splitName(' Ann Marie Lee ')).toEqual({ first: 'Ann', last: 'Marie Lee' });
    expect(splitName('Ann')).toEqual({ first: 'Ann', last: '' });

    expect(parseJersey('')).toEqual({ ok: true, value: 9999 });
    expect(parseJersey(' 07 ')).toEqual({ ok: true, value: 7 });
    expect(parseJersey('1000').ok).toBe(false);
    expect(parseJersey('1a').ok).toBe(false);
    expect([jerseyText(9999), jerseyText(0), jerseyText(23)]).toEqual(['', '', '23']);

    const roster = [
      { userId: 1, jerseyNumber: 7 },
      { userId: 2, jerseyNumber: 9999 },
    ];
    expect(jerseyTaken(roster, 3, 7)).toBe(true);
    expect(jerseyTaken(roster, 1, 7)).toBe(false); // their own number
    expect(jerseyTaken(roster, 3, 9999)).toBe(false);
  });

  test('email', () => {
    expect(isValidEmail(' a@b.co ')).toBe(true);
    expect(['a@b', 'a b@c.co', '@b.co', 'a@b.c'].map(isValidEmail)).toEqual([false, false, false, false]);
  });
});
