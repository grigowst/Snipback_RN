import Realm from 'realm';
import type { Organization, Team, TeamMember, TeamWithMembers } from '../api/types';
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

export function readTeamMembers(teamId: number): TeamMember[] {
  return getStore()
    .objects<TeamMemberRow>('TeamMember')
    .filtered('teamId == $0', teamId)
    .map(row => ({
      teamId: row.teamId,
      orgId: row.orgId,
      userId: row.userId,
      userName: row.userName,
      userEmail: row.userEmail,
      roleId: row.roleId,
      jerseyNumber: row.jerseyNumber,
    }));
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
