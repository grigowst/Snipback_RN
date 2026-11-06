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
import { readOrganizations, replaceOrganizations } from '../db/repositories';
import { defaultOrgAfterLogin, homeOrganization, resolveSavedOrg } from './orgLogic';

// The signed-in user's organisations and the one selected on the dashboard.
// The cached list (Realm) shows at once, so the dashboard opens offline; the
// server list then replaces it.

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

type OrganizationsContextValue = {
  /** 'ready' whenever there is something to show, cached or fresh. */
  status: LoadStatus;
  /** The last sync's error, also set while cached data is shown. */
  error: string | null;
  /** True while the server list is being fetched. */
  isSyncing: boolean;
  organizations: Organization[];
  selectedOrg: Organization | undefined;
  homeOrgId: number;
  selectOrg: (org: Organization) => void;
  refresh: () => void;
};

const OrganizationsContext = createContext<OrganizationsContextValue | null>(null);

const message = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export function OrganizationsProvider({ children }: { children: React.ReactNode }) {
  const { status: authStatus, user, isFreshSignIn, selectedOrgId, setSelectedOrgId } = useAuth();
  const [status, setStatus] = useState<LoadStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);

  // Read the latest values inside load() without re-running it when they change.
  const latest = useRef({ isFreshSignIn, selectedOrgId, setSelectedOrgId });
  latest.current = { isFreshSignIn, selectedOrgId, setSelectedOrgId };
  // Bumped by every load and on sign-out, so an answer that arrives later
  // (e.g. after logout cleared the store) writes nothing.
  const generation = useRef(0);
  const invalidateLoads = useCallback(() => {
    generation.current += 1;
  }, []);

  const userId = authStatus === 'signedIn' ? user?.id : undefined;

  const load = useCallback(async () => {
    if (!userId) {
      return;
    }
    const gen = ++generation.current;
    const isCurrent = () => generation.current === gen;
    const choose = async (orgs: Organization[], fromServer: boolean) => {
      const current = latest.current;
      let chosen: Organization | undefined;
      if (current.isFreshSignIn && current.selectedOrgId === undefined) {
        // After a sign-in the default org is picked from the server's list only.
        chosen = fromServer ? defaultOrgAfterLogin(orgs, userId) : undefined;
      } else {
        chosen = resolveSavedOrg(orgs, userId, current.selectedOrgId);
      }
      if (chosen && chosen.orgId !== current.selectedOrgId) {
        await current.setSelectedOrgId(chosen.orgId);
      }
    };

    // 1. The cache.
    let cached: Organization[] = [];
    try {
      cached = readOrganizations(userId);
    } catch (e) {
      setError(message(e, 'Unable to read saved organizations.'));
    }
    if (cached.length > 0) {
      setOrganizations(cached);
      await choose(cached, false);
      if (!isCurrent()) {
        return;
      }
      setStatus('ready');
    } else {
      setStatus('loading');
    }

    // 2. The server.
    setIsSyncing(true);
    try {
      const fresh = await fetchOrganizations(userId);
      if (!isCurrent()) {
        return;
      }
      replaceOrganizations(userId, fresh);
      const stored = readOrganizations(userId);
      setOrganizations(stored);
      await choose(stored, true);
      if (!isCurrent()) {
        return;
      }
      setError(null);
      setStatus('ready');
    } catch (e) {
      if (!isCurrent()) {
        return;
      }
      setError(message(e, 'Unable to load your organizations.'));
      setStatus(cached.length > 0 ? 'ready' : 'error');
    } finally {
      if (isCurrent()) {
        setIsSyncing(false);
      }
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      load();
    } else {
      setOrganizations([]);
      setStatus('idle');
      setError(null);
      setIsSyncing(false);
    }
    return invalidateLoads;
  }, [userId, load, invalidateLoads]);

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
      isSyncing,
      organizations,
      selectedOrg,
      homeOrgId: home?.orgId ?? 0,
      selectOrg,
      refresh: load,
    };
  }, [status, error, isSyncing, organizations, selectedOrgId, userId, selectOrg, load]);

  return <OrganizationsContext.Provider value={value}>{children}</OrganizationsContext.Provider>;
}

export function useOrganizations(): OrganizationsContextValue {
  const context = useContext(OrganizationsContext);
  if (!context) {
    throw new Error('useOrganizations must be used inside <OrganizationsProvider>.');
  }
  return context;
}
