import { mapGame } from '../src/api/games';
import { UserRole } from '../src/api/types';
import {
  durationText,
  formatGameDate,
  scoreText,
  showRecordButton,
  statusChip,
} from '../src/games/gameRows';

const game = (extra: Record<string, unknown> = {}) => mapGame({ id: 1, user_id: 99, status: 0, ...extra });

describe('REC button', () => {
  const roles: Array<[UserRole, boolean]> = [
    [UserRole.Coach, true],
    [UserRole.Admin, true],
    [UserRole.Manager, true],
    [UserRole.Player, false],
    [UserRole.Follower, false],
    [UserRole.HomeUser, false],
    [UserRole.Recruit, false],
  ];
  test.each(roles)('role %s on someone else’s game → %s', (role, expected) => {
    expect(showRecordButton(game(), { role, userId: 7, tab: 'GAMES' })).toBe(expected);
  });
  test('a player sees it on their own game', () => {
    expect(showRecordButton(game({ user_id: 7 }), { role: UserRole.Player, userId: 7, tab: 'GAMES' })).toBe(true);
  });
  test('hidden for ended, shared and Scout games', () => {
    const coach = { role: UserRole.Coach, userId: 7 };
    expect(showRecordButton(game({ status: 2 }), { ...coach, tab: 'GAMES' })).toBe(false);
    expect(showRecordButton(game({ is_shared: 1 }), { ...coach, tab: 'GAMES' })).toBe(false);
    expect(showRecordButton(game(), { ...coach, tab: 'SCOUT' })).toBe(false);
    expect(showRecordButton(game({ status: 1 }), { ...coach, tab: 'PRACTICES' })).toBe(true);
  });
});

describe('score text (tablets)', () => {
  const scored = game({ venue_type: 2, additional_details: { home_team_point: 3, away_team_point: 1, game_result: '1' } });
  test('outside HOME on GAMES/PRACTICES: venue and result', () => {
    expect(scoreText(scored, { tab: 'GAMES', isHomeOrg: false })).toBe('Away\nW: 3 - 1');
    expect(scoreText(game({ additional_details: { home_team_point: 0, away_team_point: 2, game_result: '0' } }), {
      tab: 'PRACTICES',
      isHomeOrg: false,
    })).toBe('Home\nL: 0 - 2');
  });
  test('empty in HOME, in Scout, or with no score', () => {
    expect(scoreText(scored, { tab: 'GAMES', isHomeOrg: true })).toBe('');
    expect(scoreText(scored, { tab: 'SCOUT', isHomeOrg: false })).toBe('');
    expect(scoreText(game(), { tab: 'GAMES', isHomeOrg: false })).toBe('');
  });
});

test('duration only for facility-camera games, worded per device', () => {
  expect(durationText(game({ facilitycam_duration: 754 }), false)).toBe('Dur: 12 mins');
  expect(durationText(game({ facilitycam_duration: 754 }), true)).toBe('Duration: 12 mins');
  expect(durationText(game(), false)).toBe('');
});

test('status chip from the game status', () => {
  expect(statusChip(game({ status: 0 })).label).toBe('NOT STARTED');
  expect(statusChip(game({ status: 1 })).label).toBe('LIVE');
  expect(statusChip(game({ status: 2 })).label).toBe('ENDED');
  expect(statusChip(game({ status: 3 })).label).toBe('ENDED');
});

test('dates: short on phones, longer on tablets', () => {
  const phone = formatGameDate(1_793_000_000, false, 'en-US');
  const tablet = formatGameDate(1_793_000_000, true, 'en-US');
  expect(phone.length).toBeGreaterThan(5);
  expect(tablet.length).toBeGreaterThan(phone.length);
});
