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

/** A game (Models/Games.swift); the API row is kept whole in rawJson. */
export const GameSchema: Realm.ObjectSchema = {
  name: 'Game',
  primaryKey: 'id',
  properties: {
    id: 'int',
    name: 'string',
    gameDate: 'double', // fractional unix seconds, as iOS stores game_date
    organizationId: { type: 'int', indexed: true },
    userId: 'int',
    status: 'int',
    gameType: 'int',
    gameMode: 'int',
    category: 'int',
    scheduleType: 'int',
    venueType: 'int',
    uploadStatus: 'int',
    streamStatus: 'int',
    isShared: 'int',
    isDeleted: 'int',
    isLiked: 'int',
    isBooked: 'int',
    postToWebsite: 'int',
    facilitycamDuration: 'int',
    stateTimezoneMappingId: 'int',
    teamIds: 'int[]',
    teamNames: 'string',
    homeTeamPoint: 'int',
    awayTeamPoint: 'int',
    gameResult: 'string',
    rawJson: 'string',
  },
};

/**
 * One games list as the server returned it, in order: per user, org, team
 * and tab. Lets a list open offline exactly as it was last seen.
 */
export const GameListSchema: Realm.ObjectSchema = {
  name: 'GameList',
  primaryKey: 'key',
  properties: {
    key: 'string', // `${userId}:${orgId}:${teamId}:${tab}`
    gameIds: 'int[]',
    /** The next page to request; ≤ 0 when there are no more. */
    nextPage: 'int',
  },
};

export const SCHEMA = [OrganizationSchema, TeamSchema, TeamMemberSchema, GameSchema, GameListSchema];
