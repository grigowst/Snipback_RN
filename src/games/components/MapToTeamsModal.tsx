import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { mapGamesToTeam } from '../../api/gameEdit';
import { colors } from '../../theme';
import { Button, ErrorText, Label, Note, OptionChips, Sheet, formStyles } from '../../teams/components/FormParts';
import { MAP_TEAM_TYPES } from '../mapToTeams';

// Map To Teams (MapToTeamsViewController in iOS): the ticked games mapped to
// one of the organisation's teams, as its own team or as another.

type Props = {
  /** The ticked games; null when closed. */
  gameIds: number[] | null;
  /** The teams the hub lists ("Org - All Teams" left out). */
  teams: { id: number; name: string }[];
  userId: number;
  onClose: () => void;
  /** Mapped: the list is read again. */
  onMapped: () => void;
};

export default function MapToTeamsModal({ gameIds, teams, userId, onClose, onMapped }: Props) {
  const [teamType, setTeamType] = useState(0);
  const [teamId, setTeamId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = gameIds !== null;
  useEffect(() => {
    if (open) {
      setTeamType(0);
      setTeamId(null);
      setBusy(false);
      setError(null);
    }
  }, [open]);

  if (!gameIds) {
    return null;
  }

  const close = () => !busy && onClose();

  const map = async () => {
    if (teamId === null) {
      setError('Please choose a team to map');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const message = await mapGamesToTeam({
        gameIds,
        teamId,
        teamType: MAP_TEAM_TYPES.find(t => t.value === teamType)?.type ?? 'my_team',
        userId,
      });
      onMapped();
      onClose();
      Alert.alert('', message || 'The games were mapped.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not map the games. Please try again.');
      setBusy(false);
    }
  };

  return (
    <Sheet visible title="MAP TO TEAMS" onClose={close}>
      <Note>{gameIds.length === 1 ? '1 game ticked.' : `${gameIds.length} games ticked.`}</Note>
      <OptionChips label="Map as" options={MAP_TEAM_TYPES} selected={teamType} onSelect={setTeamType} />
      <View style={styles.list}>
        <Label>Choose Team</Label>
        {teams.length === 0 && <Note>No Teams</Note>}
        {teams.map(t => (
          <Pressable
            key={t.id}
            onPress={() => {
              setTeamId(t.id);
              setError(null);
            }}
            style={styles.row}
            accessibilityRole="radio"
            accessibilityState={{ checked: t.id === teamId }}
            accessibilityLabel={`Map to ${t.name}`}
          >
            <Text style={styles.radio}>{t.id === teamId ? '◉' : '○'}</Text>
            <Text style={styles.name}>{t.name}</Text>
          </Pressable>
        ))}
      </View>
      <ErrorText>{error}</ErrorText>
      <View style={formStyles.actions}>
        <Button label="MAP" onPress={map} busy={busy} />
        <Button label="CANCEL" kind="plain" onPress={close} disabled={busy} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  list: {
    marginTop: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  radio: {
    color: colors.themeRed,
    fontSize: 18,
  },
  name: {
    flex: 1,
    color: colors.white,
    fontSize: 15,
  },
});
