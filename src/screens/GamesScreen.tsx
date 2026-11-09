import React, { useMemo, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { UserRole } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import TeamPickerModal from '../dashboard/components/TeamPickerModal';
import { useOrganizations } from '../dashboard/OrganizationsContext';
import { orgDisplayName } from '../dashboard/orgLogic';
import { useTeams } from '../dashboard/TeamsContext';
import { roleOf } from '../dashboard/tiles';
import type { GameTab } from '../api/games';
import { readTeams } from '../db/repositories';
import CreateGameModal from '../games/components/CreateGameModal';
import GamesList from '../games/components/GamesList';
import { canCreateGames, createGameBlock } from '../games/gameForm';
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
  const [newGameTab, setNewGameTab] = useState<GameTab | null>(null);
  const [gamesFocus, setGamesFocus] = useState<{ tab: GameTab; nonce: number }>({ tab: 'GAMES', nonce: 0 });
  const actions = useGamesActions();

  const isHomeOrg = selectedOrg !== undefined && selectedOrg.orgId === homeOrgId;
  const team = teams.find(t => t.id === teamId) ?? teams[0];
  const effectiveTeamId = isHomeOrg ? 0 : team.id;

  /** "+ GAME" (hidden for players, followers and managers, as on the iPhone). */
  const addGame = (tab: GameTab) => {
    const block = createGameBlock(selectedOrg, isHomeOrg, effectiveTeamId);
    if (block) {
      Alert.alert(block.title, block.message);
    } else {
      setNewGameTab(tab);
    }
  };

  const orgTeams = useMemo(() => {
    if (!selectedOrg || newGameTab === null) {
      return [];
    }
    try {
      return readTeams(selectedOrg.orgId);
    } catch {
      return [];
    }
  }, [selectedOrg, newGameTab]);

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
        addGame={canCreateGames(selectedOrg) ? { allowed: true, onPress: addGame } : undefined}
        focus={gamesFocus}
        role={roleOf(selectedOrg)}
        isTablet={false}
        isHomeOrg={isHomeOrg}
        {...actions}
      />

      {user && selectedOrg && (
        <CreateGameModal
          visible={newGameTab !== null}
          userId={user.id}
          org={selectedOrg}
          isHomeOrg={isHomeOrg}
          team={isHomeOrg || effectiveTeamId === 0 ? null : { id: team.id, name: team.name }}
          tab={newGameTab ?? 'GAMES'}
          orgTeams={orgTeams}
          onClose={() => setNewGameTab(null)}
          onCreated={tab => setGamesFocus(f => ({ tab, nonce: f.nonce + 1 }))}
        />
      )}

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
