/**
 * Step 6: editing, removing and adding members from the tablet hub, against
 * a mocked API (which records every write) and a real in-memory Realm.
 *
 * @format
 */

import React from 'react';
import { Alert } from 'react-native';
import ReactTestRenderer, { type ReactTestRenderer as Renderer } from 'react-test-renderer';
import * as Keychain from 'react-native-keychain';
import App from '../App';
import * as device from '../src/utils/device';

jest.useFakeTimers();

const USER = { id: 1, name: 'Test Coach', email: 'coach@example.com', token: 'abc' };
const ORGS = [
  { id: 100, name: 'Coach Home', user_id: 1, role_id: 3, organization_type: 2 },
  { id: 200, name: 'Alpha FC', user_id: 1, role_id: 1, organization_type: 1 },
];
const place = (user_id: number, name: string, role_id: number, jersey_number = 9999) => ({
  user_id,
  name,
  email: `${user_id}@example.com`,
  role_id,
  jersey_number,
});
const U14 = () => ({
  id: 11,
  name: 'U14',
  organization_id: 200,
  stat_enable: 1,
  logo_url: null,
  abbr: 'U',
  players_list: [place(1, 'Test Coach', 1), place(21, 'Pat Player', 2, 7), place(22, 'Fran Follower', 5)],
});
const U16 = () => ({ id: 12, name: 'U16', organization_id: 200, players_list: [place(24, 'Gail Guardian', 2)] });
const PEOPLE = [
  { id: 21, name: 'Pat Player', email: '21@example.com' },
  { id: 22, name: 'Fran Follower', email: '22@example.com' },
  { id: 24, name: 'Gail Guardian', email: 'gail@example.com' },
];
const ROLES = [
  { id: 200, user_id: 1, role_id: 1 },
  { id: 200, user_id: 21, role_id: 2 },
  { id: 200, user_id: 22, role_id: 5 },
  { id: 200, user_id: 24, role_id: 1 }, // a coach in the organisation
];

type Call = { path: string; body: any };
const ok = (data: unknown) => ({ status: true, message: '', data });

/** The server: reads answer from fixtures; writes are recorded and answered. */
function mockApi(options: { roles?: boolean; teamUpdate?: (body: any) => unknown } = {}) {
  const calls: Call[] = [];
  let u14 = U14();
  (global as any).fetch = jest.fn(async (url: string, init: { body?: string }) => {
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    const body = JSON.parse(init.body ?? '{}');
    calls.push({ path, body });
    const reply = (data: unknown, status = 200) => ({ status, json: async () => data });
    switch (path) {
      case '/api/getUsersOrganizationV1':
        return reply(ok({ organizations: ORGS, paging: { next: -1 } }));
      case '/api/team/list/myteamsV3':
        return reply(ok({ team: body.organization_id === 200 ? [u14, U16()] : [], paging: { next: -1 } }));
      case '/api/getAllUsersV2':
        return reply(ok({ players: PEOPLE, paging: { next: -1 } }));
      case '/api/getUsersAssociateOrganizations':
        return options.roles === false
          ? reply({ status: false, message: 'later' }, 500)
          : reply(ok({ organizations: ROLES, paging: { next: -1 } }));
      case '/api/game/listGamesV2':
        return reply(ok({ games: [], paging: { next: -1 } }));
      case '/api/team/list/listTeamByTeamIds':
        return reply(ok({ team: [U16(), u14] }));
      case '/api/team/update': {
        // The server takes the roster it is sent.
        const ids = String(body.playersList).split(',').map(Number);
        const roles = String(body.playersRole).split(',').map(Number);
        const jerseys = String(body.playerJerseyNumbers).split(',').map(Number);
        const named = (id: number) => [...U14().players_list, ...U16().players_list].find(p => p.user_id === id)?.name ?? `New ${id}`;
        u14 = { ...u14, players_list: ids.map((id, i) => place(id, named(id), roles[i], jerseys[i])) };
        return reply(options.teamUpdate ? options.teamUpdate(body) : ok({ team: [u14] }));
      }
      case '/api/updateUser':
        return reply(ok({}));
      case '/api/removeUserFromOrganization':
        if (body.team_id === 11) {
          // enc_user_id is encrypted; the test removes the only player.
          u14 = { ...u14, players_list: u14.players_list.filter(p => p.role_id !== 2) };
        }
        return reply(ok({}));
      case '/api/addUser':
        return reply(ok({ user: { id: 30, name: body.name, email: body.email } }));
      case '/api/searchUser':
        return reply(ok({ players: [] }));
      default:
        return reply({ status: false, message: 'not mocked' }, 404);
    }
  });
  const reads = ['/api/getUserProfile', '/api/getUsersOrganizationV1', '/api/team/list/myteamsV3', '/api/getAllUsersV2', '/api/getUsersAssociateOrganizations', '/api/game/listGamesV2', '/api/team/list/listTeamByTeamIds', '/api/searchUser'];
  return {
    calls,
    writes: () => calls.filter(c => !reads.includes(c.path)),
    to: (path: string) => calls.filter(c => c.path === path),
  };
}

