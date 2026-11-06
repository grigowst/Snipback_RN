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
