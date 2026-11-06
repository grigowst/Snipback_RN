import React from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { ACTIVE_ENVIRONMENT, REPORTED_APP_VERSION } from '../config/environment';
import { useOrganizations } from '../dashboard/OrganizationsContext';
import { orgDisplayName } from '../dashboard/orgLogic';
import { colors } from '../theme';
import { getAppVersion, getBuildNumber } from '../utils/device';

/**
 * A first, minimal Settings screen (SettingsViewController in iOS): the
 * account, the selected organisation, the app version and Log Out.
 */
export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const { selectedOrg } = useOrganizations();
  const reported = REPORTED_APP_VERSION[Platform.OS === 'ios' ? 'ios' : 'android'];
  const reportedVersion = reported
    ? `${reported.version} (${reported.build})`
    : `${getAppVersion()} (${getBuildNumber()})`;

  const confirmLogOut = () => {
    // TODO(phase 5): iOS warns first when uploads are still pending (hasUploads()).
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Section title="ACCOUNT">
          <Row label="Name" value={user?.name} />
          <Row label="Email" value={user?.email} />
          {user?.username ? <Row label="Username" value={user.username} /> : null}
        </Section>

        <Section title="ORGANIZATION">
          <Row label="Current" value={selectedOrg ? orgDisplayName(selectedOrg) : '—'} />
        </Section>

        <Section title="APP">
          {/* The version the server sees (REPORTED_APP_VERSION), then this app's own build. */}
          <Row label="Version" value={reportedVersion} />
          <Row label="RN build" value={`${getAppVersion()} (${getBuildNumber()})`} />
          <Row label="Server" value={ACTIVE_ENVIRONMENT} />
        </Section>

        <Pressable
          style={({ pressed }) => [styles.logOut, pressed && styles.pressed]}
          onPress={confirmLogOut}
          accessibilityRole="button"
        >
          <Text style={styles.logOutText}>LOG OUT</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>
        {value || '—'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    padding: 20,
    gap: 24,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    color: colors.midGray,
    fontSize: 12,
    letterSpacing: 1.5,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingHorizontal: 16,
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLabel: {
    color: colors.white,
    fontSize: 15,
  },
  rowValue: {
    flexShrink: 1,
    color: colors.lightGray,
    fontSize: 15,
  },
  logOut: {
    height: 52,
    borderRadius: 6,
    backgroundColor: colors.themeRed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logOutText: {
    color: colors.white,
    fontWeight: 'bold',
    fontSize: 16,
  },
  pressed: {
    opacity: 0.7,
  },
});
