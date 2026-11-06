import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { fetchOrganizations } from '../api/organizations';
import type { Organization } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { defaultOrgAfterLogin, homeOrganization, resolveSavedOrg } from './orgLogic';

// The signed-in user's organisations and the one selected on the dashboard.
// Loaded from the API each launch; a local store comes in phase 3.

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

type OrganizationsContextValue = {
  status: LoadStatus;
  error: string | null;
  organizations: Organization[];
  selectedOrg: Organization | undefined;
  homeOrgId: number;
  selectOrg: (org: Organization) => void;
  refresh: () => void;
};

const OrganizationsContext = createContext<OrganizationsContextValue | null>(null);

export function OrganizationsProvider({ children }: { children: React.ReactNode }) {
  const { status: authStatus, user, isFreshSignIn, selectedOrgId, setSelectedOrgId } = useAuth();
  const [status, setStatus] = useState<LoadStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);

  // Read the latest values inside load() without re-running it when they change.
  const latest = useRef({ isFreshSignIn, selectedOrgId, setSelectedOrgId });
  latest.current = { isFreshSignIn, selectedOrgId, setSelectedOrgId };

  const userId = authStatus === 'signedIn' ? user?.id : undefined;

  const load = useCallback(async () => {
    if (!userId) {
      return;
    }
    setStatus('loading');
    setError(null);
    try {
      const orgs = await fetchOrganizations(userId);
      const current = latest.current;
      // First load after a sign-in picks the default org; later launches
      // keep the saved choice (falling back to HOME).
      const chosen =
        current.isFreshSignIn && current.selectedOrgId === undefined
          ? defaultOrgAfterLogin(orgs, userId)
          : resolveSavedOrg(orgs, userId, current.selectedOrgId);
      setOrganizations(orgs);
      if (chosen && chosen.orgId !== current.selectedOrgId) {
        await current.setSelectedOrgId(chosen.orgId);
      }
      setStatus('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load your organisations.');
      setStatus('error');
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      load();
    } else {
      setOrganizations([]);
      setStatus('idle');
      setError(null);
    }
  }, [userId, load]);

  const selectOrg = useCallback(
    (org: Organization) => {
      setSelectedOrgId(org.orgId);
    },
    [setSelectedOrgId],
  );

  const value = useMemo<OrganizationsContextValue>(() => {
    const selectedOrg = userId
      ? organizations.find(o => o.userId === userId && o.orgId === selectedOrgId)
      : undefined;
    const home = userId ? homeOrganization(organizations, userId) : undefined;
    return {
      status,
      error,
      organizations,
      selectedOrg,
      homeOrgId: home?.orgId ?? 0,
      selectOrg,
      refresh: load,
    };
  }, [status, error, organizations, selectedOrgId, userId, selectOrg, load]);

  return <OrganizationsContext.Provider value={value}>{children}</OrganizationsContext.Provider>;
}

export function useOrganizations(): OrganizationsContextValue {
  const context = useContext(OrganizationsContext);
  if (!context) {
    throw new Error('useOrganizations must be used inside <OrganizationsProvider>.');
  }
  return context;
}
