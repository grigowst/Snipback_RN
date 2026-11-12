import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DEFAULT_JERSEY } from '../api/teams';
import { UserRole, type Game, type Team } from '../api/types';
import { teamPagePath } from '../api/website';
import { useAuth } from '../auth/AuthContext';
import { useOrganizations } from '../dashboard/OrganizationsContext';
import { orgDisplayName } from '../dashboard/orgLogic';
import { useTeams } from '../dashboard/TeamsContext';
import { ALL_TEAMS_ID } from '../dashboard/teamLogic';
import { readOrgRoles, readTeamMembers, readTeams } from '../db/repositories';
import { roleOf } from '../dashboard/tiles';
import type { GameTab } from '../api/games';
import CreateGameModal from '../games/components/CreateGameModal';
import GameMenuModal from '../games/components/GameMenuModal';
import type { EditSource } from '../games/gameEditRules';
import GamesList from '../games/components/GamesList';
import { canCreateGames, createGameBlock } from '../games/gameForm';
import { useGamesActions } from '../games/useGamesActions';
import type { RootStackParamList } from '../navigation/RootNavigator';
import AddMemberModal from '../teams/components/AddMemberModal';
import MemberEditorModal from '../teams/components/MemberEditorModal';
import OpponentModal, { type OpponentEdit } from '../teams/components/OpponentModal';
import RosterPanel from '../teams/components/RosterPanel';
import TeamEditorModal, { type EditorTarget } from '../teams/components/TeamEditorModal';
import TeamMenuModal from '../teams/components/TeamMenuModal';
import TeamRail from '../teams/components/TeamRail';
import { canManageRoster, type RosterCard } from '../teams/roster';
import { archivedCount, myTeamRows, opponentRows, type RailRow, type TeamMode } from '../teams/teamRail';
import { useOpponents } from '../teams/useOpponents';
import { colors } from '../theme';

// The tablet Teams & Games hub (MainTeamsGamesViewController in iOS): the
// organisation's teams (or its opponent teams) on the left, segments across
// the top. Games, Members and Followers are built. Members is the in-app
// roster grid (iOS's showMembers()); current iOS sends coaches to the
// website's roster instead. Picking an opponent filters the games list to
// games against it; Members and Followers keep the team picked under My Team.

const SEGMENTS = ['GAMES', 'MEMBERS', 'FOLLOWERS', 'SCHEDULE', 'ASSIGNMENTS', 'LIBRARY'] as const;
type Segment = (typeof SEGMENTS)[number];

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

