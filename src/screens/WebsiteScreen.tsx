import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { createWebsiteLink } from '../api/website';
import { useAuth } from '../auth/AuthContext';
import { useOrganizations } from '../dashboard/OrganizationsContext';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { colors } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Website'>;

// The package declares WebView<P = undefined> with props `WebViewProps & P`,
// which strict TypeScript reduces to never; an object P avoids that.
type Web = WebView<object>;

/**
 * A signed-in page of the Snipback website, inside the app (WebViewController
 * in iOS): the team pages for TEAMS and the hub's Members, the user pages for
 * USERS. A new one-time link is requested every time the screen opens.
 */
export default function WebsiteScreen({ route }: Props) {
  const { tab } = route.params;
  const { user } = useAuth();
  const { selectedOrg } = useOrganizations();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const webView = useRef<Web>(null);
  const canGoBack = useRef(false);

  const userId = user?.id;
  const token = user?.token;
  const orgId = selectedOrg?.orgId;

  useEffect(() => {
    setUrl(null);
    setError(null);
    if (!userId || !token || orgId === undefined) {
      return;
    }
    let cancelled = false;
    createWebsiteLink({ userId, orgId, token, tab })
      .then(link => {
        if (!cancelled) {
          setUrl(link);
        }
      })
      .catch(e => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Unable to open the website.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId, token, orgId, tab, attempt]);

  // Android's back button goes back inside the website first.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack.current) {
        webView.current?.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, []);

  const retry = useCallback(() => setAttempt(a => a + 1), []);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
        <Pressable
          onPress={retry}
          style={styles.retry}
          accessibilityRole="button"
          accessibilityLabel="Try again"
        >
          <Text style={styles.retryText}>TRY AGAIN</Text>
        </Pressable>
      </View>
    );
  }

  if (!url) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.white} size="large" accessibilityLabel="Loading website" />
      </View>
    );
  }

  return (
    <WebView<object>
      ref={webView}
      source={{ uri: url }}
      style={styles.web}
      startInLoadingState
      renderLoading={() => (
        <View style={[styles.center, StyleSheet.absoluteFill]}>
          <ActivityIndicator color={colors.white} size="large" />
        </View>
      )}
      onNavigationStateChange={state => {
        canGoBack.current = state.canGoBack;
      }}
      onError={() => setError('The website could not be loaded. Check your internet connection.')}
    />
  );
}

const styles = StyleSheet.create({
  web: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.background,
  },
  error: {
    color: colors.lightGray,
    fontSize: 15,
    textAlign: 'center',
  },
  retry: {
    marginTop: 16,
    paddingHorizontal: 22,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.themeRed,
    justifyContent: 'center',
  },
  retryText: {
    color: colors.white,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
});
