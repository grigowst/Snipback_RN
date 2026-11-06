import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { UserRole } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useOrganizations } from '../dashboard/OrganizationsContext';
import { orgDisplayName } from '../dashboard/orgLogic';
import { useTeams } from '../dashboard/TeamsContext';
import { roleOf } from '../dashboard/tiles';
import GamesList from '../games/components/GamesList';
import { useGamesActions } from '../games/useGamesActions';
import type { RootStackParamList } from '../navigation/RootNavigator';
import FollowersPanel from '../teams/components/FollowersPanel';
import { canManageRoster, type RosterCard } from '../teams/roster';
import { colors } from '../theme';

// The tablet Teams & Games hub (MainTeamsGamesViewController in iOS): the
// organisation's teams on the left, segments across the top. Games and
// Followers are built; Members opens the website's roster, as iOS does.

const SEGMENTS = ['GAMES', 'MEMBERS', 'FOLLOWERS', 'SCHEDULE', 'ASSIGNMENTS', 'LIBRARY'] as const;
type Segment = (typeof SEGMENTS)[number];

type Props = NativeStackScreenProps<RootStackParamList, 'GamesHub'>;

/**
 * Members and Followers are for coaches and admins (isCoach() in iOS). iOS
 * shows everyone else its "Not Available in Home Organization" alert, even in
 * a club organisation; here that text is kept for HOME only.
 */
export function showRosterDenied(isHomeOrg: boolean) {
  if (isHomeOrg) {
    Alert.alert(
      'Not Available in Home Organization',
      'Need to sign up for an Organization account to use this feature. To learn more about Organization accounts, email us at sales@snipback.com.',
    );
  } else {
    Alert.alert('Permission Denied', "Only coaches and admins can view a team's members and followers.");
  }
}

export default function GamesHubScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { selectedOrg, homeOrgId } = useOrganizations();
  const { teams, selectedTeam, rosterVersion } = useTeams();
  const [teamId, setTeamId] = useState(selectedTeam.id);
  const [segment, setSegment] = useState<Segment>('GAMES');
  const actions = useGamesActions();

  const isHomeOrg = selectedOrg !== undefined && selectedOrg.orgId === homeOrgId;
  const team = teams.find(t => t.id === teamId) ?? teams[0];
  const canManage = canManageRoster(selectedOrg);

  const openSegment = (next: Segment) => {
    if (next === 'MEMBERS' || next === 'FOLLOWERS') {
      if (!canManage) {
        showRosterDenied(isHomeOrg);
        setSegment('GAMES');
        return;
      }
      if (next === 'MEMBERS') {
        // Roster 2.0: the website's roster, signed in; the hub stays on its tab.
        navigation.navigate('Website', { title: 'MEMBERS', tab: 'team' });
        return;
      }
    }
    setSegment(next);
  };

  const openMember = (card: RosterCard) => {
    if (card.userId === user?.id) {
      Alert.alert('Alert', 'Please edit your profile in profile settings');
    } else {
      navigation.navigate('ComingSoon', { title: 'EDIT MEMBER' });
    }
  };

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
                onPress={() => openSegment(s)}
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
        ) : segment === 'FOLLOWERS' && selectedOrg ? (
          <FollowersPanel
            orgId={selectedOrg.orgId}
            teamId={team.id}
            rosterVersion={rosterVersion}
            onPressCard={openMember}
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