export default function GamesHubScreen() {
  const { user } = useAuth();
  const { selectedOrg, homeOrgId } = useOrganizations();
  const {
    teams,
    selectedTeam,
    rosterVersion,
    isSyncing,
    error: teamsError,
    refresh,
    rosterChanged,
  } = useTeams();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [editing, setEditing] = useState<RosterCard | null>(null);
  const [adding, setAdding] = useState(false);
  const [teamId, setTeamId] = useState(selectedTeam.id);
  const [segment, setSegment] = useState<Segment>('GAMES');
  const [teamMode, setTeamMode] = useState<TeamMode>('myTeam');
  const [opponentId, setOpponentId] = useState(ALL_TEAMS_ID);
  const [search, setSearch] = useState('');
  const [menuTeamId, setMenuTeamId] = useState<number | null>(null);
  const [opponentEdit, setOpponentEdit] = useState<OpponentEdit | null>(null);
  const [teamEditor, setTeamEditor] = useState<EditorTarget | null>(null);
  const [newGameTab, setNewGameTab] = useState<GameTab | null>(null);
  const [gamesFocus, setGamesFocus] = useState<{ tab: GameTab; nonce: number }>({ tab: 'GAMES', nonce: 0 });
  const [menuGame, setMenuGame] = useState<Game | null>(null);
  const [editSource, setEditSource] = useState<EditSource | null>(null);
  const actions = useGamesActions();
  const showTab = (tab: GameTab) => setGamesFocus(f => ({ tab, nonce: f.nonce + 1 }));

  const orgId = selectedOrg?.orgId;
  const isHomeOrg = selectedOrg !== undefined && selectedOrg.orgId === homeOrgId;
  // HOME has no opponents (iOS hides the whole toggle there).
  const mode: TeamMode = isHomeOrg ? 'myTeam' : teamMode;
  const team = teams.find(t => t.id === teamId) ?? teams[0];
  const canManage = canManageRoster(selectedOrg);
  const isAdmin = selectedOrg?.roleId === UserRole.Admin;
  const editorTeam = team.id === ALL_TEAMS_ID ? null : { id: team.id, name: team.name };
  const opponents = useOpponents(user?.id, orgId, mode === 'opponent');

  // Another organisation starts on My Team, with no search and every opponent.
  useEffect(() => {
    setTeamMode('myTeam');
    setOpponentId(ALL_TEAMS_ID);
    setSearch('');
    setMenuTeamId(null);
    setOpponentEdit(null);
    setTeamEditor(null);
    setNewGameTab(null);
    setMenuGame(null);
    setEditSource(null);
  }, [orgId]);

  // The organisation's cached teams with every field (archive count, the
  // "…" menu, the duplicate name check), read again after each store write.
  const cachedTeams = useMemo<Team[]>(() => {
    if (orgId === undefined) {
      return [];
    }
    try {
      return readTeams(orgId);
    } catch {
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rosterVersion signals a store rewrite
  }, [orgId, rosterVersion]);
  const menuTeam = menuTeamId === null ? null : cachedTeams.find(t => t.id === menuTeamId) ?? null;

  const rows = useMemo(
    () =>
      mode === 'opponent' && orgId !== undefined
        ? opponentRows(opponents.opponents, orgId, search)
        : myTeamRows(teams, search),
    [mode, orgId, opponents.opponents, teams, search],
  );

  // The edited member's organisation role and stored jersey, read again
  // whenever a sync rewrites the store (the roles list may arrive late).
  const { orgRole, storedJersey } = useMemo(() => {
    if (!editing || !selectedOrg) {
      return { orgRole: undefined, storedJersey: DEFAULT_JERSEY };
    }
    try {
      const place = editorTeam
        ? readTeamMembers(editorTeam.id).find(m => m.userId === editing.userId)
        : undefined;
      return {
        orgRole: readOrgRoles(selectedOrg.orgId).get(editing.userId) as UserRole | undefined,
        storedJersey: place?.jerseyNumber ?? DEFAULT_JERSEY,
      };
    } catch {
      return { orgRole: undefined, storedJersey: DEFAULT_JERSEY };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rosterVersion signals a store rewrite
  }, [editing, selectedOrg, editorTeam?.id, rosterVersion]);

  /** A member or team change was saved: show it now, and fetch the server's version. */
  const memberChanged = () => {
    rosterChanged();
    refresh();
  };

  const changeMode = (next: TeamMode) => {
    setTeamMode(next);
    setSearch('');
  };

  const selectRow = (row: RailRow) => {
    if (mode === 'opponent') {
      setOpponentId(row.id);
    } else {
      setTeamId(row.id);
    }
  };

  const openRowMenu = (row: RailRow) => {
    if (mode === 'opponent') {
      // iOS's opponent menu has one option, Edit Opponent Team: open it directly.
      setOpponentEdit({ kind: 'edit', id: row.id, name: row.name });
    } else {
      setMenuTeamId(row.id);
    }
  };

  /** "+ GAME": the form for the team picked under My Team (none in HOME). */
  const addGame = (tab: GameTab) => {
    const block = createGameBlock(selectedOrg, isHomeOrg, isHomeOrg ? 0 : team.id);
    if (block) {
      Alert.alert(block.title, block.message);
    } else {
      setNewGameTab(tab);
    }
  };

  const openWebpage = (webTeam: Team) => {
    navigation.navigate('Website', { title: webTeam.name, tab: 'team', path: teamPagePath(webTeam.uniqueNumber) });
  };

  const openSegment = (next: Segment) => {
    if ((next === 'MEMBERS' || next === 'FOLLOWERS') && !canManage) {
      showRosterDenied(isHomeOrg);
      setSegment('GAMES');
      return;
    }
    setSegment(next);
  };

  const openMember = (card: RosterCard) => {
    if (card.userId === user?.id) {
      Alert.alert('Alert', 'Please edit your profile in profile settings');
    } else {
      setEditing(card);
    }
  };

  const params = useMemo(
    () =>
      user && selectedOrg
        ? {
            userId: user.id,
            orgId: selectedOrg.orgId,
            isHomeUser: selectedOrg.roleId === UserRole.HomeUser,
            // An opponent picked: games against it (team type 2).
            ...(mode === 'opponent' ? { teamId: opponentId, teamType: 2 as const } : { teamId: team.id, teamType: 1 as const }),
          }
        : null,
    [user, selectedOrg, team.id, mode, opponentId],
  );

  return (
    <SafeAreaView style={styles.screen} edges={['bottom', 'left', 'right']}>
      <TeamRail
        orgName={selectedOrg ? orgDisplayName(selectedOrg) : ''}
        isHomeOrg={isHomeOrg}
        mode={mode}
        onMode={changeMode}
        search={search}
        onSearch={setSearch}
        rows={rows}
        selectedId={mode === 'opponent' ? opponentId : team.id}
        onSelect={selectRow}
        canManage={canManage}
        onMore={openRowMenu}
        archived={archivedCount(cachedTeams)}
        onArchived={() => Alert.alert('', 'Visit website to manage this.')}
        onAddOpponent={() => setOpponentEdit({ kind: 'add' })}
        onAddTeam={() => setTeamEditor({ kind: 'create' })}
        loading={mode === 'opponent' ? opponents.isSyncing : isSyncing}
        error={mode === 'opponent' ? opponents.error : teamsError}
      />

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
            addGame={{ allowed: canCreateGames(selectedOrg), onPress: addGame }}
            focus={gamesFocus}
            role={roleOf(selectedOrg)}
            isTablet
            isHomeOrg={isHomeOrg}
            {...actions}
            onGameOptions={setMenuGame}
          />
        ) : (segment === 'MEMBERS' || segment === 'FOLLOWERS') && selectedOrg ? (
          <RosterPanel
            key={segment}
            kind={segment === 'MEMBERS' ? 'members' : 'followers'}
            orgId={selectedOrg.orgId}
            teamId={team.id}
            rosterVersion={rosterVersion}
            onPressCard={openMember}
            onAdd={() => setAdding(true)}
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
      {selectedOrg && user && (
        <>
          <MemberEditorModal
            card={editing}
            orgRole={orgRole}
            storedJersey={storedJersey}
            viewerId={user.id}
            viewerIsAdmin={selectedOrg.roleId === UserRole.Admin}
            orgId={selectedOrg.orgId}
            team={editorTeam}
            onClose={() => setEditing(null)}
            onChanged={memberChanged}
          />
          <AddMemberModal
            visible={adding}
            kind={segment === 'FOLLOWERS' ? 'followers' : 'members'}
            viewerId={user.id}
            viewerIsAdmin={selectedOrg.roleId === UserRole.Admin}
            orgId={selectedOrg.orgId}
            team={editorTeam}
            onClose={() => setAdding(false)}
            onChanged={memberChanged}
          />
          <TeamMenuModal
            team={menuTeam}
            orgId={selectedOrg.orgId}
            allTeams={cachedTeams}
            canManage={canManage}
            isAdmin={isAdmin}
            onClose={() => setMenuTeamId(null)}
            onChanged={memberChanged}
            onSelectTeam={setTeamId}
            onOpenWebpage={openWebpage}
            onEdit={id => setTeamEditor({ kind: 'edit', teamId: id })}
          />
          <GameMenuModal
            game={menuGame}
            role={roleOf(selectedOrg)}
            userId={user.id}
            isTablet
            isHomeOrg={isHomeOrg}
            opponentFilter={mode === 'opponent'}
            onClose={() => setMenuGame(null)}
            onEdit={setEditSource}
            onChanged={showTab}
          />
          <CreateGameModal
            visible={newGameTab !== null || editSource !== null}
            userId={user.id}
            org={selectedOrg}
            isHomeOrg={isHomeOrg}
            team={isHomeOrg || team.id === ALL_TEAMS_ID ? null : { id: team.id, name: team.name }}
            tab={newGameTab ?? 'GAMES'}
            orgTeams={cachedTeams}
            edit={editSource}
            onClose={() => {
              setNewGameTab(null);
              setEditSource(null);
            }}
            onSaved={showTab}
          />
          <TeamEditorModal
            target={teamEditor}
            userId={user.id}
            orgId={selectedOrg.orgId}
            orgCategory={selectedOrg.organizationCategory}
            onClose={() => setTeamEditor(null)}
            onSaved={savedId => {
              memberChanged();
              if (savedId !== null) {
                setTeamId(savedId);
              }
            }}
          />
          <OpponentModal
            edit={opponentEdit}
            userId={user.id}
            orgId={selectedOrg.orgId}
            onClose={() => setOpponentEdit(null)}
            onSaved={saved => {
              opponents.reload();
              setOpponentId(saved.id);
            }}
          />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.background,
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
