import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { fetchTeams } from '../api/teams';
import { fetchOrgRoles, fetchOrgUsers } from '../api/users';
import { useAuth } from '../auth/AuthContext';
import { readTeams, replaceOrgRoles, replaceOrgUsers, replaceTeams } from '../db/repositories';
import { useOrganizations } from './OrganizationsContext';
import { ALL_TEAMS, keepOrDefaultTeam, teamPickerList, type TeamChoice } from './teamLogic';

// The selected organisation's teams and the team chosen in the phone
// header's team picker. Cached teams show at once; the server list replaces
// them. The team choice is kept in memory only and resets when the
// organisation changes, as in iOS.
//
// The organisation's users list and everyone's organisation role are synced
// here too (getAllUsers and getAllAssosiateOrganisation in the iOS launch
// sync). Screens read them from the store; `rosterVersion` changes whenever
// teams, users or roles are rewritten, so they know to read again.

type TeamsContextValue = {
  /** "Org - All Teams" first, then the organisation's active teams. */
  teams: TeamChoice[];
  selectedTeam: TeamChoice;
  selectTeam: (team: TeamChoice) => void;
  isSyncing: boolean;
  error: string | null;
  /** Bumped after each teams, users or roles write for the selected organisation. */
  rosterVersion: number;
  /** Fetches teams, users and roles again (after a member change); keeps the team choice. */
  refresh: () => void;
  /**
   * Tells the screens the store changed (a change already written locally):
   * the team list is read again from the store, and rosterVersion moves on.
   */
  rosterChanged: () => void;
};

const TeamsContext = createContext<TeamsContextValue | null>(null);

export function TeamsProvider({ children }: { children: React.ReactNode }) {
  const { status: authStatus, user } = useAuth();
  const { selectedOrg, homeOrgId } = useOrganizations();
  const [teams, setTeams] = useState<TeamChoice[]>([ALL_TEAMS]);
  const [selectedTeam, setSelectedTeam] = useState<TeamChoice>(ALL_TEAMS);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rosterVersion, setRosterVersion] = useState(0);
  const bumpRoster = useCallback(() => setRosterVersion(v => v + 1), []);
  // Bumped by refresh(): runs the syncs again without the organisation reset.
  const [syncNonce, setSyncNonce] = useState(0);
  const refresh = useCallback(() => setSyncNonce(n => n + 1), []);

  const userId = authStatus === 'signedIn' ? user?.id : undefined;
  const orgId = selectedOrg?.orgId;
  const isHomeOrg = orgId !== undefined && orgId === homeOrgId;

  // The org whose teams are on screen; a late answer for another org is ignored.
  const currentOrg = useRef<number | undefined>(undefined);
  // A team the user picked. Only that survives a refresh; otherwise the
  // default rule runs again on each list (an empty cache must not pin
  // "All Teams" before the server's list arrives).
  const userChoice = useRef<number | undefined>(undefined);

  const apply = useCallback((list: TeamChoice[], forOrg: number, isHome: boolean) => {
    if (currentOrg.current !== forOrg) {
      return;
    }
    setTeams(list);
    setSelectedTeam(keepOrDefaultTeam(list, userChoice.current, isHome));
  }, []);

  // A new organisation: start from its cached teams and default team.
  useEffect(() => {
    currentOrg.current = orgId;
    userChoice.current = undefined; // a new organisation starts from its default team
    setTeams([ALL_TEAMS]);
    setSelectedTeam(ALL_TEAMS);
    setError(null);
    if (!userId || !orgId) {
      return;
    }
    try {
      apply(teamPickerList(readTeams(orgId)), orgId, isHomeOrg);
    } catch {
      // No cache to show; the server answer below fills it.
    }
  }, [userId, orgId, isHomeOrg, apply]);

  // The server's teams: on a new organisation, and again on refresh().
  useEffect(() => {
    if (!userId || !orgId) {
      return;
    }
    let cancelled = false;
    setError(null);
    setIsSyncing(true);
    fetchTeams(userId, orgId)
      .then(fresh => {
        if (cancelled) {
          return;
        }
        replaceTeams(orgId, fresh);
        apply(teamPickerList(readTeams(orgId)), orgId, isHomeOrg);
        bumpRoster();
      })
      .catch(e => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Unable to load teams.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsSyncing(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId, orgId, isHomeOrg, apply, bumpRoster, syncNonce]);

  // The users list. A failure keeps the cached list and is not shown (the
  // teams sync already reports being offline); the screens that use it fall
  // back to what the team rosters carry.
  useEffect(() => {
    if (!userId || !orgId) {
      return;
    }
    let cancelled = false;
    fetchOrgUsers(userId, orgId)
      .then(people => {
        if (!cancelled) {
          replaceOrgUsers(orgId, people);
          bumpRoster();
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId, orgId, bumpRoster, syncNonce]);

  // Everyone's organisation role (the member editor needs it). Like the users
  // list, a failure keeps the cache and is not shown.
  useEffect(() => {
    if (!userId || !orgId) {
      return;
    }
    let cancelled = false;
    fetchOrgRoles(userId, orgId)
      .then(roles => {
        if (!cancelled) {
          replaceOrgRoles(orgId, roles);
          bumpRoster();
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId, orgId, bumpRoster, syncNonce]);

  const rosterChanged = useCallback(() => {
    const forOrg = currentOrg.current;
    if (forOrg !== undefined) {
      try {
        apply(teamPickerList(readTeams(forOrg)), forOrg, isHomeOrg);
      } catch {
        // Nothing cached to show; the next sync fills it.
      }
    }
    bumpRoster();
  }, [apply, bumpRoster, isHomeOrg]);

  const selectTeam = useCallback((team: TeamChoice) => {
    userChoice.current = team.id;
    setSelectedTeam(team);
  }, []);

  const value = useMemo(
    () => ({
      teams,
      selectedTeam,
      selectTeam,
      isSyncing,
      error,
      rosterVersion,
      refresh,
      rosterChanged,
    }),
    [teams, selectedTeam, selectTeam, isSyncing, error, rosterVersion, refresh, rosterChanged],
  );

  return <TeamsContext.Provider value={value}>{children}</TeamsContext.Provider>;
}

export function useTeams(): TeamsContextValue {
  const context = useContext(TeamsContext);
  if (!context) {
    throw new Error('useTeams must be used inside <TeamsProvider>.');
  }
  return context;
}
