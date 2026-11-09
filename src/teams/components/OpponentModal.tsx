import React, { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import type { OpponentTeam } from '../../api/types';
import { saveOpponentFlow } from '../teamActions';
import { Button, ErrorText, Field, Sheet, formStyles } from './FormParts';

// Adding or renaming an opponent team (AddOpponentTeamVC in iOS): one name
// field; SAVE stays off while it is empty.

export type OpponentEdit = { kind: 'add' } | { kind: 'edit'; id: number; name: string };

type Props = {
  /** What the dialog does, or null when closed. */
  edit: OpponentEdit | null;
  userId: number;
  orgId: number;
  onClose: () => void;
  /** Saved and cached; the hub reloads the list and selects it. */
  onSaved: (opponent: OpponentTeam) => void;
};

export default function OpponentModal({ edit, userId, orgId, onClose, onSaved }: Props) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openKey = edit ? (edit.kind === 'edit' ? `edit:${edit.id}` : 'add') : null;
  useEffect(() => {
    setName(edit?.kind === 'edit' ? edit.name : '');
    setBusy(false);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the dialog opens for something else
  }, [openKey]);

  if (!edit) {
    return null;
  }

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await saveOpponentFlow({
        userId,
        orgId,
        name,
        opponentId: edit.kind === 'edit' ? edit.id : undefined,
      });
      onSaved(result.opponent);
      onClose();
      if (result.renamed) {
        Alert.alert('Saved', `The opponent team was saved as "${result.opponent.name}" (the server changed the name).`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the opponent team. Please try again.');
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible
      title={edit.kind === 'edit' ? 'EDIT OPPONENT TEAM' : 'ADD OPPONENT TEAM'}
      onClose={() => !busy && onClose()}
    >
      <Field
        label="Opponent team name"
        value={name}
        onChangeText={t => {
          setName(t);
          setError(null);
        }}
        placeholder="Enter the opponent team's name"
        autoFocus
      />
      <ErrorText>{error}</ErrorText>
      <View style={formStyles.actions}>
        <Button label="SAVE" onPress={save} busy={busy} disabled={name.trim() === ''} />
        <Button label="CANCEL" kind="plain" onPress={onClose} disabled={busy} />
      </View>
    </Sheet>
  );
}
