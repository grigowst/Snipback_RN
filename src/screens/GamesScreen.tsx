import React, { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { UserRole } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import TeamPickerModal from '../dashboard/components/TeamPickerModal';
import { useOrganizations } from '../dashboard/OrganizationsContext';
import { orgDisplayName } from '../dashboard/orgLogic';
import { useTeams } from '../dashboard/TeamsContext';
import { roleOf } from '../dashboard/tiles';
import GamesList from '../games/components/GamesList';
import { useGamesActions } from '../games/useGamesActions';
import { colors } from '../theme';

/**
 * The phone games list (GamesViewController from Games.storyboard in iOS),
 * for the dashboard's organisation and team. The team can be changed here
 * without changing the dashboard's.
 */
export default function GamesScreen() {
  const { user } = useAuth();
  const { selectedOrg, homeOrgId } = useOrganizations();
  const { teams, selectedTeam } = useTeams();
  const [teamId, setTeamId] = useState(selectedTeam.id);
  const [pickerOpen, setPickerOpen] = useState(false);
  const actions = useGamesActions();

  const isHomeOrg = selectedOrg !== undefined && selectedOrg.orgId === homeOrgId;
  const team = teams.find(t => t.id === teamId) ?? teams[0];
  const effectiveTeamId = isHomeOrg ? 0 : team.id;

  const params = useMemo(
    () =>
      user && selectedOrg
        ? {
            userId: user.id,
            orgId: selectedOrg.orgId,
            isHomeUser: selectedOrg.roleId === UserRole.HomeUser,
            teamId: effectiveTeamId,
          }
        : null,
    [user, selectedOrg, effectiveTeamId],
  );

  return (
    <SafeAreaView style={styles.screen} edges={['bottom', 'left', 'right']}>
      <View style={styles.bar}>
        <Text style={styles.org} numberOfLines={1}>
          {selectedOrg ? orgDisplayName(selectedOrg) : ''}
        </Text>
        {!isHomeOrg ? (
          <Pressable
            style={({ pressed }) => [styles.team, pressed && styles.pressed]}
            onPress={() => setPickerOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Change team"
          >
            <Text style={styles.teamText} numberOfLines={1}>
              {team.name}
            </Text>
            <Image
              source={require('../../assets/images/dashboard/down_arrow.png')}
              style={styles.arrow}
            />
          </Pressable>
        ) : null}
      </View>

      <GamesList
        params={params}
        role={roleOf(selectedOrg)}
        isTablet={false}
        isHomeOrg={isHomeOrg}
        {...actions}
      />

      <TeamPickerModal
        visible={pickerOpen}
        teams={teams}
        selectedTeamId={team.id}
        isLoading={false}
        onSelect={t => setTeamId(t.id)}
        onClose={() => setPickerOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  org: {
    flexShrink: 1,
    color: colors.themeRed,
    fontSize: 15,
    fontWeight: 'bold',
  },
  team: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: colors.field,
  },
  teamText: {
    flex: 1,
    color: colors.white,
    fontSize: 14,
    fontWeight: 'bold',
  },
  arrow: {
    width: 14,
    height: 14,
    tintColor: colors.white,
  },
  pressed: {
    opacity: 0.7,
  },
});
