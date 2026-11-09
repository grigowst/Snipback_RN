// Response shapes from the Snipback API.
// Field names follow the iOS ObjectMapper mappings (Snipback/Models, Snipback/Managers/APIManager/ResponseModels).

/** Every endpoint answers with this envelope (BaseAPIResponse in iOS). */
export type ApiEnvelope<T> = {
  status: boolean;
  message: string;
  statusCode?: number;
  data?: T;
};

/** Roles as numbered by the iOS `userRole` enum. */
export enum UserRole {
  Coach = 1,
  Player = 2,
  HomeUser = 3,
  Admin = 4,
  Follower = 5,
  Recruit = 6,
  Manager = 7,
}

/** An organisation row as the API sends it (fields read by the iOS Organization mapping). */
export type RawOrganization = {
  key?: unknown;
  id?: unknown;
  organization_id?: unknown;
  name?: unknown;
  user_id?: unknown;
  role_id?: unknown;
  organization_type?: unknown;
  unique_number?: unknown;
  enable_recruiter?: unknown;
  is_active?: unknown;
  organization_is_default?: unknown;
  parent_org_id?: unknown;
  [key: string]: unknown;
};

/** An organisation the user belongs to, with their role in it (Models/Organization.swift). */
export type Organization = {
  /** The API's row key (Organization.id ← "key" in iOS); one per membership. */
  rowKey?: string;
  orgId: number;
  name: string;
  userId: number;
  roleId: number;
  /** 2 = the user's HOME organisation. */
  organizationType: number;
  uniqueNumber: string;
  enableRecruiter: number;
  isActive: number;
  isDefault: boolean;
  /** '' when the organisation has no parent. */
  parentOrgId: string;
  /** The organisation's sport (a game category id); 1 when the server sends none, as in iOS. */
  organizationCategory: number;
};

/** Mirrors `User.mapping(map:)` in Snipback/Models/User.swift. */
export type User = {
  id: number;
  name: string;
  email: string;
  username?: string;
  unique_id?: number;
  device_name?: string;
  createdby?: number;
  avatar?: string;
  created_at?: string;
  updated_at?: string;
  token: string;
  number?: string;
  organizationId?: number;
  organization?: RawOrganization[];
  is_terms_accepted?: number;
  isKiosk?: number;
  mount_static_ip?: string;
  scoreboardRecorder?: number;
  disableZoom?: number;
};

/** `data` of the login and profile endpoints (UserAPIResponse in iOS). */
export type UserResponse = {
  user: User;
};

/** A team (Models/Team.swift). */
export type Team = {
  id: number;
  organizationId: number;
  name: string;
  /** 0 = a normal team, 1 = super-admin. */
  teamType: number;
  isDeleted: number;
  isArchive: number;
  isFavourite: number;
  uniqueNumber: string;
  organizationName: string;
  logoUrl: string;
  abbr: string;
  noOfPlayers: number;
  /** Invite links (sharecode_short_url, short_url_coach, short_url_follower); '' when the team has none. */
  playerLink: string;
  coachLink: string;
  followerLink: string;
};

/** An organisation's opponent team (OpponentTeam in iOS): a name only, no roster. */
export type OpponentTeam = {
  id: number;
  organizationId: number;
  name: string;
  isDeleted: number;
};

/** A user's place on a team (TeamUserRoleMapping in iOS). */
export type TeamMember = {
  teamId: number;
  orgId: number;
  userId: number;
  userName: string;
  userEmail: string;
  roleId: number;
  jerseyNumber: number;
};

/** A team as the teams endpoint returns it, with its roster. */
export type TeamWithMembers = {
  team: Team;
  members: TeamMember[];
};

/**
 * Someone in an organisation, from the users list (the Realm `User` in iOS,
 * filled by getAllUsers). Not the signed-in user: that is `User` above.
 */
export type Person = {
  id: number;
  name: string;
  email: string;
  username: string;
  uniqueId: number;
  avatar: string;
  /** The API row, kept whole for later screens. */
  rawJson: string;
};

/**
 * A game, film or practice (Models/Games.swift). Only the fields the list
 * uses are columns; the API row is kept whole in `rawJson` for later screens.
 */
export type Game = {
  id: number;
  name: string;
  /** Unix seconds, possibly fractional (a Double in iOS). */
  gameDate: number;
  organizationId: number;
  /** The user who created it. */
  userId: number;
  /** 0 = created, 1 = uploading, 2 = ended, 3 = completed (GameStatus). */
  status: number;
  /** 1 = game, 0 = practice, 2 = scout. */
  gameType: number;
  /** 1 = non-conference, 2 = conference, 3 = exhibition. */
  gameMode: number;
  category: number;
  scheduleType: number;
  /** 2 = away. */
  venueType: number;
  uploadStatus: number;
  streamStatus: number;
  isShared: number;
  isDeleted: number;
  isLiked: number;
  isBooked: number;
  postToWebsite: number;
  /** Seconds; 0 when not a facility-camera game. */
  facilitycamDuration: number;
  stateTimezoneMappingId: number;
  /** Team ids ordered home, away, others (teamMapping sorted by type). */
  teamIds: number[];
  /** Team names in the same order, comma-separated (as iOS stores them). */
  teamNames: string;
  /** additional_details: final score, when the game has one. */
  homeTeamPoint: number;
  awayTeamPoint: number;
  /** "1" = win. */
  gameResult: string;
  rawJson: string;
};
