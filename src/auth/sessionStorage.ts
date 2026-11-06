import * as Keychain from 'react-native-keychain';
import type { User } from '../api/types';

// The signed-in user and token are kept in the Keychain (iOS) / Keystore
// (Android). The iOS app keeps them in UserDefaults, which device backups
// copy in clear; see the README findings in snipback-module-guides.

const SERVICE = 'com.hipoint.snipback.session';

export type StoredSession = {
  token: string;
  user: User;
  /** The organisation chosen on the dashboard (user.organizationId in iOS). */
  selectedOrgId?: number;
};

export async function saveSession(session: StoredSession): Promise<void> {
  await Keychain.setGenericPassword('session', JSON.stringify(session), {
    service: SERVICE,
    accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
}

export async function loadSession(): Promise<StoredSession | null> {
  try {
    const credentials = await Keychain.getGenericPassword({ service: SERVICE });
    if (!credentials) {
      return null;
    }
    const session = JSON.parse(credentials.password) as StoredSession;
    return session.token && session.user ? session : null;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await Keychain.resetGenericPassword({ service: SERVICE });
}
