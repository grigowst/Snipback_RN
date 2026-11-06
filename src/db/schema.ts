import type Realm from 'realm';

// Realm object schemas for the app's local store. Rows are plain data; screens
// read them through src/db/repositories.ts as plain objects, never as live
// Realm objects (so a sign-out that clears the store can't leave a screen
// holding a deleted object).

/**
 * An organisation membership (Models/Organization.swift). One row per API
 * row, scoped by user so two accounts' caches never collide.
 */
export const OrganizationSchema: Realm.ObjectSchema = {
  name: 'Organization',
  primaryKey: 'key',
  properties: {
    key: 'string', // `${userId}:k${rowKey}`, or `${userId}:o${orgId}` without one
    rowKey: 'string', // the API's membership key ('' if none)
    orgId: { type: 'int', indexed: true },
    userId: { type: 'int', indexed: true },
    name: 'string',
    roleId: 'int',
    organizationType: 'int',
    uniqueNumber: 'string',
    enableRecruiter: 'int',
    isActive: 'int',
    isDefault: 'bool',
    parentOrgId: 'string',
  },
};

/** A team (Models/Team.swift). */
export const TeamSchema: Realm.ObjectSchema = {
  name: 'Team',
  primaryKey: 'id',
  properties: {
    id: 'int',
    organizationId: { type: 'int', indexed: true },
    name: 'string',
    teamType: 'int',
    isDeleted: 'int',
    isArchive: 'int',
    isFavourite: 'int',
    uniqueNumber: 'string',
    organizationName: 'string',
    logoUrl: 'string',
    abbr: 'string',
    noOfPlayers: 'int',
  },
};

/**
 * A user's place on a team (TeamUserRoleMapping in iOS). Keyed by team and
 * user instead of iOS's max+1 ids.
 */
export const TeamMemberSchema: Realm.ObjectSchema = {
  name: 'TeamMember',
  primaryKey: 'key',
  properties: {
    key: 'string', // `${teamId}:${userId}`
    teamId: { type: 'int', indexed: true },
    orgId: { type: 'int', indexed: true },
    userId: { type: 'int', indexed: true },
    userName: 'string',
    userEmail: 'string',
    roleId: 'int',
    jerseyNumber: 'int',
  },
};

export const SCHEMA = [OrganizationSchema, TeamSchema, TeamMemberSchema];
