/**
 * Step 9: creating a game. The venue clock, the form's rules, the request
 * body and the API calls (time zones, opponent search, create).
 */

// RSA is replaced by a readable marker so the request bodies can be checked.
jest.mock('../src/utils/rsa', () => ({ rsaEncrypt: (v: unknown) => `enc(${v})` }));

import { createGame, fetchTimeZones, opponentSearchBody, searchOpponents, zoneLabel } from '../src/api/gameCreate';
import { newTeamDefaults } from '../src/api/teamEditor';
import { UserRole, type Organization } from '../src/api/types';
import {
  GENERIC_OPPONENT,
  applyTeamDefaults,
  canCreateGames,
  createGameBlock,
  createGameBody,
  defaultZoneId,
  newGameForm,
  shownParts,
  withSport,
} from '../src/games/gameForm';
import { epochFromWall, formatDate, formatTime, wallTime } from '../src/games/zonedTime';

type Call = { url: string; method: string; body: any };
const ok = (data: unknown) => ({ body: { status: true, message: '', data } });

function mockFetch(answer: (path: string, body: any) => { body: unknown; status?: number }) {
  const calls: Call[] = [];
  (global as any).fetch = jest.fn(async (url: string, init: { body?: string; method?: string }) => {
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, method: init.method ?? 'GET', body });
    const { body: reply, status = 200 } = answer(url.replace(/^https?:\/\/[^/]+/, '').split('?')[0], body);
    return { status, json: async () => reply };
  });
  return calls;
}

const org = (extra: Partial<Organization> = {}): Organization => ({
  orgId: 200,
  name: 'Alpha FC',
  userId: 1,
  roleId: UserRole.Coach,
  organizationType: 1,
  uniqueNumber: '',
  enableRecruiter: 0,
  isActive: 1,
  isDefault: false,
  parentOrgId: '',
  organizationCategory: 7,
  ...extra,
});

const ZONES = [
  { id: 1, stateName: 'Alabama', stateShortCode: 'AL', timeZoneName: 'Central Standard Time', identifier: 'America/Chicago', gmtValue: 'GMT-06:00' },
  { id: 71, stateName: 'India', stateShortCode: 'IN', timeZoneName: 'India Standard Time', identifier: 'Asia/Kolkata', gmtValue: 'GMT+05:30' },
];

