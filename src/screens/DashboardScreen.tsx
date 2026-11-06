import React from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { colors } from '../theme';

/**
 * Placeholder home screen so the sign-in flow can be tested end to end.
 * Phase 2 replaces the body with the tile grid from DashboardViewController.
 */
export default function DashboardScreen() {
  const { user, signOut } = useAuth();

  const confirmSignOut = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Image
          source={require('../../assets/images/logo.png')}
          style={styles.headerLogo}
          resizeMode="contain"
          accessibilityLabel="Snipback AI"
        />
        <Pressable
          style={({ pressed }) => [styles.signOutButton, pressed && styles.pressed]}
          onPress={confirmSignOut}
          accessibilityRole="button"
        >
          <Text style={styles.signOutText}>LOG OUT</Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        <Text style={styles.welcome}>Welcome, {user?.name || 'Coach'}</Text>
        <Text style={styles.email}>{user?.email}</Text>
        <Text style={styles.note}>Dashboard tiles are built in the next step.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 64,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerLogo: {
    width: 120,
    height: 48,
  },
  signOutButton: {
    paddingHorizontal: 16,
    height: 36,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.themeRed,
    justifyContent: 'center',
  },
  signOutText: {
    color: colors.white,
    fontWeight: 'bold',
    fontSize: 13,
  },
  pressed: {
    opacity: 0.7,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  welcome: {
    color: colors.white,
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  email: {
    color: colors.lightGray,
    fontSize: 15,
    marginTop: 8,
  },
  note: {
    color: colors.midGray,
    fontSize: 13,
    marginTop: 32,
  },
});
