import React, { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import type { UserRole } from '../../api/types';
import { PartialSaveError, removeMemberFlow, saveMemberEdit } from '../memberActions';
import { editRoleOptions, jerseyText, parseJersey, parseName, splitName } from '../memberRules';
import type { RosterCard } from '../roster';
import { Button, ErrorText, Field, Label, Note, RoleChips, Sheet, Value, formStyles } from './FormParts';

// The member editor (EditUserViewController in iOS), opened from a Members
// or Followers card: name, organisation role and, on a team, jersey number;
// and removing the member from the team or the organisation.

export type EditorContext = {
  viewerId: number;
  viewerIsAdmin: boolean;
  orgId: number;
  /** The team the grid shows, or null for All Teams. */
  team: { id: number; name: string } | null;
};

type Props = EditorContext & {
  card: RosterCard | null;
  /** The member's organisation role; undefined until the roles list has loaded. */
  orgRole: UserRole | undefined;
  /** Their stored jersey number on the team (9999 = none). */
  storedJersey: number;
  onClose: () => void;
  /** Something was saved (fully or partly); the hub refreshes. */
  onChanged: () => void;
};

export default function MemberEditorModal({
  card,
  orgRole,
  storedJersey,
  viewerId,
  viewerIsAdmin,
  orgId,
  team,
  onClose,
  onChanged,
}: Props) {
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [role, setRole] = useState<UserRole | undefined>(undefined);
  const [jersey, setJersey] = useState('');
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fill the form each time a member is opened.
  const memberId = card?.userId;
  useEffect(() => {
    if (!card) {
      return;
    }
    const { first: f, last: l } = splitName(card.name);
    setFirst(f);
    setLast(l);
    setJersey(jerseyText(storedJersey));
    setError(null);
    setBusy(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refill only when another member opens
  }, [memberId]);

  // The role arrives with the roles list; until then it can't be shown or saved.
  useEffect(() => {
    setRole(orgRole);
  }, [orgRole, memberId]);

  if (!card) {
    return null;
  }

  const save = async () => {
    const name = parseName(first, last);
    if (!name.ok) {
      setError(name.error);
      return;
    }
    let jerseyNumber: number | null = null;
    if (team && jersey.trim() !== jerseyText(storedJersey)) {
      const parsed = parseJersey(jersey);
      if (!parsed.ok) {
        setError(parsed.error);
        return;
      }
      jerseyNumber = parsed.value;
    }
    if (orgRole === undefined || role === undefined) {
      return;
    }
    setBusy('save');
    setError(null);
    try {
      await saveMemberEdit({
        viewerId,
        orgId,
        teamId: team?.id ?? 0,
        memberId: card.userId,
        oldName: card.name,
        name: name.value,
        oldRoleId: orgRole,
        roleId: role,
        jerseyNumber,
      });
      onChanged();
      onClose();
    } catch (e) {
      if (e instanceof PartialSaveError) {
        onChanged();
        onClose();
        Alert.alert('Partly saved', e.message);
      } else {
        setError(e instanceof Error ? e.message : 'Could not save. Please try again.');
        setBusy(null);
      }
    }
  };

  const remove = () => {
    const question = team
      ? `Do you want to remove ${card.name} from ${team.name}?`
      : `Do you want to delete ${card.name} from the organization?`;
    Alert.alert(question, '', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: team ? 'Remove' : 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy('remove');
          setError(null);
          try {
            await removeMemberFlow({ orgId, teamId: team?.id ?? 0, memberId: card.userId });
            onChanged();
            onClose();
            Alert.alert(
              'Removed',
              team ? `${card.name} was removed from ${team.name}.` : `${card.name} was removed from the organization.`,
            );
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not remove. Please try again.');
            setBusy(null);
          }
        },
      },
    ]);
  };

  const isSelf = card.userId === viewerId;

  return (
    <Sheet visible title="EDIT MEMBER" onClose={onClose}>
      <View style={formStyles.row}>
        <View style={formStyles.half}>
          <Field label="First name" value={first} onChangeText={setFirst} placeholder="Enter first name" />
        </View>
        <View style={formStyles.half}>
          <Field label="Last name" value={last} onChangeText={setLast} placeholder="Enter last name (optional)" />
        </View>
      </View>
      <Value label="Email" value={card.email || '—'} />
      {team && <Value label="Team" value={team.name} />}
      {role === undefined ? (
        <View>
          <Label>Role</Label>
          <Note>Loading roles…</Note>
        </View>
      ) : (
        <RoleChips roles={editRoleOptions(orgRole ?? role, viewerIsAdmin)} selected={role} onSelect={setRole} />
      )}
      {team && (
        <Field
          label="Jersey number"
          value={jersey}
          onChangeText={t => setJersey(t.replace(/[^0-9]/g, ''))}
          placeholder="No number"
          keyboardType="number-pad"
          maxLength={3}
        />
      )}
      <ErrorText>{error}</ErrorText>
      <View style={formStyles.actions}>
        <Button
          label="UPDATE"
          onPress={save}
          busy={busy === 'save'}
          disabled={isSelf || role === undefined || busy !== null}
        />
        {!isSelf && (
          <Button
            label={team ? 'REMOVE FROM TEAM' : 'DELETE FROM ORGANIZATION'}
            kind="danger"
            onPress={remove}
            busy={busy === 'remove'}
            disabled={busy !== null}
          />
        )}
        <Button label="CANCEL" kind="plain" onPress={onClose} disabled={busy !== null} />
      </View>
    </Sheet>
  );
}