async function flush() {
  for (let i = 0; i < 14; i++) {
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
    });
  }
}

const texts = (r: Renderer) =>
  r.root.findAll(n => typeof n.props.children === 'string').map(n => n.props.children as string);
const byLabel = (r: Renderer, label: string) =>
  r.root.findAll(n => n.props.accessibilityLabel === label && (n.props.onPress || n.props.onChangeText))[0];

async function press(r: Renderer, label: string) {
  const node = byLabel(r, label);
  if (!node) {
    throw new Error(`Nothing labelled "${label}"`);
  }
  await ReactTestRenderer.act(async () => {
    node.props.onPress();
  });
  await flush();
}
async function type(r: Renderer, label: string, value: string) {
  await ReactTestRenderer.act(async () => {
    byLabel(r, label).props.onChangeText(value);
  });
}
async function layout(r: Renderer, width: number) {
  const boxes = r.root.findAll(n => typeof n.props.onLayout === 'function');
  await ReactTestRenderer.act(async () => {
    boxes.forEach(b => b.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width, height: 700 } } }));
  });
}
const cardNames = (r: Renderer) =>
  r.root
    .findAll(n => typeof n.props.accessibilityLabel === 'string' && n.props.onPress)
    .map(n => n.props.accessibilityLabel as string)
    .filter(l => l.startsWith('Member '))
    .map(l => l.slice('Member '.length));
/** Presses a button inside the last Alert.alert call. */
async function answerAlert(text: string) {
  const calls = (Alert.alert as jest.Mock).mock.calls;
  const buttons = calls[calls.length - 1][2] as { text: string; onPress?: () => void }[];
  await ReactTestRenderer.act(async () => {
    buttons.find(b => b.text === text)!.onPress!();
  });
  await flush();
}

