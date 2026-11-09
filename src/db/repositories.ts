import Realm from 'realm';
import type { Game, Organization, Person, Team, TeamMember, TeamWithMembers } from '../api/types';
import { getStore } from './store';

// Reads return plain objects (copies), never live Realm objects.
// Writes replace a whole set in one transaction: rows the server no longer
// returns are deleted, so an organisation or team the user has left
// disappears instead of staying in the cache forever.

/**
 * One row per membership, as iOS keys Organization by the API's "key"; rows
 * without one fall back to user and organisation.
 */
const orgKey = (userId: number, org: Organization) =>
  org.rowKey ? `${userId}:k${org.rowKey}` : `${userId}:o${org.orgId}`;
const memberKey = (teamId: number, userId: number) => `${teamId}:${userId}`;

// ---- Organisations -------------------------------------------------------

type OrganizationRow = Organization & { key: string };

export function readOrganizations(userId: number): Organization[] {
  return getStore()
    .objects<OrganizationRow>('Organization')
    .filtered('userId == $0', userId)
    .map(row => ({
      rowKey: row.rowKey || undefined,
      orgId: row.orgId,
      name: row.name,
      userId: row.userId,
      roleId: row.roleId,
      organizationType: row.organizationType,
      uniqueNumber: row.uniqueNumber,
      enableRecruiter: row.enableRecruiter,
      isActive: row.isActive,
      isDefault: row.isDefault,
      parentOrgId: row.parentOrgId,
    }));
}

/** Stores the user's complete organisation list, removing any not in it. */
export function replaceOrganizations(userId: number, organizations: Organization[]): void {
  const store = getStore();
  const own = organizations.filter(o => o.userId === userId);
  const keep = new Set(own.map(o => orgKey(userId, o)));
  store.write(() => {
    for (const org of own) {
      store.create(
        'Organization',
        { ...org, rowKey: org.rowKey ?? '', key: orgKey(userId, org) },
        Realm.UpdateMode.Modified,
      );
    }
    const stale = store
      .objects<OrganizationRow>('Organization')
      .filtered('userId == $0', userId)
      .filter(row => !keep.has(row.key));
    store.delete(stale);
  });
}

// ---- Teams ---------------------------------------------------------------

type TeamRow = Team;
type TeamMemberRow = TeamMember & { key: string };

const toTeam = (row: TeamRow): Team => ({
  id: row.id,
  organizationId: row.organizationId,
  name: row.name,
  teamType: row.teamType,
  isDeleted: row.isDeleted,
  isArchive: row.isArchive,
  isFavourite: row.isFavourite,
  uniqueNumber: row.uniqueNumber,
  organizationName: row.organizationName,
  logoUrl: row.logoUrl,
  abbr: row.abbr,
  noOfPlayers: row.noOfPlayers,
});

/** Every cached team of an organisation, archived and deleted ones included. */
export function readTeams(orgId: number): Team[] {
  return getStore()
    .objects<TeamRow>('Team')
    .filtered('organizationId == $0', orgId)
    .map(toTeam);
}

const toTeamMember = (row: TeamMemberRow): TeamMember => ({
  teamId: row.teamId,
  orgId: row.orgId,
  userId: row.userId,
  userName: row.userName,
  userEmail: row.userEmail,
  roleId: row.roleId,
  jerseyNumber: row.jerseyNumber,
});

export function readTeamMembers(teamId: number): TeamMember[] {
  return getStore()
    .objects<TeamMemberRow>('TeamMember')
    .filtered('teamId == $0', teamId)
    .map(toTeamMember);
}

/** Every team place in an organisation (the mapping's org is its team's org). */
export function readOrgTeamMembers(orgId: number): TeamMember[] {
  return getStore()
    .objects<TeamMemberRow>('TeamMember')
    .filtered('orgId == $0', orgId)
    .map(toTeamMember);
}

/**
 * Stores the complete team list fetched for an organisation. Each team keeps
 * its own organisation (as iOS stores it) and its roster is replaced; this
 * organisation's teams that were not returned are removed with their rosters.
 */
