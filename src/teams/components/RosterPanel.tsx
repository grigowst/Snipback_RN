import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { ALL_TEAMS_ID } from '../../dashboard/teamLogic';
import { readOrgTeamMembers, readPeople, readTeamMembers } from '../../db/repositories';
import { colors } from '../../theme';
import { initials, rosterCards, rosterFilters, type RosterCard, type RosterKind } from '../roster';

type Props = {
  kind: RosterKind;
  orgId: number;
  /** A team id, or ALL_TEAMS_ID for the whole organisation. */
  teamId: number;
  /** Changes when the teams or users cache is rewritten. */
  rosterVersion: number;
  onPressCard: (card: RosterCard) => void;
  /** Opens the add-member sheet. */
  onAdd: () => void;
};

/** iOS sizes cards so two fit across the hub; this keeps cards about as wide. */
const MIN_CARD_WIDTH = 300;
const GAP = 10;

/** The team's (or organisation's) places, with the cached people they name. */
function readRoster(orgId: number, teamId: number) {
  try {
    const members =
      teamId === ALL_TEAMS_ID ? readOrgTeamMembers(orgId) : readTeamMembers(teamId);
    return { members, people: readPeople(members.map(m => m.userId)) };
  } catch {
    return { members: [], people: new Map() };
  }
}

const WORDS: Record<RosterKind, { search: string; plural: string }> = {
  members: { search: 'Search Members', plural: 'members' },
  followers: { search: 'Search Followers', plural: 'followers' },
};

/**
 * The hub's Members or Followers tab, as cards. The hub gives each tab its
 * own instance (key), so the filter and search start fresh on each.
 */
export default function RosterPanel({ kind, orgId, teamId, rosterVersion, onPressCard, onAdd }: Props) {
  const filters = rosterFilters(kind);
  const words = WORDS[kind];
  const [filter, setFilter] = useState(filters[0]);
  const [search, setSearch] = useState('');
  const [width, setWidth] = useState(0);

  const [{ members, people }, setRoster] = useState(() => readRoster(orgId, teamId));

  // Read the store again when the team changes or a sync rewrites it.
  useEffect(() => {
    setRoster(readRoster(orgId, teamId));
  }, [orgId, teamId, rosterVersion]);

  const cards = useMemo(
    () => rosterCards({ members, people, teamId, kind, filter, search }),
    [members, people, teamId, kind, filter, search],
  );

  const columns = Math.max(1, Math.floor((width + GAP) / (MIN_CARD_WIDTH + GAP)));

  return (
    <View style={styles.panel}>
      <View style={styles.toolbar}>
        <View style={styles.filters}>
          {filters.map(f => {
            const selected = f === filter;
            return (
              <Pressable
                key={f}
                onPress={() => setFilter(f)}
                style={[styles.filter, selected && styles.filterSelected]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Show ${f}`}
              >
                <Text style={[styles.filterText, selected && styles.filterTextSelected]}>{f}</Text>
              </Pressable>
            );
          })}
        </View>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={words.search}
          placeholderTextColor={colors.midGray}
          style={styles.search}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          accessibilityLabel={words.search}
        />
        <Pressable onPress={onAdd} style={styles.add} accessibilityRole="button" accessibilityLabel="Add member">
          <Text style={styles.addText}>+ MEMBER</Text>
        </Pressable>
      </View>

      <View style={styles.listBox} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && (
          <FlatList
            key={columns}
            data={cards}
            numColumns={columns}
            keyExtractor={c => String(c.userId)}
            columnWrapperStyle={columns > 1 ? styles.row : undefined}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Card card={item} width={(width - 2 * GAP - (columns - 1) * GAP) / columns} onPress={onPressCard} />
            )}
            ListEmptyComponent={
              <Text style={styles.empty}>
                {search.trim() ? `No matching ${words.plural}.` : `No ${words.plural} found.`}
              </Text>
            }
          />
        )}
      </View>
    </View>
  );
}

function Card({
  card,
  width,
  onPress,
}: {
  card: RosterCard;
  width: number;
  onPress: (card: RosterCard) => void;
}) {
  // Many stored photo links are dead (S3 answers 404); show initials instead
  // of an empty box when the photo can't be loaded.
  const [photoFailed, setPhotoFailed] = useState(false);
  useEffect(() => setPhotoFailed(false), [card.avatar]);

  return (
    <Pressable
      onPress={() => onPress(card)}
      style={[styles.card, { width }]}
      accessibilityRole="button"
      accessibilityLabel={`Member ${card.name}`}
    >
      {card.avatar && !photoFailed ? (
        <Image
          source={{ uri: card.avatar }}
          style={styles.avatar}
          onError={() => setPhotoFailed(true)}
        />
      ) : (
        <View style={[styles.avatar, styles.initialsBox]}>
          <Text style={styles.initials}>{initials(card.name)}</Text>
        </View>
      )}
      <View style={styles.cardText}>
        <Text style={styles.name} numberOfLines={1}>
          {card.name}
        </Text>
        <Text style={styles.role} numberOfLines={1}>
          {card.roleLabel}
        </Text>
        <Text style={styles.email} numberOfLines={1}>
          {card.email}
        </Text>
      </View>
      {card.jerseyNumber !== null && (
        <View style={styles.jersey}>
          <Text style={styles.jerseyText}>{String(card.jerseyNumber)}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: GAP,
    paddingTop: 12,
    paddingBottom: 4,
  },
  filters: {
    flexDirection: 'row',
    gap: 6,
  },
  filter: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  filterSelected: {
    backgroundColor: colors.white,
    borderColor: colors.white,
  },
  filterText: {
    color: colors.lightGray,
    fontSize: 13,
  },
  filterTextSelected: {
    color: colors.background,
    fontWeight: 'bold',
  },
  search: {
    flexGrow: 1,
    minWidth: 200,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.field,
    color: colors.white,
    fontSize: 15,
  },
  add: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: colors.themeRed,
    justifyContent: 'center',
  },
  addText: {
    color: colors.white,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  listBox: {
    flex: 1,
  },
  content: {
    padding: GAP,
    gap: GAP,
  },
  row: {
    gap: GAP,
  },
  card: {
    height: 80,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: colors.field,
  },
  initialsBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: colors.white,
    fontSize: 20,
    fontWeight: 'bold',
  },
  cardText: {
    flex: 1,
    marginLeft: 12,
  },
  name: {
    color: colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  role: {
    marginTop: 2,
    color: colors.themeRed,
    fontSize: 13,
  },
  email: {
    marginTop: 2,
    color: colors.lightGray,
    fontSize: 13,
  },
  jersey: {
    minWidth: 36,
    height: 36,
    paddingHorizontal: 6,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  jerseyText: {
    color: colors.white,
    fontWeight: 'bold',
  },
  empty: {
    marginTop: 40,
    color: colors.midGray,
    fontSize: 15,
    textAlign: 'center',
  },
});
