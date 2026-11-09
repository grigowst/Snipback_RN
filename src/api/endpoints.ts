// API paths, named as in the iOS APIManager (ENDPOINT_*). Add new ones here as screens need them.

export const ENDPOINTS = {
  LOGIN: '/api/loginV2',
  GET_ALL_ORGANIZATIONS: '/api/getUsersOrganizationV1',
  GET_MY_TEAMS: '/api/team/list/myteamsV3',
  GET_PROFILE: '/api/getUserProfile',
  GET_GAMES: '/api/game/listGamesV2',
  GET_ALL_USERS: '/api/getAllUsersV2',
  CREATE_WEBSITE_ACCESS_TOKEN: '/api/createWebsiteAccessToken',
  GET_ORG_ROLES: '/api/getUsersAssociateOrganizations',
  GET_TEAMS_BY_IDS: '/api/team/list/listTeamByTeamIds',
  UPDATE_TEAM: '/api/team/update',
  UPDATE_USER: '/api/updateUser',
  REMOVE_USER: '/api/removeUserFromOrganization',
  SEARCH_USERS: '/api/searchUser',
  ADD_USER: '/api/addUser',
} as const;
