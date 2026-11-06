import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Game } from '../api/types';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { GAME_ENDED } from './gameRows';

/**
 * What a games-list row opens. The player, live-game menu, recorder and game
 * options are later steps, so each opens a placeholder for now.
 */
export function useGamesActions() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const onOpenGame = useCallback(
    (game: Game) =>
      navigation.navigate('ComingSoon', {
        title: game.status >= GAME_ENDED ? 'FILM PLAYER' : 'LIVE GAME',
      }),
    [navigation],
  );
  const onRecordGame = useCallback(
    () => navigation.navigate('ComingSoon', { title: 'RECORDER' }),
    [navigation],
  );
  const onGameOptions = useCallback(
    () => navigation.navigate('ComingSoon', { title: 'GAME OPTIONS' }),
    [navigation],
  );
  return { onOpenGame, onRecordGame, onGameOptions };
}
