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