/** Opens the hub on Members, team U14. */
async function openMembers(): Promise<Renderer> {
  jest.spyOn(device, 'isTablet').mockReturnValue(true);
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
  await layout(r, 1024);
  await press(r, 'GAMES/TEAMS');
  await press(r, 'MEMBERS segment');
  await press(r, 'Team U14');
  await layout(r, 800);
  return r;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('the member editor', () => {
  test('opens with the member’s details and their organisation role', async () => {
    mockApi();
    const r = await openMembers();
    await press(r, 'Member Pat Player');

    expect(texts(r)).toContain('EDIT MEMBER');
    expect(byLabel(r, 'First name').props.value).toBe('Pat');
    expect(byLabel(r, 'Last name').props.value).toBe('Player');
    expect(byLabel(r, 'Jersey number').props.value).toBe('7');
    expect(byLabel(r, 'Role Player').props.accessibilityState.selected).toBe(true);
    // A coach (not an admin) can't make anyone an admin.
    expect(byLabel(r, 'Role Admin')).toBeUndefined();
  });

  test('a new jersey number sends the whole team back, with only that number changed', async () => {
    const api = mockApi();
    const r = await openMembers();
    await press(r, 'Member Pat Player');
    await type(r, 'Jersey number', '8');
    await press(r, 'UPDATE');

    expect(api.writes().map(c => c.path)).toEqual(['/api/team/update']);
    expect(api.to('/api/team/update')[0].body).toEqual(
      expect.objectContaining({
        playersList: '1,21,22',
        playersRole: '1,2,5',
        playerJerseyNumbers: '9999,8,9999',
        stat_enable: 1,
        abbr: 'U',
      }),
    );
    expect(texts(r)).not.toContain('EDIT MEMBER'); // closed
    expect(texts(r)).toContain('8'); // the card's new number
  });

  test('until the roles list has loaded, the role can’t be saved', async () => {
    const api = mockApi({ roles: false });
    const r = await openMembers();
    await press(r, 'Member Pat Player');

    expect(texts(r)).toContain('Loading roles…');
    expect(byLabel(r, 'UPDATE').props.accessibilityState.disabled).toBe(true);
    expect(api.writes()).toHaveLength(0);
  });

  test('removing from the team asks first, then removes only from that team', async () => {
    const api = mockApi();
    const r = await openMembers();
    await press(r, 'Member Pat Player');
    await press(r, 'REMOVE FROM TEAM');

    expect(Alert.alert).toHaveBeenLastCalledWith('Do you want to remove Pat Player from U14?', '', expect.any(Array));
    expect(api.writes()).toHaveLength(0);
    await answerAlert('Remove');

    expect(api.to('/api/removeUserFromOrganization')[0].body).toEqual(
      expect.objectContaining({ team_id: 11 }),
    );
    expect(Alert.alert).toHaveBeenLastCalledWith('Removed', 'Pat Player was removed from U14.');
    expect(cardNames(r)).not.toContain('Pat Player');
  });

  test('a team failure after the profile was saved is reported as a partial save', async () => {
    mockApi({ teamUpdate: () => ({ status: false, message: 'Server busy' }) });
    const r = await openMembers();
    await press(r, 'Member Pat Player');
    await press(r, 'Role Manager');
    await press(r, 'UPDATE');

    expect(Alert.alert).toHaveBeenLastCalledWith(
      'Partly saved',
      "The name and role were saved, but the team couldn't be updated: Server busy",
    );
  });
});

describe('adding a member', () => {
  test('someone already in the organisation goes onto the team without addUser', async () => {
    const api = mockApi();
    const r = await openMembers();
    await press(r, 'Add member');

    // Pat is already on U14: shown, but can't be picked.
    await type(r, 'Email or name', 'pat');
    expect(texts(r)).toContain('On this team');
    await press(r, 'Pick Pat Player');
    expect(texts(r)).not.toContain('Already in this organization.');

    await type(r, 'Email or name', 'gail');
    await press(r, 'Pick Gail Guardian');
    expect(texts(r)).toContain('Already in this organization.');
    // A coach can't add an admin.
    expect(byLabel(r, 'Role Admin')).toBeUndefined();
    await press(r, 'ADD TO TEAM');

    expect(api.writes().map(c => c.path)).toEqual(['/api/team/update']);
    expect(api.to('/api/team/update')[0].body.playersList).toBe('1,21,22,24');
    expect(api.to('/api/team/update')[0].body.playersRole).toBe('1,2,5,2'); // Members tab: Player
    expect(Alert.alert).toHaveBeenLastCalledWith('Added', 'Gail Guardian was added to U14.');
    expect(cardNames(r)).toContain('Gail Guardian');
  });

  test('a new email is invited with addUser, then put on the team', async () => {
    const api = mockApi();
    const r = await openMembers();
    await press(r, 'Add member');
    await type(r, 'Email or name', 'new.person@example.com');
    await press(r, 'Invite new.person@example.com');
    expect(texts(r)).toContain(
      "new.person@example.com doesn't have a Snipback account yet. They'll get an invitation email.",
    );
    await type(r, 'First name', 'New');
    await type(r, 'Jersey number', '33');
    await press(r, 'ADD TO TEAM');

    expect(api.writes().map(c => c.path)).toEqual(['/api/addUser', '/api/team/update']);
    expect(api.to('/api/addUser')[0].body).toEqual(
      expect.objectContaining({ email: 'new.person@example.com', name: 'New', teamList: '11', roleId: 2 }),
    );
    expect(api.to('/api/team/update')[0].body.playerJerseyNumbers).toBe('9999,7,9999,33');
    expect(Alert.alert).toHaveBeenLastCalledWith(
      'Added',
      'New was added, and an invitation was sent to new.person@example.com.',
    );
  });

  test('a name is required for an invitation; nothing is sent without one', async () => {
    const api = mockApi();
    const r = await openMembers();
    await press(r, 'Add member');
    await type(r, 'Email or name', 'new.person@example.com');
    await press(r, 'Invite new.person@example.com');
    await press(r, 'ADD TO TEAM');

    expect(texts(r)).toContain('Please enter a name.');
    expect(api.writes()).toHaveLength(0);
  });
});
