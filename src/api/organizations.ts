import { rsaEncrypt } from '../utils/rsa';
import { apiRequest } from './client';
import { ENDPOINTS } from './endpoints';
import type { Organization, RawOrganization } from './types';

// Organisations the signed-in user belongs to
// (APIManager.getAllOrganisation + CommonDataSyncManager.insertOrganisation in iOS).

/** Page size the iOS app uses for list endpoints (pageItemsCount). */
const PAGE_SIZE = 400;
/** Safety stop: never follow more pages than this. */
const MAX_PAGES = 50;

type OrganizationsPage = {
  organizations?: RawOrganization[];
  paging?: { next?: number };
};

const toInt = (value: unknown): number => {
  const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? n : 0;
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
  const all: Organization[] = [];
  let page = 1;
  for (let i = 0; i < MAX_PAGES; i++) {
    const response = await apiRequest<OrganizationsPage>(ENDPOINTS.GET_ALL_ORGANIZATIONS, {
      method: 'POST',
      body: {
        count: PAGE_SIZE,
        page,
        enc_user_id: rsaEncrypt(userId),
        timestamp: 0,
      },
    });
    for (const raw of response.data?.organizations ?? []) {
      all.push(mapOrganization(raw));
    }
    const next = toInt(response.data?.paging?.next);
    if (next <= page) {
      break;
    }
    page = next;
  }
  return all;
}
