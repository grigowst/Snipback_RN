import { UserRole, type Organization } from '../api/types';

// Organisation rules from the iOS app, as pure functions:
// HelperFunctions.swift (getUserDistintOrganisations, setCurrentOrg,
// getParentAndNonChildOrganisation, getChildOrganisation),
// BaseViewController.handleOrganisationsSynced and Models/OrgTreeNode.swift.

export const HOME_NAME = 'HOME';
export const ADD_ORG_ID = 0;
const ADD_ORG_NAME = '+ Add New Organisation';
const MAX_TREE_DEPTH = 25;

/** Characters iOS strips from organisation names (Constants.forbiddenCharacters2). */
const FORBIDDEN = /[<>"'`\\()/;{}$|&#%*^~!@_.]+/g;

/** String.sanitizedOrganizationName() in iOS. */
export function sanitizeOrgName(name: string): string {
  return name.replace(FORBIDDEN, ' ').replace(/\s+/g, ' ').trim();
}

/** The name shown for an organisation: "HOME" for the user's home org. */
export function orgDisplayName(org: Organization): string {
  return org.roleId === UserRole.HomeUser ? HOME_NAME : sanitizeOrgName(org.name);
}

const byName = (a: Organization, b: Organization) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

const mine = (orgs: Organization[], userId: number) => orgs.filter(o => o.userId === userId);

/**
 * getUserDistintOrganisations(): the first role-3 org (shown as HOME), then
 * every other org sorted by name. Extra role-3 rows are dropped, as on iOS.
 */
export function distinctOrganizations(orgs: Organization[], userId: number): Organization[] {
  const own = mine(orgs, userId);
  const homes = own.filter(o => o.roleId === UserRole.HomeUser).sort(byName);
  const others = own.filter(o => o.roleId !== UserRole.HomeUser).sort(byName);
  return homes.length > 0 ? [homes[0], ...others] : others;
}

export function homeOrganization(orgs: Organization[], userId: number): Organization | undefined {
  return mine(orgs, userId)
    .filter(o => o.roleId === UserRole.HomeUser)
    .sort(byName)[0];
}

/**
 * After a fresh sign-in (handleOrganisationsSynced): the org flagged as the
 * user's default (and not their HOME), otherwise the first distinct org.
 */
export function defaultOrgAfterLogin(
  orgs: Organization[],
  userId: number,
): Organization | undefined {
  const own = mine(orgs, userId);
  return (
    own.find(o => o.organizationType !== 2 && o.isDefault) ??
    distinctOrganizations(orgs, userId)[0]
  );
}

/**
 * On launch with a saved session (setCurrentOrg): the saved org if the user
 * still belongs to it, otherwise their HOME org.
 */
export function resolveSavedOrg(
  orgs: Organization[],
  userId: number,
  savedOrgId: number | undefined,
): Organization | undefined {
  const own = mine(orgs, userId);
  if (savedOrgId) {
    const match = own.find(o => o.orgId === savedOrgId);
    if (match) {
      return match;
    }
  }
  return own.find(o => o.roleId === UserRole.HomeUser);
}

// ---- Organisation tree (the dashboard's organisation picker) -------------

export type OrgTreeNode = {
  org: Organization;
  /** Display name: "HOME", the sanitised name, or the "+ Add" row. */
  label: string;
  depth: number;
  children: OrgTreeNode[];
};

function addOrgRow(): Organization {
  return {
    orgId: ADD_ORG_ID,
    name: ADD_ORG_NAME,
    userId: 0,
    roleId: 0,
    organizationType: 0,
    uniqueNumber: '',
    enableRecruiter: 0,
    isActive: 0,
    isDefault: false,
    parentOrgId: '',
    organizationCategory: 1,
  };
}

function buildNode(
  org: Organization,
  own: Organization[],
  depth: number,
  ancestors: Set<number>,
): OrgTreeNode {
  const label =
    org.orgId === ADD_ORG_ID ? org.name : depth === 0 && org.roleId === UserRole.HomeUser
      ? HOME_NAME
      : sanitizeOrgName(org.name);
  // A bad parent chain (a cycle or very deep data) must not recurse forever.
  if (org.orgId === ADD_ORG_ID || depth >= MAX_TREE_DEPTH || ancestors.has(org.orgId)) {
    return { org, label, depth, children: [] };
  }
  const next = new Set(ancestors).add(org.orgId);
  const children = own
    .filter(o => o.parentOrgId === String(org.orgId))
    .sort(byName)
    .map(child => buildNode(child, own, depth + 1, next));
  return { org, label, depth, children };
}

/**
 * buildOrgTree(): HOME, then top-level orgs (no parent) by name, with each
 * org's sub-orgs beneath it. A sub-org whose parent the user is not a member
 * of is shown at the top level so it can still be chosen. "+ Add New
 * Organisation" is the first row.
 */
export function buildOrgTree(orgs: Organization[], userId: number): OrgTreeNode[] {
  const own = mine(orgs, userId);
  const home = homeOrganization(orgs, userId);
  let roots = own
    .filter(o => o.parentOrgId === '' && o.roleId !== UserRole.HomeUser)
    .sort(byName);

  const present = new Set(own.map(o => o.orgId));
  const covered = new Set(roots.map(o => o.orgId));
  if (home) {
    covered.add(home.orgId);
  }
  const orphans = own.filter(o => {
    if (o.parentOrgId === '' || covered.has(o.orgId)) {
      return false;
    }
    const parentId = parseInt(o.parentOrgId, 10);
    return Number.isNaN(parentId) || !present.has(parentId);
  });
  if (orphans.length > 0) {
    roots = [...roots, ...orphans].sort(byName);
  }

  const top = home ? [home, ...roots] : roots;
  if (top.length === 0) {
    return [];
  }
  return [addOrgRow(), ...top].map(org => buildNode(org, own, 0, new Set()));
}
