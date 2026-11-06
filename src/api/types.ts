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

/**
 * An organisation as returned inside the user. Only the fields we use so far
 * are typed; the rest are kept so later phases can read them.
 */
export type Organization = {
  id?: number;
  name?: string;
  [key: string]: unknown;
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
  organization?: Organization[];
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
