import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Game } from '../../api/types';
import { colors } from '../../theme';
import type { StatusChip } from '../gameRows';

// One games-list row (GameListCell in iOS): light card on the black list,
// as the iOS rows draw dark text.

type Props = {
  game: Game;
  index: number;
  isTablet: boolean;
  dateText: string;
  teamNames: string;
  score: string;
  duration: string;
  status: StatusChip;
  showRecord: boolean;
  onPress: (game: Game) => void;
  onRecord: (game: Game) => void;
  onMore: (game: Game) => void;
};

export default function GameRow({
  game,
  index,
  isTablet,
  dateText,
  teamNames,
  score,
  duration,
  status,
  showRecord,
  onPress,
  onRecord,
  onMore,
}: Props) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={() => onPress(game)}
      accessibilityRole="button"
      accessibilityLabel={game.name}
    >
      {isTablet ? <Text style={styles.number}>{index + 1}</Text> : null}

      <View style={styles.main}>
        <Text style={styles.date}>{dateText}</Text>
        <Text style={styles.name} numberOfLines={2}>
          {game.name}
        </Text>
        {isTablet && teamNames ? (
          <Text style={styles.teams} numberOfLines={1}>
            {teamNames}
          </Text>
        ) : null}
        {duration ? <Text style={styles.duration}>{duration}</Text> : null}
      </View>

      {isTablet && score ? <Text style={styles.score}>{score}</Text> : null}

      <View style={[styles.chip, styles[status.tone]]}>
        <Text style={[styles.chipText, status.tone === 'idle' && styles.chipTextIdle]}>
          {status.label}
        </Text>
      </View>

      {showRecord ? (
        <Pressable
          onPress={() => onRecord(game)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Record ${game.name}`}
        >
          <Image
            source={require('../../../assets/images/games/camera_recorder.png')}
            style={styles.record}
            resizeMode="contain"
          />
        </Pressable>
      ) : null}

      <Pressable
        onPress={() => onMore(game)}
        hitSlop={10}
        style={styles.more}
        accessibilityRole="button"
        accessibilityLabel={`More options for ${game.name}`}
      >
        <Image source={require('../../../assets/images/games/menu_more_black.png')} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: colors.white,
  },
  pressed: {
    opacity: 0.75,
  },
  number: {
    width: 28,
    color: colors.midGray,
    fontSize: 15,
    textAlign: 'center',
  },
  main: {
    flex: 1,
    gap: 2,
  },
  date: {
    color: colors.midGray,
    fontSize: 12,
  },
  name: {
    color: colors.background,
    fontSize: 16,
    fontWeight: 'bold',
  },
  teams: {
    color: '#444444',
    fontSize: 13,
  },
  duration: {
    color: '#444444',
    fontSize: 12,
  },
  score: {
    color: colors.background,
    fontSize: 13,
    textAlign: 'right',
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  live: {
    backgroundColor: colors.themeRed,
  },
  ended: {
    backgroundColor: '#3D3D3D',
  },
  idle: {
    backgroundColor: '#E6E6E6',
  },
  chipText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  chipTextIdle: {
    color: '#555555',
  },
  record: {
    width: 40,
    height: 40,
  },
  more: {
    width: 24,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
