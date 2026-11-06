import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { UserRole } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useOrganizations } from '../dashboard/OrganizationsContext';
import { orgDisplayName } from '../dashboard/orgLogic';
import { useTeams } from '../dashboard/TeamsContext';
import { roleOf } from '../dashboard/tiles';
import GamesList from '../games/components/GamesList';
import { useGamesActions } from '../games/useGamesActions';
import { colors } from '../theme';

// The tablet Teams & Games hub (MainTeamsGamesViewController in iOS): the
// organisation's teams on the left, segments across the top. Only Games is
// built so far.

const SEGMENTS = ['GAMES', 'MEMBERS', 'FOLLOWERS', 'SCHEDULE', 'ASSIGNMENTS', 'LIBRARY'] as const;
type Segment = (typeof SEGMENTS)[number];

export default function GamesHubScreen() {
  const { user } = useAuth();
  const { selectedOrg, homeOrgId } = useOrganizations();
  const { teams, selectedTeam } = useTeams();
  const [teamId, setTeamId] = useState(selectedTeam.id);
  const [segment, setSegment] = useState<Segment>('GAMES');
  const actions = useGamesActions();

  const isHomeOrg = selectedOrg !== undefined && selectedOrg.orgId === homeOrgId;
  const team = teams.find(t => t.id === teamId) ?? teams[0];

  const params = useMemo(
    () =>
      user && selectedOrg
        ? {
            userId: user.id,
            orgId: selectedOrg.orgId,
            isHomeUser: selectedOrg.roleId === UserRole.HomeUser,
            teamId: team.id,
          }
        : null,
    [user, selectedOrg, team.id],
  );

  return (
    <SafeAreaView style={styles.screen} edges={['bottom', 'left', 'right']}>
      <View style={styles.side}>
        <Text style={styles.org} numberOfLines={2}>
          {selectedOrg ? orgDisplayName(selectedOrg) : ''}
        </Text>
        <Text style={styles.sideTitle}>MY TEAM</Text>
        <FlatList
          data={teams}
          keyExtractor={t => String(t.id)}
          renderItem={({ item }) => {
            const selected = item.id === team.id;
            return (
              <Pressable
                onPress={() => setTeamId(item.id)}
                style={[styles.teamRow, selected && styles.teamRowSelected]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Team ${item.name}`}
              >
                <Text style={[styles.teamText, selected && styles.teamTextSelected]} numberOfLines={2}>
                  {item.name}
                </Text>
              </Pressable>
            );
          }}
        />
      </View>

      <View style={styles.content}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.segmentScroll}
          contentContainerStyle={styles.segments}
        >
          {SEGMENTS.map(s => {
            const selected = s === segment;
            return (
              <Pressable
                key={s}
                onPress={() => setSegment(s)}
                style={[styles.segment, selected && styles.segmentSelected]}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={`${s} segment`}
              >
                <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{s}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {segment === 'GAMES' ? (
          <GamesList
            params={params}
            role={roleOf(selectedOrg)}
            isTablet
            isHomeOrg={isHomeOrg}
            {...actions}
          />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderTitle}>{segment}</Text>
            <Text style={styles.placeholderText}>
              This section hasn't been built in the React Native app yet.
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.background,
  },
  side: {
    width: 260,
    paddingTop: 12,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
  },
  org: {
    color: colors.themeRed,
    fontSize: 17,
    fontWeight: 'bold',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sideTitle: {
    color: colors.midGray,
    fontSize: 12,
    letterSpacing: 1.5,
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  teamRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  teamRowSelected: {
    backgroundColor: colors.surface,
    borderLeftWidth: 3,
    borderLeftColor: colors.themeRed,
  },
  teamText: {
    color: colors.lightGray,
    fontSize: 15,
  },
  teamTextSelected: {
    color: colors.white,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
  },
  segmentScroll: {
    flexGrow: 0,
  },
  segments: {
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 8,
  },
  segment: {
    height: 38,
    paddingHorizontal: 18,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  segmentSelected: {
    backgroundColor: colors.themeRed,
    borderColor: colors.themeRed,
  },
  segmentText: {
    color: colors.lightGray,
    fontSize: 13,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  segmentTextSelected: {
    color: colors.white,
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  placeholderTitle: {
    color: colors.white,
    fontSize: 20,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  placeholderText: {
    marginTop: 10,
    color: colors.midGray,
    fontSize: 15,
  },
});
