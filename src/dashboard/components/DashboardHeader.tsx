import React, { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { User } from '../../api/types';
import { colors } from '../../theme';

// The dashboard's top bar: logo, organisation selector ("ORG | Name"),
// notification bell, avatar and the device's number.

type Props = {
  isTablet: boolean;
  user: User | null;
  /** "HOME" or the selected organisation's name; null while loading. */
  orgName: string | null;
  isLoading: boolean;
  onOrgPress: () => void;
  onBellPress: () => void;
  onAvatarPress: () => void;
};

function Avatar({ user, onPress }: { user: User | null; onPress: () => void }) {
  const [failed, setFailed] = useState(false);
  const uri = user?.avatar && !failed ? user.avatar : null;
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel="My Profile">
      <Image
        source={uri ? { uri } : require('../../../assets/images/dashboard/dp.png')}
        style={styles.avatar}
        onError={() => setFailed(true)}
      />
    </Pressable>
  );
}

export default function DashboardHeader({
  isTablet,
  user,
  orgName,
  isLoading,
  onOrgPress,
  onBellPress,
  onAvatarPress,
}: Props) {
  const orgSelector = (
    <Pressable
      style={({ pressed }) => [
        styles.orgSelector,
        isTablet ? styles.orgSelectorTablet : styles.orgSelectorPhone,
        pressed && styles.pressed,
      ]}
      onPress={onOrgPress}
      disabled={isLoading && !orgName}
      accessibilityRole="button"
      accessibilityLabel="Change organization"
    >
      <Text style={styles.orgText} numberOfLines={1}>
        <Text style={styles.orgName}>{orgName ?? 'Loading…'}</Text>
        {user?.name ? <Text style={styles.userName}>{` | ${user.name}`}</Text> : null}
      </Text>
      {isLoading ? (
        <ActivityIndicator color={colors.themeRed} size="small" />
      ) : (
        <Image source={require('../../../assets/images/dashboard/down_arrow.png')} style={styles.arrow} />
      )}
    </Pressable>
  );

  const rightCluster = (
    <View style={styles.rightCluster}>
      <View style={styles.iconRow}>
        <Pressable
          onPress={onBellPress}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          style={styles.bellButton}
        >
          <Image source={require('../../../assets/images/dashboard/bell.png')} style={styles.bell} />
        </Pressable>
        <Avatar user={user} onPress={onAvatarPress} />
      </View>
      {user?.unique_id ? <Text style={styles.deviceId}>#{user.unique_id}</Text> : null}
    </View>
  );

  const logo = (
    <Image
      source={require('../../../assets/images/logo.png')}
      style={isTablet ? styles.logoTablet : styles.logoPhone}
      resizeMode="contain"
      accessibilityLabel="Snipback AI"
    />
  );

  if (isTablet) {
    return (
      <View style={[styles.bar, styles.barTablet]}>
        {logo}
        {orgSelector}
        <View style={styles.spacer} />
        {rightCluster}
      </View>
    );
  }

  return (
    <View>
      <View style={[styles.bar, styles.barPhone]}>
        {logo}
        <View style={styles.spacer} />
        {rightCluster}
      </View>
      <View style={styles.phoneOrgRow}>{orgSelector}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  barTablet: {
    height: 110,
    paddingHorizontal: 24,
    gap: 20,
  },
  barPhone: {
    height: 80,
    paddingHorizontal: 20,
  },
  logoTablet: {
    width: 220,
    height: 90,
  },
  logoPhone: {
    width: 170,
    height: 70,
  },
  spacer: {
    flex: 1,
  },
  orgSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: 10,
  },
  orgSelectorTablet: {
    flexShrink: 1,
    width: 450,
    minWidth: 200,
  },
  orgSelectorPhone: {
    alignSelf: 'stretch',
  },
  phoneOrgRow: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  orgText: {
    flex: 1,
    fontSize: 16,
  },
  orgName: {
    color: colors.themeRed,
    fontWeight: 'bold',
  },
  userName: {
    color: colors.white,
    fontWeight: 'bold',
  },
  arrow: {
    width: 16,
    height: 16,
    tintColor: colors.white,
  },
  pressed: {
    opacity: 0.7,
  },
  rightCluster: {
    alignItems: 'flex-end',
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  bellButton: {
    padding: 2,
  },
  bell: {
    width: 26,
    height: 26,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
  },
  deviceId: {
    marginTop: 4,
    color: colors.themeRed,
    fontSize: 12,
    fontStyle: 'italic',
  },
});
