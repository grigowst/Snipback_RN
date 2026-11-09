import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../../theme';
import { hasRowMenu, type RailRow, type TeamMode } from '../teamRail';

// The hub's left rail (the team pane of MainTeamsGamesViewController in iOS):
// the organisation, the My Team / Opponent team toggle, search, and the list
// with each row's "…" button. HOME has only "Org - All Teams", so the toggle,
// search and archive link are hidden there.

type Props = {
  orgName: string;
  isHomeOrg: boolean;
  mode: TeamMode;
  onMode: (mode: TeamMode) => void;
  search: string;
  onSearch: (text: string) => void;
  rows: RailRow[];
  selectedId: number;
  onSelect: (row: RailRow) => void;
  /** Coach or admin in the organisation. */
  canManage: boolean;
  onMore: (row: RailRow) => void;
  /** Archived teams (My Team only). */
  archived: number;
  onArchived: () => void;
  onAddOpponent: () => void;
  loading: boolean;
  error: string | null;
};

const MODES: { mode: TeamMode; title: string }[] = [
  { mode: 'myTeam', title: 'My Team' },
  { mode: 'opponent', title: 'Opponent team' },
];

export default function TeamRail({
  orgName,
  isHomeOrg,
  mode,
  onMode,
  search,
  onSearch,
  rows,
  selectedId,
  onSelect,
  canManage,
  onMore,
  archived,
  onArchived,
  onAddOpponent,
  loading,
  error,
}: Props) {
  return (
    <View style={styles.side}>
      <Text style={styles.org} numberOfLines={2}>
        {orgName}
      </Text>
      {isHomeOrg ? (
        <Text style={styles.sideTitle}>MY TEAM</Text>
      ) : (
        <>
          <View style={styles.toggle} accessibilityRole="tablist">
            {MODES.map(m => {
              const selected = m.mode === mode;
              return (
                <Pressable
                  key={m.mode}
                  onPress={() => onMode(m.mode)}
                  style={[styles.toggleItem, selected && styles.toggleItemSelected]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  accessibilityLabel={m.title}
                >
                  <Text style={[styles.toggleText, selected && styles.toggleTextSelected]}>{m.title}</Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            value={search}
            onChangeText={onSearch}
            placeholder={mode === 'opponent' ? 'Search opponent teams' : 'Search teams'}
            placeholderTextColor={colors.midGray}
            style={styles.search}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            accessibilityLabel="Search teams"
          />
          {mode === 'opponent' ? (
            <Pressable
              onPress={onAddOpponent}
              disabled={!canManage}
              style={[styles.add, !canManage && styles.addDisabled]}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canManage }}
              accessibilityLabel="Add opponent team"
            >
              <Text style={styles.addText}>+ ADD OPPONENT TEAM</Text>
            </Pressable>
          ) : (
            <Pressable onPress={onArchived} hitSlop={6} accessibilityRole="button" accessibilityLabel="Archived teams">
              <Text style={styles.archived}>{`Archived (${archived})`}</Text>
            </Pressable>
          )}
        </>
      )}
      {loading && rows.length <= 1 && (
        <Text style={styles.sideNote}>{mode === 'opponent' ? 'Loading opponent teams…' : 'Loading teams…'}</Text>
      )}
      {error !== null && !loading && (
        <Text style={styles.sideError} numberOfLines={3}>
          {mode === 'opponent' ? `Couldn't load opponent teams: ${error}` : `Couldn't load teams: ${error}`}
        </Text>
      )}
      <FlatList
        data={rows}
        keyExtractor={r => String(r.id)}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const selected = item.id === selectedId;
          const withMenu = !isHomeOrg && hasRowMenu(mode, item.id, canManage);
          return (
            <View style={[styles.teamRow, selected && styles.teamRowSelected]}>
              <Pressable
                onPress={() => onSelect(item)}
                style={styles.teamName}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${mode === 'opponent' ? 'Opponent team' : 'Team'} ${item.name}`}
              >
                <Text style={[styles.teamText, selected && styles.teamTextSelected]} numberOfLines={2}>
                  {item.name}
                </Text>
                {item.isFavourite && (
                  <Text style={styles.star} accessibilityLabel="Favourite">
                    ★
                  </Text>
                )}
              </Pressable>
              {withMenu && (
                <Pressable
                  onPress={() => onMore(item)}
                  hitSlop={8}
                  style={styles.more}
                  accessibilityRole="button"
                  accessibilityLabel={`Options for ${item.name}`}
                >
                  <Text style={styles.moreText}>•••</Text>
                </Pressable>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
  toggle: {
    flexDirection: 'row',
    marginHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  toggleItem: {
    flex: 1,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleItemSelected: {
    backgroundColor: colors.themeRed,
  },
  toggleText: {
    color: colors.lightGray,
    fontSize: 13,
  },
  toggleTextSelected: {
    color: colors.white,
    fontWeight: 'bold',
  },
  search: {
    height: 36,
    marginHorizontal: 12,
    marginTop: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.field,
    color: colors.white,
    fontSize: 15,
  },
  add: {
    height: 36,
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 6,
    borderRadius: 18,
    backgroundColor: colors.themeRed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addDisabled: {
    opacity: 0.5,
  },
  addText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  archived: {
    color: colors.midGray,
    fontSize: 13,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    textDecorationLine: 'underline',
  },
  sideNote: {
    color: colors.midGray,
    fontSize: 13,
    paddingHorizontal: 16,
    marginVertical: 6,
  },
  sideError: {
    color: colors.themeRed,
    fontSize: 13,
    paddingHorizontal: 16,
    marginVertical: 6,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
  },
  teamRowSelected: {
    backgroundColor: colors.surface,
    borderLeftWidth: 3,
    borderLeftColor: colors.themeRed,
  },
  teamName: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingVertical: 12,
    gap: 6,
  },
  teamText: {
    flexShrink: 1,
    color: colors.lightGray,
    fontSize: 15,
  },
  teamTextSelected: {
    color: colors.white,
    fontWeight: 'bold',
  },
  star: {
    color: '#E9A23B',
    fontSize: 14,
  },
  more: {
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  moreText: {
    color: colors.midGray,
    fontSize: 14,
    letterSpacing: 1,
  },
});
