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
import { useAuth } from '../auth/AuthContext';
import { readTeams, replaceTeams } from '../db/repositories';
import { useOrganizations } from './OrganizationsContext';
import { ALL_TEAMS, keepOrDefaultTeam, teamPickerList, type TeamChoice } from './teamLogic';

// The selected organisation's teams and the team chosen in the phone
// header's team picker. Cached teams show at once; the server list replaces
// them. The team choice is kept in memory only and resets when the
// organisation changes, as in iOS.

type TeamsContextValue = {
  /** "Org - All Teams" first, then the organisation's active teams. */
  teams: TeamChoice[];
  selectedTeam: TeamChoice;
  selectTeam: (team: TeamChoice) => void;
  isSyncing: boolean;
  error: string | null;
};

const TeamsContext = createContext<TeamsContextValue | null>(null);

export function TeamsProvider({ children }: { children: React.ReactNode }) {
  const { status: authStatus, user } = useAuth();
  const { selectedOrg, homeOrgId } = useOrganizations();
  const [teams, setTeams] = useState<TeamChoice[]>([ALL_TEAMS]);
  const [selectedTeam, setSelectedTeam] = useState<TeamChoice>(ALL_TEAMS);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    let cancelled = false;
    setIsSyncing(true);
    fetchTeams(userId, orgId)
      .then(fresh => {
        if (cancelled) {
          return;
        }
        replaceTeams(orgId, fresh);
        apply(teamPickerList(readTeams(orgId)), orgId, isHomeOrg);
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
  }, [userId, orgId, isHomeOrg, apply]);

  const selectTeam = useCallback((team: TeamChoice) => {
    userChoice.current = team.id;
    setSelectedTeam(team);
  }, []);

  const value = useMemo(
    () => ({ teams, selectedTeam, selectTeam, isSyncing, error }),
    [teams, selectedTeam, selectTeam, isSyncing, error],
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
