import { rsaEncrypt } from '../utils/rsa';
import { apiRequest } from './client';
import { ENDPOINTS } from './endpoints';
import { fetchAllPages, toInt } from './paging';
import type { Organization, RawOrganization } from './types';

// Organisations the signed-in user belongs to
// (APIManager.getAllOrganisation + CommonDataSyncManager.insertOrganisation in iOS).

/** Page size the iOS app uses for list endpoints (pageItemsCount). */
const PAGE_SIZE = 400;

type OrganizationsPage = {
  organizations?: RawOrganization[];
  paging?: { next?: unknown };
};

/**
 * Converts one API row the way the iOS ObjectMapper mapping does:
 * org_id is `organization_id` when present, otherwise `id`; HOME orgs
 * (organization_type 2) are forced to role 3.
 */
export function mapOrganization(raw: RawOrganization): Organization {
  const organizationType = toInt(raw.organization_type);
  // ObjectMapper only overwrites the id-derived value when organization_id is a
  // real number; null, missing or a string keeps the value from `id`.
  const orgId = typeof raw.organization_id === 'number' ? raw.organization_id : toInt(raw.id);
  return {
    rowKey: raw.key === null || raw.key === undefined ? undefined : String(raw.key),
    orgId,
    name: String(raw.name ?? ''),
    userId: toInt(raw.user_id),
    roleId: organizationType === 2 ? 3 : toInt(raw.role_id),
    organizationType,
    uniqueNumber: String(raw.unique_number ?? ''),
    enableRecruiter: toInt(raw.enable_recruiter),
    isActive: toInt(raw.is_active),
    isDefault: raw.organization_is_default === true || toInt(raw.organization_is_default) === 1,
    // iOS maps parent_org_id into a String property, so only a JSON string is kept;
    // a number, null or missing value leaves it '' ("no parent"), exactly as on iOS.
    parentOrgId: typeof raw.parent_org_id === 'string' ? raw.parent_org_id : '',
  };
}

/** Fetches every page of the user's organisations. */
export async function fetchOrganizations(userId: number): Promise<Organization[]> {
  const encUserId = rsaEncrypt(userId);
  return fetchAllPages(async page => {
    const response = await apiRequest<OrganizationsPage>(ENDPOINTS.GET_ALL_ORGANIZATIONS, {
      method: 'POST',
      body: { count: PAGE_SIZE, page, enc_user_id: encUserId, timestamp: 0 },
    });
    return {
      items: (response.data?.organizations ?? []).map(mapOrganization),
      next: toInt(response.data?.paging?.next),
    };
  });
}
