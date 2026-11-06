import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import DashboardHeader from '../dashboard/components/DashboardHeader';
import OrgPickerModal from '../dashboard/components/OrgPickerModal';
import TeamPickerModal from '../dashboard/components/TeamPickerModal';
import TileGrid from '../dashboard/components/TileGrid';
import { useOrganizations } from '../dashboard/OrganizationsContext';
import { useTeams } from '../dashboard/TeamsContext';
import { buildOrgTree, orgDisplayName } from '../dashboard/orgLogic';
import { buildDashboardTiles, type DashboardTile } from '../dashboard/tiles';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { colors } from '../theme';
import { isTablet as deviceIsTablet } from '../utils/device';

type Navigation = NativeStackNavigationProp<RootStackParamList, 'Dashboard'>;

/** The home screen: DashboardViewController in iOS. */
export default function DashboardScreen() {
  const navigation = useNavigation<Navigation>();
  const { user } = useAuth();
  const { status, error, isSyncing, organizations, selectedOrg, homeOrgId, selectOrg, refresh } =
    useOrganizations();
  const { teams, selectedTeam, selectTeam, isSyncing: teamsSyncing } = useTeams();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [teamPickerOpen, setTeamPickerOpen] = useState(false);

  // Tile set by device class, not window size: an iPad in Split View keeps the iPad tiles.
  const isTablet = useMemo(() => deviceIsTablet(), []);
  const userId = user?.id ?? 0;

  const isHomeOrg = selectedOrg !== undefined && selectedOrg.orgId === homeOrgId;
  // The team picker is a phone feature, hidden in HOME (teamFilterView in iOS).
  const showTeamPicker = !isTablet && selectedOrg !== undefined && !isHomeOrg;

  const tiles = useMemo(
    () =>
      buildDashboardTiles({
        isTablet,
        userId,
        organizations,
        selectedOrg,
        homeOrgId,
        selectedTeamId: showTeamPicker ? selectedTeam.id : undefined,
      }),
    [isTablet, userId, organizations, selectedOrg, homeOrgId, showTeamPicker, selectedTeam.id],
  );
  const tree = useMemo(() => buildOrgTree(organizations, userId), [organizations, userId]);

  const openTile = (tile: DashboardTile) => {
    if (tile.type === 'SETTINGS') {
      navigation.navigate('Settings');
    } else if (tile.type === 'GAMES') {
      // iPad: the Teams & Games hub; iPhone: the games list on its own.
      navigation.navigate(isTablet ? 'GamesHub' : 'Games', { title: tile.label });
    } else {
      navigation.navigate('ComingSoon', { title: tile.label });
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <DashboardHeader
        isTablet={isTablet}
        user={user}
        orgName={selectedOrg ? orgDisplayName(selectedOrg) : null}
        isLoading={status === 'loading' || isSyncing}
        teamName={showTeamPicker ? selectedTeam.name : null}
        onTeamPress={() => setTeamPickerOpen(true)}
        onOrgPress={() => setPickerOpen(true)}
        onBellPress={() => navigation.navigate('ComingSoon', { title: 'NOTIFICATIONS' })}
        onAvatarPress={() => navigation.navigate('ComingSoon', { title: 'MY PROFILE' })}
      />

      {error !== null && !isSyncing && (
        <View style={styles.errorBar}>
          <Text style={styles.errorText} numberOfLines={2}>
            {error ?? 'Unable to load your organizations.'}
          </Text>
          <Pressable onPress={refresh} hitSlop={8} accessibilityRole="button">
            <Text style={styles.retry}>RETRY</Text>
          </Pressable>
        </View>
      )}

      <TileGrid tiles={tiles} isTablet={isTablet} onPress={openTile} />

      <OrgPickerModal
        visible={pickerOpen}
        tree={tree}
        selectedOrgId={selectedOrg?.orgId}
        onSelect={selectOrg}
        onClose={() => setPickerOpen(false)}
      />

      <TeamPickerModal
        visible={teamPickerOpen}
        teams={teams}
        selectedTeamId={selectedTeam.id}
        isLoading={teamsSyncing}
        onSelect={selectTeam}
        onClose={() => setTeamPickerOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  errorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 20,
    marginBottom: 8,
    padding: 12,
    borderRadius: 6,
    backgroundColor: colors.surface,
  },
  errorText: {
    flex: 1,
    color: colors.lightGray,
    fontSize: 13,
  },
  retry: {
    color: colors.themeRed,
    fontWeight: 'bold',
  },
});
