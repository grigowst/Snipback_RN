import type { Team } from '../src/api/types';
import {
  ALL_TEAMS,
  defaultTeam,
  keepOrDefaultTeam,
  teamPickerList,
} from '../src/dashboard/teamLogic';

function team(id: number, name: string, extra: Partial<Team> = {}): Team {
  return {
    id,
    organizationId: 50,
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

test('the picker lists All Teams, then active teams by name (case-insensitive)', () => {
  const list = teamPickerList([
    team(1, 'zebras'),
    team(2, 'Alpha'),
    team(3, 'archived', { isArchive: 1 }),
    team(4, 'deleted', { isDeleted: 1 }),
    team(5, 'admin team', { teamType: 1 }),
    team(6, 'beta'),
  ]);
  expect(list.map(t => t.name)).toEqual(['Org - All Teams', 'Alpha', 'beta', 'zebras']);
});

describe('default team when an organisation opens', () => {
  test('its only team, outside HOME', () => {
    expect(defaultTeam(teamPickerList([team(1, 'Only')]), false).id).toBe(1);
  });
  test('All Teams in HOME, even with one team', () => {
    expect(defaultTeam(teamPickerList([team(1, 'Only')]), true)).toEqual(ALL_TEAMS);
  });
  test('the first favourite when there are several', () => {
    const list = teamPickerList([team(1, 'A'), team(2, 'B', { isFavourite: 1 }), team(3, 'C')]);
    expect(defaultTeam(list, false).id).toBe(2);
  });
  test('All Teams when several and no favourite', () => {
    expect(defaultTeam(teamPickerList([team(1, 'A'), team(2, 'B')]), false)).toEqual(ALL_TEAMS);
  });
  test('All Teams when the organisation has none', () => {
    expect(defaultTeam(teamPickerList([]), false)).toEqual(ALL_TEAMS);
  });
});

test('a refresh keeps the chosen team if it still exists, otherwise falls back', () => {
  const list = teamPickerList([team(1, 'A'), team(2, 'B'), team(3, 'C', { isFavourite: 1 })]);
  expect(keepOrDefaultTeam(list, 2, false).id).toBe(2);
  expect(keepOrDefaultTeam(list, 99, false).id).toBe(3);
  expect(keepOrDefaultTeam(list, undefined, false).id).toBe(3);
});
