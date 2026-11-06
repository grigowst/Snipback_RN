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
import type { User } from '../api/types';
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
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('restoring');
  const [user, setUser] = useState<User | null>(null);
  const forceUpdateShown = useRef(false);

  const signOut = useCallback(async () => {
    // TODO(phase 3): sign out of Firebase Auth and clear the local data store.
    setAuthToken(null);
    setUser(null);
    setStatus('signedOut');
    await clearSession();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const signedInUser = await login(email, password);
    await saveSession({ token: signedInUser.token, user: signedInUser });
    setAuthToken(signedInUser.token);
    setUser(signedInUser);
    setStatus('signedIn');
    // TODO(phase 3): Firebase custom-token sign-in, getMyProfile and the
    // org → users → teams → tags sync, as the iOS splash runs after sign-in.
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

  const value = useMemo(
    () => ({ status, user, signIn, signOut }),
    [status, user, signIn, signOut],
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
