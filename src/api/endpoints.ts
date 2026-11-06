// API paths, named as in the iOS APIManager (ENDPOINT_*). Add new ones here as screens need them.

export const ENDPOINTS = {
  LOGIN: '/api/loginV2',
  GET_ALL_ORGANIZATIONS: '/api/getUsersOrganizationV1',
  GET_MY_TEAMS: '/api/team/list/myteamsV3',
  GET_PROFILE: '/api/getUserProfile',
  GET_GAMES: '/api/game/listGamesV2',
} as const;
