import { mapOrganization } from '../src/api/organizations';
import { UserRole, type Organization } from '../src/api/types';
import {
  buildOrgTree,
  defaultOrgAfterLogin,
  distinctOrganizations,
  orgDisplayName,
  resolveSavedOrg,
  sanitizeOrgName,
  type OrgTreeNode,
} from '../src/dashboard/orgLogic';

const USER_ID = 7;

function org(orgId: number, name: string, extra: Partial<Organization> = {}): Organization {
  return {
    orgId,
    name,
    userId: USER_ID,
    roleId: UserRole.Coach,
    organizationType: 1,
    uniqueNumber: '',
    enableRecruiter: 0,
    isActive: 1,
    isDefault: false,
    parentOrgId: '',
    organizationCategory: 1,
    ...extra,
  };
}

const HOME = org(1, 'Grigo Home', { roleId: UserRole.HomeUser, organizationType: 2 });

describe('mapOrganization (iOS Organization mapping)', () => {
  test('org id comes from organization_id, falling back to id', () => {
    expect(mapOrganization({ id: 5, organization_id: 9 }).orgId).toBe(9);
    expect(mapOrganization({ id: 5 }).orgId).toBe(5);
    expect(mapOrganization({ id: 5, organization_id: null }).orgId).toBe(5);
  });
  test('HOME organisations (type 2) are role 3', () => {
    expect(mapOrganization({ id: 1, organization_type: 2, role_id: 1 }).roleId).toBe(3);
  });
  test('parent_org_id is kept only when it is a string, as in iOS', () => {
    expect(mapOrganization({ id: 1, parent_org_id: '44' }).parentOrgId).toBe('44');
    expect(mapOrganization({ id: 1, parent_org_id: 44 }).parentOrgId).toBe('');
    expect(mapOrganization({ id: 1, parent_org_id: null }).parentOrgId).toBe('');
  });
  test('organization_is_default accepts true or 1', () => {
    expect(mapOrganization({ id: 1, organization_is_default: 1 }).isDefault).toBe(true);
    expect(mapOrganization({ id: 1, organization_is_default: true }).isDefault).toBe(true);
    expect(mapOrganization({ id: 1, organization_is_default: 0 }).isDefault).toBe(false);
  });
});

test('names are cleaned like sanitizedOrganizationName()', () => {
  expect(sanitizeOrgName("St. Mary's  (U14)")).toBe('St Mary s U14');
  expect(orgDisplayName(HOME)).toBe('HOME');
});

describe('distinctOrganizations', () => {
  test('HOME first, then the rest by name; other users and extra HOME rows dropped', () => {
    const orgs = [
      org(3, 'zeta'),
      org(2, 'Alpha'),
      HOME,
      org(4, 'Second home', { roleId: UserRole.HomeUser }),
      org(5, 'Not mine', { userId: 99 }),
    ];
    expect(distinctOrganizations(orgs, USER_ID).map(o => o.orgId)).toEqual([1, 2, 3]);
  });
});

describe('choosing the organisation', () => {
  test('after sign-in: the default org wins', () => {
    const orgs = [HOME, org(2, 'Alpha'), org(3, 'Beta', { isDefault: true })];
    expect(defaultOrgAfterLogin(orgs, USER_ID)?.orgId).toBe(3);
  });
  test('after sign-in: a default flag on HOME itself is ignored', () => {
    const home = { ...HOME, isDefault: true };
    const orgs = [home, org(2, 'Alpha')];
    // Falls back to the first distinct org, which is HOME anyway.
    expect(defaultOrgAfterLogin(orgs, USER_ID)?.orgId).toBe(1);
  });
  test('after sign-in with no default: the first distinct org (HOME)', () => {
    expect(defaultOrgAfterLogin([org(2, 'Alpha'), HOME], USER_ID)?.orgId).toBe(1);
  });
  test('on launch: the saved org, or HOME when it is gone', () => {
    const orgs = [HOME, org(2, 'Alpha')];
    expect(resolveSavedOrg(orgs, USER_ID, 2)?.orgId).toBe(2);
    expect(resolveSavedOrg(orgs, USER_ID, 999)?.orgId).toBe(1);
    expect(resolveSavedOrg(orgs, USER_ID, undefined)?.orgId).toBe(1);
  });
});

describe('buildOrgTree', () => {
  const labels = (nodes: OrgTreeNode[]): unknown[] =>
    nodes.map(n => (n.children.length ? [n.label, labels(n.children)] : n.label));

  test('add row, HOME, then top-level orgs with their sub-orgs', () => {
    const orgs = [
      org(10, 'Zulu Club'),
      org(11, 'Zulu U12', { parentOrgId: '10' }),
      org(12, 'Zulu U10', { parentOrgId: '10' }),
      org(20, 'Alpha Club'),
      HOME,
    ];
    expect(labels(buildOrgTree(orgs, USER_ID))).toEqual([
      '+ Add New Organisation',
      'HOME',
      'Alpha Club',
      ['Zulu Club', ['Zulu U10', 'Zulu U12']],
    ]);
  });

  test('a sub-org whose parent the user is not in is shown at the top level', () => {
    const orgs = [HOME, org(20, 'Alpha'), org(31, 'Lifting 2', { parentOrgId: '30' })];
    expect(labels(buildOrgTree(orgs, USER_ID))).toEqual([
      '+ Add New Organisation',
      'HOME',
      'Alpha',
      'Lifting 2',
    ]);
  });

  test('a parent chain that loops back stops instead of recursing forever', () => {
    const orgs = [org(1, 'Root'), org(2, 'Child', { parentOrgId: '1' }), org(1, 'Loop', { parentOrgId: '2' })];
    const tree = buildOrgTree(orgs, USER_ID);
    const root = tree.find(n => n.label === 'Root')!;
    expect(root.children[0].label).toBe('Child');
    expect(root.children[0].children[0].children).toEqual([]);
  });

  test('no organisations: an empty tree (no add row)', () => {
    expect(buildOrgTree([], USER_ID)).toEqual([]);
  });
});
