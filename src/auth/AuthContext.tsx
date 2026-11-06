import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert } from 'react-native';
import { login } from '../api/auth';
import { setApiEventHandlers, setAuthToken } from '../api/client';
import { fetchProfile } from '../api/profile';
import type { User } from '../api/types';
import { clearStore } from '../db/store';
import { clearSession, loadSession, saveSession } from './sessionStorage';

// Owns the signed-in state. The navigator reads `status` to choose between
// Splash, Login and the signed-in screens, like startApp() / showLogin() /
// showHome() in the iOS BaseViewController.

/** The iOS splash waits one second before routing (splashWaitingTime). */
const SPLASH_MIN_MS = 1000;

export type AuthStatus = 'restoring' | 'signedOut' | 'signedIn';

type AuthContextValue = {
  status: AuthStatus;
  user: User | null;
  /** True when this session began with a sign-in (not restored at launch). */
  isFreshSignIn: boolean;
  /** Saved organisation choice; undefined until one is made. */
  selectedOrgId: number | undefined;
  setSelectedOrgId: (orgId: number) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** Empties the local store; a failure here must not block signing in or out. */
function clearLocalData() {
  try {
    clearStore();
  } catch (e) {
    console.warn('Could not clear the local store', e);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('restoring');
  const [user, setUser] = useState<User | null>(null);
  const [isFreshSignIn, setIsFreshSignIn] = useState(false);
  const [selectedOrgId, setSelectedOrgIdState] = useState<number | undefined>(undefined);
  const forceUpdateShown = useRef(false);

  const signOut = useCallback(async () => {
    // TODO: sign out of Firebase Auth once Firebase is added.
    // Signed-out state first, so the dashboard unmounts before its data goes.
    setAuthToken(null);
    setUser(null);
    setSelectedOrgIdState(undefined);
    setIsFreshSignIn(false);
    setStatus('signedOut');
    await clearSession();
    clearLocalData();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const signedInUser = await login(email, password);
    // Never show one account's cached data to another.
    clearLocalData();
    await saveSession({ token: signedInUser.token, user: signedInUser });
    setAuthToken(signedInUser.token);
    setUser(signedInUser);
    setSelectedOrgIdState(undefined);
    setIsFreshSignIn(true);
    setStatus('signedIn');
    // TODO: Firebase custom-token sign-in, as the iOS splash does after sign-in.
  }, []);

  // Restore a saved session on launch.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [session] = await Promise.all([loadSession(), wait(SPLASH_MIN_MS)]);
      if (cancelled) {
        return;
      }
      if (session) {
        setAuthToken(session.token);
        setUser(session.user);
        setSelectedOrgIdState(session.selectedOrgId);
        setIsFreshSignIn(false);
        setStatus('signedIn');
      } else {
        setStatus('signedOut');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // App-wide API responses: 401 signs out, 308 asks for an update.
  useEffect(() => {
    setApiEventHandlers({
      onUnauthorized: () => {
        signOut();
      },
      onForceUpdate: () => {
        if (forceUpdateShown.current) {
          return;
        }
        forceUpdateShown.current = true;
        // TODO: open the store listing once the RN app has one.
        Alert.alert(
          'Update',
          "We've just released a new update for our app. Please download it to keep using Snipback.",
        );
      },
    });
  }, [signOut]);

  // Refresh the profile once signed in (CommonDataSyncManager.getMyProfile in
  // iOS). Like iOS, only `is_terms_accepted` and `organization` are taken from
  // it: the profile answer leaves out fields the sign-in gave (e.g. unique_id),
  // so merging it whole would wipe them.
  const userId = status === 'signedIn' ? user?.id : undefined;
  useEffect(() => {
    if (!userId) {
      return;
    }
    let cancelled = false;
    fetchProfile(userId)
      .then(async profile => {
        if (cancelled || !profile || profile.id !== userId) {
          return;
        }
        const session = await loadSession();
        if (cancelled || !session || session.user.id !== userId) {
          return;
        }
        const updated: User = {
          ...session.user,
          is_terms_accepted: profile.is_terms_accepted ?? session.user.is_terms_accepted,
          organization: profile.organization ?? session.user.organization,
        };
        await saveSession({ ...session, user: updated });
        setUser(updated);
      })
      .catch(() => {
        // Offline or failed: keep the saved profile.
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const setSelectedOrgId = useCallback(
    async (orgId: number) => {
      setSelectedOrgIdState(orgId);
      const session = await loadSession();
      if (session) {
        await saveSession({ ...session, selectedOrgId: orgId });
      }
    },
    [],
  );

  const value = useMemo(
    () => ({
      status,
      user,
      isFreshSignIn,
      selectedOrgId,
      setSelectedOrgId,
      signIn,
      signOut,
    }),
    [status, user, isFreshSignIn, selectedOrgId, setSelectedOrgId, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>.');
  }
  return context;
}
