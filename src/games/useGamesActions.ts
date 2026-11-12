import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Game } from '../api/types';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { GAME_ENDED } from './gameRows';

/**
 * What a games-list row opens. The player, live-game menu and recorder are
 * later steps, so each opens a placeholder for now. The "⋮" menu is the
 * screen's own (GameMenuModal).
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
  return { onOpenGame, onRecordGame };
}
