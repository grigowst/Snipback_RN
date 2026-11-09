import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { GAME_TABS, type GameTab } from '../../api/games';
import type { Game, UserRole } from '../../api/types';
import { colors } from '../../theme';
import {
  durationText,
  formatGameDate,
  scoreText,
  showRecordButton,
  statusChip,
  teamNamesText,
} from '../gameRows';
import { useGameList, type GameListParams } from '../useGameList';
import GameRow from './GameRow';

// The games list with its tabs (GamesViewController in iOS), shared by the
// phone Games screen and the tablet hub's Games segment.

type Props = {
  /** null until the organisation is known. */
  params: Omit<GameListParams, 'tab'> | null;
  /** "+ GAME" next to the tabs (shown dimmed when not allowed); left out, no button. */
  addGame?: { allowed: boolean; onPress: (tab: GameTab) => void };
  /** Show this tab, refreshed, whenever the nonce changes (after a game is created). */
  focus?: { tab: GameTab; nonce: number };
  role: UserRole;
  isTablet: boolean;
  isHomeOrg: boolean;
  onOpenGame: (game: Game) => void;
  onRecordGame: (game: Game) => void;
  onGameOptions: (game: Game) => void;
};

const TAB_TITLES: Record<GameTab, string> = {
  GAMES: 'GAMES',
  PRACTICES: 'PRACTICES',
  SCOUT: 'SCOUT',
};

export default function GamesList({
  params,
  addGame,
  focus,
  role,
  isTablet,
  isHomeOrg,
  onOpenGame,
  onRecordGame,
  onGameOptions,
}: Props) {
  const [tab, setTab] = useState<GameTab>('GAMES');
  const list = useGameList(params ? { ...params, tab } : null);

  // After a create: that tab, fetched again (a new tab fetches by itself).
  const focusNonce = focus?.nonce ?? 0;
  const refreshList = list.refresh;
  useEffect(() => {
    if (!focus || focusNonce === 0) {
      return;
    }
    if (focus.tab !== tab) {
      setTab(focus.tab);
    } else {
      refreshList();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per nonce
  }, [focusNonce]);
  const userId = params?.userId ?? 0;

  const renderItem = useCallback(
    ({ item, index }: { item: Game; index: number }) => (
      <GameRow
        game={item}
        index={index}
        isTablet={isTablet}
        dateText={formatGameDate(item.gameDate, isTablet)}
        teamNames={teamNamesText(item)}
        score={isTablet ? scoreText(item, { tab, isHomeOrg }) : ''}
        duration={durationText(item, isTablet)}
        status={statusChip(item)}
        showRecord={showRecordButton(item, { role, userId, tab })}
        onPress={onOpenGame}
        onRecord={onRecordGame}
        onMore={onGameOptions}
      />
    ),
    [isTablet, tab, isHomeOrg, role, userId, onOpenGame, onRecordGame, onGameOptions],
  );

  return (
    <View style={styles.container}>
      <View style={styles.tabBar}>
        <View style={styles.tabs} accessibilityRole="tablist">
          {GAME_TABS.map(t => {
            const selected = t === tab;
            return (
              <Pressable
                key={t}
                onPress={() => setTab(t)}
                style={[styles.tab, selected && styles.tabSelected]}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={`${TAB_TITLES[t]} tab`}
              >
                <Text style={[styles.tabText, selected && styles.tabTextSelected]}>
                  {TAB_TITLES[t]}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {addGame && (
          <Pressable
            onPress={() => addGame.onPress(tab)}
            style={[styles.add, !addGame.allowed && styles.addOff]}
            accessibilityRole="button"
            accessibilityLabel="Add game"
          >
            <Text style={styles.addText}>+ GAME</Text>
          </Pressable>
        )}
      </View>

      {list.error ? (
        <View style={styles.errorBar}>
          <Text style={styles.errorText} numberOfLines={2}>
            {list.error}
          </Text>
          <Pressable onPress={list.refresh} hitSlop={8} accessibilityRole="button">
            <Text style={styles.retry}>RETRY</Text>
          </Pressable>
        </View>
      ) : null}

      <FlatList
        data={list.games}
        keyExtractor={game => String(game.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={Separator}
        refreshControl={
          <RefreshControl
            refreshing={list.isRefreshing && !list.isLoading}
            onRefresh={list.refresh}
            tintColor={colors.white}
            colors={[colors.themeRed]}
          />
        }
        onEndReached={list.hasMore ? list.loadMore : undefined}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          list.isLoading ? (
            <ActivityIndicator color={colors.themeRed} style={styles.loading} />
          ) : list.error ? undefined : (
            <Text style={styles.empty}>{`No ${TAB_TITLES[tab].toLowerCase()} found.`}</Text>
          )
        }
        ListFooterComponent={
          list.isLoadingMore ? (
            <ActivityIndicator color={colors.themeRed} style={styles.more} />
          ) : undefined
        }
      />
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 8,
  },
  add: {
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: colors.themeRed,
    justifyContent: 'center',
  },
  addOff: {
    opacity: 0.5,
  },
  addText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  tabs: {
    flex: 1,
    flexDirection: 'row',
    borderRadius: 8,
    backgroundColor: colors.surface,
    padding: 3,
  },
  tab: {
    flex: 1,
    height: 36,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabSelected: {
    backgroundColor: colors.themeRed,
  },
  tabText: {
    color: colors.lightGray,
    fontSize: 13,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  tabTextSelected: {
    color: colors.white,
  },
  errorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 12,
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
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 24,
    flexGrow: 1,
  },
  separator: {
    height: 8,
  },
  loading: {
    marginTop: 40,
  },
  empty: {
    marginTop: 40,
    color: colors.midGray,
    textAlign: 'center',
    fontSize: 15,
  },
  more: {
    marginVertical: 16,
  },
});
