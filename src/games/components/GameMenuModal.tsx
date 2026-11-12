import React, { useEffect, useState } from 'react';
import { Alert, Platform, Share, StyleSheet, Text, View } from 'react-native';
import type { GameTab } from '../../api/games';
import type { Game, UserRole } from '../../api/types';
import { colors } from '../../theme';
import { Button, ErrorText, Sheet, formStyles } from '../../teams/components/FormParts';
import { deleteGameFlow, loadEditSource, reloadGameFlow } from '../gameEditActions';
import { tabOfGame, type EditSource } from '../gameEditRules';
import { GAME_MENU_TITLES, canChangeGame, gameMenuOptions, gameShareLink, type GameMenuOption } from '../gameMenu';

// A game's "⋮" menu (GamesAlertTableViewController / showAlertForNormal in iOS).

type Props = {
  /** The game whose menu is open, or null when closed. */
  game: Game | null;
  role: UserRole;
  userId: number;
  isTablet: boolean;
  isHomeOrg: boolean;
  /** An opponent's games are on screen: only sharing is offered. */
  opponentFilter: boolean;
  onClose: () => void;
  /** Edit Game: the game read fresh, for the edit form. */
  onEdit: (src: EditSource) => void;
  /** The game was reloaded or deleted: that tab's list is read again. */
  onChanged: (tab: GameTab) => void;
};

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export default function GameMenuModal({ game, role, userId, isTablet, isHomeOrg, opponentFilter, onClose, onEdit, onChanged }: Props) {
  const [busy, setBusy] = useState<GameMenuOption | null>(null);
  const [error, setError] = useState<string | null>(null);

  const gameId = game?.id;
  useEffect(() => {
    setBusy(null);
    setError(null);
  }, [gameId]);

  if (!game) {
    return null;
  }

  const close = () => {
    if (!busy) {
      onClose();
    }
  };
  const viewer = { role, userId, isTablet };
  const denied = () => Alert.alert('Alert', 'Permission Denied');

  const run = async (option: GameMenuOption, work: () => Promise<void>, fallback: string) => {
    setBusy(option);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(errorText(e, fallback));
      setBusy(null);
    }
  };

  const edit = () => {
    if (!canChangeGame('edit', game, viewer)) {
      denied();
      return;
    }
    run(
      'edit',
      async () => {
        const src = await loadEditSource(game, isHomeOrg);
        onClose();
        onEdit(src);
      },
      'Could not read the game. Please try again.',
    );
  };

  const reload = () =>
    run(
      'reload',
      async () => {
        await reloadGameFlow(game.id);
        onChanged(tabOfGame(game.gameType));
        onClose();
        Alert.alert('Reloaded', 'Your game is ready to use now.');
      },
      'Could not reload the game. Please try again.',
    );

  const share = async () => {
    const link = gameShareLink(game);
    try {
      // iOS shares the link itself; Android takes it as the message.
      await Share.share(Platform.OS === 'ios' ? { url: link } : { message: link });
    } catch {
      // Closing the share sheet is not an error.
    }
  };

  const remove = () => {
    if (!canChangeGame('delete', game, viewer)) {
      denied();
      return;
    }
    Alert.alert('', `Are you sure you want to delete ${game.name}?`, [
      { text: 'CANCEL', style: 'cancel' },
      {
        text: 'DELETE',
        style: 'destructive',
        onPress: () =>
          run(
            'delete',
            async () => {
              await deleteGameFlow(game.id);
              onChanged(tabOfGame(game.gameType));
              onClose();
              Alert.alert('Deleted', `${game.name} was deleted.`);
            },
            'Could not delete the game. Please try again.',
          ),
      },
    ]);
  };

  const choose = (option: GameMenuOption) => {
    setError(null);
    switch (option) {
      case 'edit':
        edit();
        return;
      case 'reload':
        reload();
        return;
      case 'share':
        share();
        return;
      case 'delete':
        remove();
        return;
    }
  };

  return (
    <Sheet visible title={game.name} onClose={close}>
      <Text style={styles.subtitle}>Please select an option</Text>
      <View style={formStyles.actions}>
        {gameMenuOptions({ role, opponentFilter }).map(option => (
          <Button
            key={option}
            label={GAME_MENU_TITLES[option]}
            kind={option === 'delete' ? 'danger' : 'plain'}
            onPress={() => choose(option)}
            busy={busy === option}
            disabled={busy !== null}
          />
        ))}
      </View>
      <ErrorText>{error}</ErrorText>
      <View style={formStyles.actions}>
        <Button label="DISMISS" kind="plain" onPress={close} disabled={busy !== null} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    marginTop: 6,
    color: colors.lightGray,
    fontSize: 15,
  },
});