export function replaceTeams(orgId: number, teams: TeamWithMembers[]): void {
  const store = getStore();
  const keep = new Set(teams.map(t => t.team.id));
  store.write(() => {
    for (const { team, members } of teams) {
      store.create('Team', team, Realm.UpdateMode.Modified);
      store.delete(store.objects('TeamMember').filtered('teamId == $0', team.id));
      for (const member of members) {
        store.create(
          'TeamMember',
          {
            ...member,
            teamId: team.id,
            orgId: team.organizationId,
            key: memberKey(team.id, member.userId),
          },
          Realm.UpdateMode.Modified,
        );
      }
    }
    const staleTeams = store
      .objects<TeamRow>('Team')
      .filtered('organizationId == $0', orgId)
      .filter(row => !keep.has(row.id));
    for (const row of staleTeams) {
      store.delete(store.objects('TeamMember').filtered('teamId == $0', row.id));
    }
    store.delete(staleTeams);
  });
}

// ---- People --------------------------------------------------------------

type PersonRow = Person;
type OrgUserRow = { key: string; orgId: number; userId: number };

const orgUserKey = (orgId: number, userId: number) => `${orgId}:${userId}`;

const toPerson = (row: PersonRow): Person => ({
  id: row.id,
  name: row.name,
  email: row.email,
  username: row.username,
  uniqueId: row.uniqueId,
  avatar: row.avatar,
  rawJson: row.rawJson,
});

/** The cached people of an organisation's users list. */
export function readOrgUsers(orgId: number): Person[] {
  const store = getStore();
  const people: Person[] = [];
  for (const link of store.objects<OrgUserRow>('OrgUser').filtered('orgId == $0', orgId)) {
    const row = store.objectForPrimaryKey<PersonRow>('User', link.userId);
    if (row) {
      people.push(toPerson(row));
    }
  }
  return people;
}

/** The cached people with these ids, by id (anyone not cached is left out). */
export function readPeople(ids: number[]): Map<number, Person> {
  const store = getStore();
  const found = new Map<number, Person>();
  for (const id of new Set(ids)) {
    const row = store.objectForPrimaryKey<PersonRow>('User', id);
    if (row) {
      found.set(id, toPerson(row));
    }
  }
  return found;
}

/**
 * Stores an organisation's complete users list. People are shared between
 * organisations, so leaving this list only removes the person's link to this
 * organisation; the person's row goes once no organisation lists them.
 */
export function replaceOrgUsers(orgId: number, people: Person[]): void {
  const store = getStore();
  const keep = new Set(people.map(p => p.id));
  store.write(() => {
    for (const person of people) {
      store.create('User', person, Realm.UpdateMode.Modified);
      store.create(
        'OrgUser',
        { key: orgUserKey(orgId, person.id), orgId, userId: person.id },
        Realm.UpdateMode.Modified,
      );
    }
    const staleLinks = store
      .objects<OrgUserRow>('OrgUser')
      .filtered('orgId == $0', orgId)
      .filter(link => !keep.has(link.userId));
    const leftIds = staleLinks.map(link => link.userId);
    store.delete(staleLinks);
    for (const id of leftIds) {
      if (store.objects('OrgUser').filtered('userId == $0', id).length === 0) {
        const row = store.objectForPrimaryKey('User', id);
        if (row) {
          store.delete(row);
        }
      }
    }
  });
}

// ---- Organisation roles --------------------------------------------------

type OrgRoleRow = { key: string; orgId: number; userId: number; roleId: number };

/** Everyone's role in an organisation, by user id. */
export function readOrgRoles(orgId: number): Map<number, number> {
  const roles = new Map<number, number>();
  for (const row of getStore().objects<OrgRoleRow>('OrgRole').filtered('orgId == $0', orgId)) {
    roles.set(row.userId, row.roleId);
  }
  return roles;
}

/** Stores an organisation's complete role list, removing anyone not in it. */
export function replaceOrgRoles(orgId: number, roles: { userId: number; roleId: number }[]): void {
  const store = getStore();
  const keep = new Set(roles.map(r => r.userId));
  store.write(() => {
    for (const { userId, roleId } of roles) {
      store.create(
        'OrgRole',
        { key: `${orgId}:${userId}`, orgId, userId, roleId },
        Realm.UpdateMode.Modified,
      );
    }
    store.delete(
      store
        .objects<OrgRoleRow>('OrgRole')
        .filtered('orgId == $0', orgId)
        .filter(row => !keep.has(row.userId)),
    );
  });
}

// ---- Member changes --------------------------------------------------------