describe('the venue clock', () => {
  const noonUtc = Date.UTC(2026, 10, 9, 12, 0) / 1000; // 9 Nov 2026, 12:00 UTC

  test('one moment reads differently on each zone’s clock', () => {
    expect(wallTime(noonUtc, 'America/Chicago')).toEqual({ year: 2026, month: 11, day: 9, hour: 6, minute: 0 });
    expect(wallTime(noonUtc, 'Asia/Kolkata')).toEqual({ year: 2026, month: 11, day: 9, hour: 17, minute: 30 });
  });

  test('a clock reading turns back into the same moment', () => {
    for (const zone of ['America/Chicago', 'Asia/Kolkata', 'America/New_York', 'Pacific/Honolulu', 'UTC']) {
      expect(epochFromWall(wallTime(noonUtc, zone), zone)).toBe(noonUtc);
      const july = Date.UTC(2026, 6, 4, 23, 45) / 1000;
      expect(epochFromWall(wallTime(july, zone), zone)).toBe(july);
    }
  });

  test('a reading skipped by daylight saving still gives a moment within the hour', () => {
    // 8 Mar 2026, 2:30 AM doesn't exist in New York (clocks go 2:00 → 3:00).
    const t = epochFromWall({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, 'America/New_York');
    const back = wallTime(t, 'America/New_York');
    expect(back.day).toBe(8);
    expect([1, 3]).toContain(back.hour);
    expect(back.minute).toBe(30);
  });

  test('readings just after the clocks change come back exactly (needs the second pass)', () => {
    // 8 Mar 2026: New York jumps from 2:00 EST to 3:00 EDT.
    for (const [hour, minute] of [[3, 30], [4, 0], [5, 15], [12, 0]]) {
      const w = { year: 2026, month: 3, day: 8, hour, minute };
      expect(wallTime(epochFromWall(w, 'America/New_York'), 'America/New_York')).toEqual(w);
    }
    // 25 Oct 2026: Paris goes back from 3:00 CEST to 2:00 CET.
    const after = { year: 2026, month: 10, day: 25, hour: 4, minute: 0 };
    expect(wallTime(epochFromWall(after, 'Europe/Paris'), 'Europe/Paris')).toEqual(after);
  });

  test('a reading that happens twice (fall back) gives one of its two moments', () => {
    const t = epochFromWall({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 }, 'America/New_York');
    expect(wallTime(t, 'America/New_York')).toEqual({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 });
  });

  test('dates and times read as in the form', () => {
    expect(formatDate({ year: 2026, month: 11, day: 9, hour: 0, minute: 0 })).toBe('Mon, Nov 9, 2026');
    expect(formatTime({ year: 2026, month: 11, day: 9, hour: 0, minute: 5 })).toBe('12:05 AM');
    expect(formatTime({ year: 2026, month: 11, day: 9, hour: 14, minute: 40 })).toBe('2:40 PM');
  });
});

describe('the form', () => {
  test('a new game: no team defaults means everything private, home, non-conference, the generic opponent', () => {
    expect(newGameForm({ tab: 'PRACTICES', start: 100, zoneId: 71, category: 0 })).toEqual({
      name: '',
      tab: 'PRACTICES',
      start: 100,
      zoneId: 71,
      venue: 1,
      gameKind: 1,
      category: 0,
      opponent: GENERIC_OPPONENT,
      otherTeamIds: [],
      isLiveBroadcasting: 0,
      publicSnipping: 0,
      postToWebsite: 0,
      statreportVisibility: 0,
      balltracking: 0,
    });
  });

  test('the team’s defaults set the sport and the advanced options (ball tracking only for court sports)', () => {
    const form = newGameForm({ tab: 'GAMES', start: 0, zoneId: 0, category: 0 });
    const d = { ...newTeamDefaults(1, 3), isLiveBroadcasting: 2, publicSnipping: 1, postToWebsite: 1, statreportVisibility: 0, balltracking: 2 };
    expect(applyTeamDefaults(form, d)).toEqual(
      expect.objectContaining({ category: 3, isLiveBroadcasting: 2, publicSnipping: 1, postToWebsite: 1, statreportVisibility: 0, balltracking: 2 }),
    );
    expect(applyTeamDefaults(form, { ...d, category: 7 }).balltracking).toBe(0);
    expect(applyTeamDefaults({ ...form, category: 6 }, { ...d, category: 0 }).category).toBe(6); // none saved: kept
  });

  test('a sport without ball tracking turns it off', () => {
    const form = { ...newGameForm({ tab: 'GAMES', start: 0, zoneId: 0, category: 3 }), balltracking: 2 };
    expect(withSport(form, 5).balltracking).toBe(2);
    expect(withSport(form, 7).balltracking).toBe(0);
  });

  test('what shows: Scout hides venue, type and the advanced options; Practice locks the website; HOME has no teams', () => {
    const f = (tab: 'GAMES' | 'PRACTICES' | 'SCOUT', category = 3) => newGameForm({ tab, start: 0, zoneId: 0, category });
    expect(shownParts(f('GAMES'), false)).toEqual({ venue: true, gameKind: true, teams: true, advanced: true, websiteLocked: false, ballTracking: true });
    expect(shownParts(f('PRACTICES'), false)).toEqual(expect.objectContaining({ gameKind: false, websiteLocked: true }));
    expect(shownParts(f('SCOUT'), true)).toEqual({ venue: false, gameKind: false, teams: false, advanced: false, websiteLocked: true, ballTracking: false });
    expect(shownParts(f('GAMES', 7), false).ballTracking).toBe(false);
  });

  test('the starting zone: the organisation’s, else the device’s row, else none', () => {
    expect(defaultZoneId(ZONES, 1, 'Asia/Kolkata')).toBe(1);
    expect(defaultZoneId(ZONES, 0, 'Asia/Kolkata')).toBe(71);
    expect(defaultZoneId(ZONES, 99, 'Asia/Kolkata')).toBe(71); // not in the list
    expect(defaultZoneId(ZONES, 0, 'Europe/Paris')).toBe(0);
  });
});

describe('who can create a game', () => {
  test('admins, coaches and home users', () => {
    expect([UserRole.Admin, UserRole.Coach, UserRole.HomeUser].map(r => canCreateGames(org({ roleId: r })))).toEqual([true, true, true]);
    expect([UserRole.Player, UserRole.Follower, UserRole.Manager, UserRole.Recruit].map(r => canCreateGames(org({ roleId: r })))).toEqual([false, false, false, false]);
    expect(canCreateGames(undefined)).toBe(false);
  });

  test('blocked: no permission, an inactive organisation, or no team picked outside HOME', () => {
    expect(createGameBlock(org({ roleId: UserRole.Player }), false, 11)?.message).toBe('Permission Denied');
    expect(createGameBlock(org({ isActive: 0 }), false, 11)?.title).toBe('Organization Deactivated');
    expect(createGameBlock(org(), false, 0)?.message).toBe('Please choose a team and continue');
    expect(createGameBlock(org({ roleId: UserRole.HomeUser }), true, 0)).toBeNull();
    expect(createGameBlock(org(), false, 11)).toBeNull();
  });
});

describe('the request body (iOS createUpdateGame + createGame)', () => {
  const ctx = { userId: 1, orgId: 200, myTeam: { id: 11, teamType: 0 } };
  const form = {
    ...newGameForm({ tab: 'GAMES' as const, start: 1_794_000_000, zoneId: 71, category: 3 }),
    name: ' Final ',
    venue: 2 as const,
    gameKind: 2,
    opponent: { id: 7107, name: 'AA · 001 new', teamType: 0 as const, nameOnly: false },
    otherTeamIds: [12, 13],
    isLiveBroadcasting: 2,
    publicSnipping: 1,
    postToWebsite: 1,
    statreportVisibility: 0,
    balltracking: 2,
  };

  test('a game against a SnipBack team', () => {
    expect(createGameBody(form, ctx)).toEqual({
      game_date: 1_794_000_000,
      name: 'Final',
      game_type: 1,
      isLiveBroadcasting: 2,
      ai_enable: 0,
      public: 1,
      post_to_website: 1,
      statreport_visibility: 0,
      balltracking: 2,
      venue_type: 2,
      teamList: '12,13',
      enc_category: 'enc(3)',
      enc_myteam_id: 'enc(11)',
      home_team_type: 0,
      enc_oppo_team_id: 'enc(7107)',
      away_team_type: 0,
      amount: 0,
      timetofree: 0,
      facilitycam_room_id: 0,
      facility_cam_uniqueids: '',
      facility_cam_duration: 0,
      facility_cam_startnow: 0,
      state_timezone_mapping_id: 71,
      test_game: 0,
      game_mode: 2,
      ai_status: 0,
      status: 0,
      volley_game_rotation: [],
      offline_game_id: 0,
      storage_type: 1,
      enc_userId: 'enc(1)',
      enc_organization_id: 'enc(200)',
    });
  });

  test('a name-only opponent is flagged; the generic one isn’t', () => {
    const named = createGameBody({ ...form, opponent: { id: 3320, name: 'RN Test Opponent', teamType: 1, nameOnly: true } }, ctx);
    expect(named).toEqual(expect.objectContaining({ enc_oppo_team_id: 'enc(3320)', away_team_type: 1, is_opponent: '1', is_opponent_team_group: '1' }));
    const generic = createGameBody({ ...form, opponent: GENERIC_OPPONENT }, ctx);
    expect(generic).toEqual(expect.objectContaining({ enc_oppo_team_id: 'enc(0)', away_team_type: 1 }));
    expect(generic.is_opponent).toBeUndefined();
  });

  test('Scout: no stream, private, the stat report public, no tracking, at home', () => {
    expect(createGameBody({ ...form, tab: 'SCOUT' }, ctx)).toEqual(
      expect.objectContaining({
        game_type: 2,
        isLiveBroadcasting: 0,
        public: 0,
        post_to_website: 0,
        statreport_visibility: 1,
        balltracking: 0,
        venue_type: 1,
      }),
    );
  });

  test('Practice is game type 0; HOME (no team) sends team 0', () => {
    expect(createGameBody({ ...form, tab: 'PRACTICES' }, { ...ctx, myTeam: null })).toEqual(
      expect.objectContaining({ game_type: 0, enc_myteam_id: 'enc(0)', home_team_type: 0 }),
    );
  });
});

describe('the API calls', () => {
  test('time zones: a GET with the organisation in the query; rows without a zone are skipped', async () => {
    const calls = mockFetch(() =>
      ok({
        states_and_timezone: [
          { id: 1, state_name: 'Alabama', state_short_code: 'AL', time_zone: 'Central Standard Time', php_equivalent: 'America/Chicago', gmt_value: 'GMT-06:00' },
          { id: 2, state_name: 'Nowhere', php_equivalent: '' },
        ],
        selected: 0,
      }),
    );
    const { zones, selected } = await fetchTimeZones(200);
    expect(calls[0].method).toBe('GET');
    expect(calls[0].url).toMatch(/\/api\/game\/getStatesAndTimeZone\?organization_id=200$/);
    expect(zones.map(z => z.id)).toEqual([1]);
    expect(zoneLabel(zones[0])).toBe('Alabama(AL) - Central Standard Time(GMT-06:00)');
    expect(selected).toBe(0);
  });

  test('opponent search: the body, with the sport and the game’s own team when given', () => {
    expect(opponentSearchBody({ orgId: 200, query: 'new', sportId: 3, includeOlder: true, excludeTeamIds: [11, 0], page: 2 })).toEqual({
      enc_organization_id: 'enc(200)',
      q: 'new',
      purpose: 'opponent',
      include_older: 1,
      page: 2,
      sport_category_id: 3,
      exclude_team_ids: '11',
    });
    const plain = opponentSearchBody({ orgId: 200, query: '', sportId: 0, includeOlder: false, excludeTeamIds: [0], page: 1 });
    expect(plain.sport_category_id).toBeUndefined();
    expect(plain.exclude_team_ids).toBeUndefined();
  });

  test('opponent search: directory, results and name-only rows', async () => {
    mockFetch(() =>
      ok({
        directory: [{ team_id: 5, label: 'A · B · C', school_name: 'A', program_org_id: 9, sport: 'Football', gender: 'boys', is_older: 0, same_school: 1 }],
        results: [{ team_id: 6, school_name: 'S', program_name: 'P', team_name: 'T' }, { team_id: 0 }],
        named: [{ opponent_id: 3320, name: ' RN Test Opponent ', abbr: '' }, { opponent_id: 0, name: 'x' }],
        page: 1,
        has_more: true,
      }),
    );
    const found = await searchOpponents({ orgId: 200, query: '', sportId: 0, includeOlder: false, excludeTeamIds: [], page: 1 });
    expect(found.directory).toEqual([
      { teamId: 5, label: 'A · B · C', schoolName: 'A', programOrgId: 9, sport: 'Football', gender: 'boys', isOlder: false, sameSchool: true },
    ]);
    expect(found.results.map(r => [r.teamId, r.label])).toEqual([[6, 'S · P · T']]);
    expect(found.named).toEqual([{ opponentId: 3320, name: 'RN Test Opponent', abbr: '' }]);
    expect(found.hasMore).toBe(true);
  });

  test('create: posts to saveGame and maps the game; a reply without one is an error', async () => {
    const calls = mockFetch(() => ok({ game: { id: 900, name: 'Final', game_type: 1, game_date: 1_794_000_000 } }));
    await expect(createGame({ name: 'Final' })).resolves.toEqual(expect.objectContaining({ id: 900, name: 'Final' }));
    expect(calls[0].url).toMatch(/\/api\/game\/saveGame$/);
    mockFetch(() => ok({}));
    await expect(createGame({ name: 'Final' })).rejects.toThrow('did not return it');
  });
});
