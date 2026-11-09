import React, { useEffect, useState } from 'react';
import { Alert, Platform, Share, StyleSheet, Text, View } from 'react-native';
import type { Team } from '../../api/types';
import { colors } from '../../theme';
import { deleteTeamFlow, duplicateTeamFlow, favouriteFlow } from '../teamActions';
import {
  TEAM_MENU_TITLES,
  duplicateNameCheck,
  inviteLink,
  teamMenuActions,
  type InviteRole,
  type TeamMenuAction,
} from '../teamRail';
import { Button, ErrorText, Field, Sheet, formStyles } from './FormParts';

// A team's "…" menu in the hub (showActionSheetForTeamOption in iOS), with
// its invite-links and duplicate steps.

type Props = {
  /** The team whose menu is open, or null when closed. */
  team: Team | null;
  orgId: number;
  /** The organisation's cached teams (the duplicate name check). */
  allTeams: Team[];
  canManage: boolean;
  isAdmin: boolean;
  onClose: () => void;
  /** A change was written to the cache; the hub re-reads and refreshes. */
  onChanged: () => void;
  onSelectTeam: (teamId: number) => void;
  onOpenWebpage: (team: Team) => void;
  onEdit: (teamId: number) => void;
};

/** The sheet's step: the options, the invite links, or the new name for a copy. */
type Step = 'menu' | 'invite' | 'duplicate';

const INVITE_ROLES: { role: InviteRole; title: string }[] = [
  { role: 'coach', title: 'Coach' },
  { role: 'follower', title: 'Follower' },
  { role: 'player', title: 'Player' },
];

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export default function TeamMenuModal({
  team,
  orgId,
  allTeams,
  canManage,
  isAdmin,
  onClose,
  onChanged,
  onSelectTeam,
  onOpenWebpage,
  onEdit,
}: Props) {
  const [view, setView] = useState<Step>('menu');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const teamId = team?.id;
  useEffect(() => {
    setView('menu');
    setName(team?.name ?? '');
    setBusy(false);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when another team's menu opens
  }, [teamId]);

  if (!team) {
    return null;
  }

  const close = () => {
    if (!busy) {
      onClose();
    }
  };

  const setFavourite = (favourite: boolean) => {
    const question = favourite ? `Set ${team.name} as Favourite?` : `Remove ${team.name} from Favourite?`;
    Alert.alert(question, '', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: favourite ? 'Set' : 'Remove',
        onPress: async () => {
          setBusy(true);
          setError(null);
          try {
            await favouriteFlow(orgId, team.id, favourite);
            onChanged();
            onClose();
          } catch (e) {
            setError(errorText(e, 'Could not change the favourite. Please try again.'));
            setBusy(false);
          }
        },
      },
    ]);
  };

  const remove = () => {
    Alert.alert(`Are you sure to delete ${team.name}?`, '', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          setError(null);
          try {
            await deleteTeamFlow(team.id);
            onChanged();
            onClose();
            Alert.alert('Deleted', `${team.name} was deleted.`);
          } catch (e) {
            setError(errorText(e, 'Could not delete the team. Please try again.'));
            setBusy(false);
          }
        },
      },
    ]);
  };

  const choose = (action: TeamMenuAction) => {
    setError(null);
    switch (action) {
      case 'edit':
        onClose();
        onEdit(team.id);
        return;
      case 'invite':
        if (!team.playerLink) {
          Alert.alert('Alert', 'No share url for this team');
        } else {
          setView('invite');
        }
        return;
      case 'webpage':
        if (!team.uniqueNumber) {
          Alert.alert('Alert', "This team doesn't have a web page yet.");
          return;
        }
        onClose();
        onOpenWebpage(team);
        return;
      case 'duplicate':
        setName(team.name);
        setView('duplicate');
        return;
      case 'favourite':
      case 'unfavourite':
        setFavourite(action === 'favourite');
        return;
      case 'delete':
        remove();
        return;
    }
  };

  const share = async (role: InviteRole, title: string) => {
    const link = inviteLink(team, role);
    if (!link) {
      Alert.alert('Alert', `No share url for this team as ${title.toLowerCase()}`);
      return;
    }
    try {
      // iOS shares the link itself; Android takes it as the message.
      await Share.share(Platform.OS === 'ios' ? { url: link } : { message: link });
    } catch {
      // Closing the share sheet is not an error.
    }
  };

  const duplicate = async () => {
    const check = duplicateNameCheck(name, allTeams);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await duplicateTeamFlow({ orgId, teamId: team.id, name: check.value });
      onChanged();
      onSelectTeam(result.team.id);
      onClose();
      Alert.alert(
        'Team created',
        result.renamed
          ? `The copy was saved as "${result.team.name}" (the server changed the name from "${check.value}").`
          : `${result.team.name} was created.`,
      );
    } catch (e) {
      setError(errorText(e, 'Could not duplicate the team. Please try again.'));
      setBusy(false);
    }
  };

  if (view === 'invite') {
    return (
      <Sheet visible title="TEAM INVITE LINKS" onClose={close}>
        <Text style={styles.subtitle}>Invite user as</Text>
        <View style={formStyles.actions}>
          {INVITE_ROLES.map(r => (
            <Button key={r.role} label={r.title.toUpperCase()} kind="plain" onPress={() => share(r.role, r.title)} />
          ))}
          <Button label="BACK" kind="plain" onPress={() => setView('menu')} />
        </View>
      </Sheet>
    );
  }

  if (view === 'duplicate') {
    return (
      <Sheet visible title="DUPLICATE TEAM" onClose={close}>
        <Text style={styles.subtitle}>{`A copy of ${team.name}`}</Text>
        <Field
          label="New team name"
          value={name}
          onChangeText={t => {
            setName(t);
            setError(null);
          }}
          placeholder="Enter a team name"
          autoFocus
        />
        <ErrorText>{error}</ErrorText>
        <View style={formStyles.actions}>
          <Button label="DUPLICATE" onPress={duplicate} busy={busy} />
          <Button label="BACK" kind="plain" onPress={() => setView('menu')} disabled={busy} />
        </View>
      </Sheet>
    );
  }

  return (
    <Sheet visible title={team.name} onClose={close}>
      <View style={formStyles.actions}>
        {teamMenuActions({ canManage, isAdmin, isFavourite: team.isFavourite === 1 }).map(action => (
          <Button
            key={action}
            label={TEAM_MENU_TITLES[action]}
            kind={action === 'delete' ? 'danger' : 'plain'}
            onPress={() => choose(action)}
            disabled={busy}
          />
        ))}
      </View>
      <ErrorText>{error}</ErrorText>
      <View style={formStyles.actions}>
        <Button label="CANCEL" kind="plain" onPress={close} disabled={busy} />
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
