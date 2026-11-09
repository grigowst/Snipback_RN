import { rsaEncrypt } from '../utils/rsa';
import { apiRequest } from './client';
import { ENDPOINTS } from './endpoints';
import { fetchAllPages, toInt, toStr } from './paging';
import type { Person } from './types';

// An organisation's people (APIManager.getAllUsers +
// CommonDataSyncManager.getAllUsersByPageAPI in iOS).

/** Page size the iOS users call uses (pageItemsCount). */
const PAGE_SIZE = 400;

type UsersPage = {
  // UserAPIResponse reads the list from "players".
  players?: Record<string, unknown>[];
  paging?: { next?: unknown };
};

/** One API row, mapped the way Models/User.swift maps it. */
export function mapPerson(raw: Record<string, unknown>): Person {
  return {
    id: toInt(raw.id),
    name: toStr(raw.name),
    email: toStr(raw.email),
    username: toStr(raw.username),
    uniqueId: toInt(raw.unique_id),
    avatar: toStr(raw.avatar),
    rawJson: JSON.stringify(raw),
  };
}

export function usersRequestBody(userId: number, orgId: number, page: number) {
  return {
    count: PAGE_SIZE,
    page,
    organization_id: orgId,
    enc_user_id: rsaEncrypt(userId),
    timestamp: 0,
  };
}

/**
 * Everyone in an organisation. Always the full list (timestamp 0), so the
 * cache can drop people who have left; delta sync can come later.
 */
export async function fetchOrgUsers(userId: number, orgId: number): Promise<Person[]> {
  const people = await fetchAllPages(async page => {
    const response = await apiRequest<UsersPage>(ENDPOINTS.GET_ALL_USERS, {
      method: 'POST',
      body: usersRequestBody(userId, orgId, page),
    });
    return {
      items: (response.data?.players ?? []).map(mapPerson),
      next: toInt(response.data?.paging?.next),
    };
  });
  return people.filter(p => p.id > 0);
}

// ---- Organisation roles -------------------------------------------------

type OrgRolesPage = {
  organizations?: Record<string, unknown>[];
  paging?: { next?: unknown };
};

export function orgRolesRequestBody(userId: number, orgId: number, page: number) {
  return {
    count: PAGE_SIZE,
    page,
    enc_organization_id: rsaEncrypt(orgId),
    enc_user_id: rsaEncrypt(userId),
    timestamp: 0,
  };
}

/**
 * Everyone's role in an organisation (APIManager.getAllAssosiateOrganisation):
 * one organisation row per person, whose `id` is the organisation and
 * `role_id` that person's role in it. Always the full list.
 */
export async function fetchOrgRoles(
  userId: number,
  orgId: number,
): Promise<{ userId: number; roleId: number }[]> {
  const rows = await fetchAllPages(async page => {
    const response = await apiRequest<OrgRolesPage>(ENDPOINTS.GET_ORG_ROLES, {
      method: 'POST',
      body: orgRolesRequestBody(userId, orgId, page),
    });
    return {
      items: response.data?.organizations ?? [],
      next: toInt(response.data?.paging?.next),
    };
  });
  return rows
    .filter(row => toInt(row.id) === orgId && toInt(row.user_id) > 0 && toInt(row.role_id) > 0)
    .map(row => ({ userId: toInt(row.user_id), roleId: toInt(row.role_id) }));
}