/**
 * Stores one team as the server returned it after a change: the team row is
 * updated and its roster replaced. The organisation's other teams are left
 * alone (unlike replaceTeams, which takes a whole organisation's list).
 */
export function writeTeam({ team, members }: TeamWithMembers): void {
  const store = getStore();
  store.write(() => {
    store.create('Team', team, Realm.UpdateMode.Modified);
    store.delete(store.objects('TeamMember').filtered('teamId == $0', team.id));
    for (const member of members) {
      store.create(
        'TeamMember',
        {
          ...member,
          teamId: team.id,
          orgId: team.organizationId,
          key: memberKey(team.id, member.userId),
        },
        Realm.UpdateMode.Modified,
      );
    }
  });
}

/**
 * Clears someone out of the cache after they were removed: from one team, or
 * (teamId 0) from the whole organisation, with their user link and role.
 * The next sync confirms it either way.
 */
export function removeMemberLocally(orgId: number, userId: number, teamId: number): void {
  const store = getStore();
  store.write(() => {
    if (teamId !== 0) {
      store.delete(store.objects('TeamMember').filtered('teamId == $0 AND userId == $1', teamId, userId));
      return;
    }
    store.delete(store.objects('TeamMember').filtered('orgId == $0 AND userId == $1', orgId, userId));
    store.delete(store.objects('OrgRole').filtered('orgId == $0 AND userId == $1', orgId, userId));
    store.delete(store.objects('OrgUser').filtered('orgId == $0 AND userId == $1', orgId, userId));
    if (store.objects('OrgUser').filtered('userId == $0', userId).length === 0) {
      const row = store.objectForPrimaryKey('User', userId);
      if (row) {
        store.delete(row);
      }
    }
  });
}

// ---- Games ---------------------------------------------------------------

type GameRow = Game;
type GameListRow = { key: string; gameIds: number[]; nextPage: number };

const toGame = (row: GameRow): Game => ({
  id: row.id,
  name: row.name,
  gameDate: row.gameDate,
  organizationId: row.organizationId,
  userId: row.userId,
  status: row.status,
  gameType: row.gameType,
  gameMode: row.gameMode,
  category: row.category,
  scheduleType: row.scheduleType,
  venueType: row.venueType,
  uploadStatus: row.uploadStatus,
  streamStatus: row.streamStatus,
  isShared: row.isShared,
  isDeleted: row.isDeleted,
  isLiked: row.isLiked,
  isBooked: row.isBooked,
  postToWebsite: row.postToWebsite,
  facilitycamDuration: row.facilitycamDuration,
  stateTimezoneMappingId: row.stateTimezoneMappingId,
  teamIds: [...row.teamIds],
  teamNames: row.teamNames,
  homeTeamPoint: row.homeTeamPoint,
  awayTeamPoint: row.awayTeamPoint,
  gameResult: row.gameResult,
  rawJson: row.rawJson,
});

export type GameListPage = { games: Game[]; nextPage: number };

/** A cached list in the server's order, without deleted games; null if never loaded. */
export function readGameList(key: string): GameListPage | null {
  const store = getStore();
  const list = store.objectForPrimaryKey<GameListRow>('GameList', key);
  if (!list) {
    return null;
  }
  const games: Game[] = [];
  for (const id of list.gameIds) {
    const row = store.objectForPrimaryKey<GameRow>('Game', id);
    if (row && row.isDeleted === 0) {
      games.push(toGame(row));
    }
  }
  return { games, nextPage: list.nextPage };
}

/**
 * Stores a page of a list: page 1 replaces the list, later pages append
 * (skipping ids already in it). The games themselves are upserted.
 */
export function writeGameListPage(
  key: string,
  page: number,
  games: Game[],
  nextPage: number,
): void {
  const store = getStore();
  store.write(() => {
    for (const game of games) {
      store.create('Game', game, Realm.UpdateMode.Modified);
    }
    const existing = store.objectForPrimaryKey<GameListRow>('GameList', key);
    const before = page > 1 && existing ? [...existing.gameIds] : [];
    const seen = new Set(before);
    const ids = [...before];
    for (const game of games) {
      if (!seen.has(game.id)) {
        seen.add(game.id);
        ids.push(game.id);
      }
    }
    store.create('GameList', { key, gameIds: ids, nextPage }, Realm.UpdateMode.Modified);
  });
}
