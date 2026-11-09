import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { searchPeople } from '../../api/members';
import type { Person, UserRole } from '../../api/types';
import { readOrgUsers, readTeamMembers } from '../../db/repositories';
import { colors } from '../../theme';
import { PartialSaveError, addMemberFlow, addToTeamFlow } from '../memberActions';
import { addRoleOptions, defaultAddRole, isValidEmail, parseJersey, parseName, splitName } from '../memberRules';
import type { RosterKind } from '../roster';
import type { EditorContext } from './MemberEditorModal';
import { Button, ErrorText, Field, Note, RoleChips, Sheet, Value, formStyles } from './FormParts';

// Adding a member (AddUserTableViewController in iOS): find someone in the
// organisation, search everyone on Snipback, or invite a new email; then
// their role, jersey number (on a team) and a message for the invitation.

type Pick =
  | { kind: 'org'; person: Person }
  | { kind: 'global'; person: Person }
  | { kind: 'invite'; email: string };

type Suggestion = { person: Person; tag: string; selectable: boolean; kind: 'org' | 'global' };

type Props = EditorContext & {
  visible: boolean;
  /** The tab it was opened from (sets the starting role). */
  kind: RosterKind;
  onClose: () => void;
  onChanged: () => void;
};

const MAX_SUGGESTIONS = 20;

export default function AddMemberModal({ visible, kind, viewerId, viewerIsAdmin, orgId, team, onClose, onChanged }: Props) {
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Person[] | null>(null); // everyone-on-Snipback results
  const [searching, setSearching] = useState(false);
  const [pick, setPick] = useState<Pick | null>(null);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [role, setRole] = useState<UserRole>(defaultAddRole(kind));
  const [jersey, setJersey] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start clean each time the sheet opens.
  useEffect(() => {
    if (visible) {
      setQuery('');
      setFound(null);
      setPick(null);
      setRole(defaultAddRole(kind));
      setJersey('');
      setMessage('');
      setError(null);
      setBusy(false);
    }
  }, [visible, kind]);

  const { orgPeople, onTeam } = useMemo(() => {
    if (!visible) {
      return { orgPeople: [] as Person[], onTeam: new Set<number>() };
    }
    try {
      return {
        orgPeople: readOrgUsers(orgId),
        onTeam: new Set(team ? readTeamMembers(team.id).map(m => m.userId) : []),
      };
    } catch {
      return { orgPeople: [] as Person[], onTeam: new Set<number>() };
    }
  }, [visible, orgId, team]);

  const text = query.trim().toLowerCase();
  const suggestions = useMemo<Suggestion[]>(() => {
    if (!text) {
      return [];
    }
    const matches = (p: Person) => p.name.toLowerCase().includes(text) || p.email.toLowerCase().includes(text);
    const orgIds = new Set(orgPeople.map(p => p.id));
    const fromOrg: Suggestion[] = orgPeople.filter(matches).map(person => {
      const already = onTeam.has(person.id);
      return {
        person,
        kind: 'org',
        tag: already ? 'On this team' : team ? 'In organization' : 'Already in organization',
        selectable: !!team && !already,
      };
    });
    const fromSnipback: Suggestion[] = (found ?? [])
      .filter(p => !orgIds.has(p.id))
      .map(person => ({ person, kind: 'global', tag: 'Snipback user', selectable: true }));
    return [...fromOrg, ...fromSnipback]
      .sort((a, b) => Number(b.selectable) - Number(a.selectable) || a.person.name.localeCompare(b.person.name))
      .slice(0, MAX_SUGGESTIONS);
  }, [text, orgPeople, onTeam, found, team]);

  const email = query.trim();
  const canInvite =
    isValidEmail(email) &&
    !orgPeople.some(p => p.email.toLowerCase() === text) &&
    !(found ?? []).some(p => p.email.toLowerCase() === text);

  const choose = (next: Pick) => {
    setPick(next);
    setError(null);
    if (next.kind === 'invite') {
      setFirst('');
      setLast('');
    } else {
      const parts = splitName(next.person.name);
      setFirst(parts.first);
      setLast(parts.last);
    }
  };

  const searchEveryone = async () => {
    if (!email) {
      setError('Please enter a name or email address to search.');
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const people = await searchPeople(email);
      setFound(people);
      if (people.length === 0 && !isValidEmail(email)) {
        setError('No one found. To invite someone new, enter their email address.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed. Please try again.');
    } finally {
      setSearching(false);
    }
  };

  const add = async () => {
    if (!pick) {
      return;
    }
    let jerseyNumber = 9999;
    if (team) {
      const parsed = parseJersey(jersey);
      if (!parsed.ok) {
        setError(parsed.error);
        return;
      }
      jerseyNumber = parsed.value;
    }
    setBusy(true);
    setError(null);
    try {
      let done: string;
      if (pick.kind === 'org') {
        await addToTeamFlow({ viewerId, teamId: team!.id, memberId: pick.person.id, name: pick.person.name, roleId: role, jerseyNumber });
        done = `${pick.person.name} was added to ${team!.name}.`;
      } else {
        const name = parseName(first, last);
        if (!name.ok) {
          setError(name.error);
          setBusy(false);
          return;
        }
        const address = pick.kind === 'invite' ? pick.email : pick.person.email;
        await addMemberFlow({ viewerId, orgId, teamId: team?.id ?? 0, email: address, name: name.value, roleId: role, jerseyNumber, message });
        done =
          pick.kind === 'invite'
            ? `${name.value} was added, and an invitation was sent to ${address}.`
            : `${name.value} was added to ${team ? team.name : 'the organization'}.`;
      }
      onChanged();
      onClose();
      Alert.alert('Added', done);
    } catch (e) {
      if (e instanceof PartialSaveError) {
        onChanged();
        onClose();
        Alert.alert('Partly saved', e.message);
      } else {
        setError(e instanceof Error ? e.message : 'Could not add. Please try again.');
        setBusy(false);
      }
    }
  };

  const title = team ? `ADD TO ${team.name.toUpperCase()}` : 'ADD TO ORGANIZATION';

  if (!pick) {
    return (
      <Sheet visible={visible} title={title} onClose={onClose}>
        <Field
          label="Email or name"
          value={query}
          onChangeText={t => {
            setQuery(t);
            setFound(null);
            setError(null);
          }}
          placeholder="Search the organization or enter an email"
          autoCapitalize="none"
          keyboardType="email-address"
          autoFocus
        />
        {canInvite && (
          <Pressable
            onPress={() => choose({ kind: 'invite', email })}
            style={styles.row}
            accessibilityRole="button"
            accessibilityLabel={`Invite ${email}`}
          >
            <Text style={styles.rowName}>Invite {email}</Text>
            <Text style={styles.tag}>New</Text>
          </Pressable>
        )}
        {suggestions.map(s => (
          <Pressable
            key={`${s.kind}:${s.person.id}`}
            onPress={() => s.selectable && choose({ kind: s.kind, person: s.person })}
            disabled={!s.selectable}
            style={[styles.row, !s.selectable && styles.rowDisabled]}
            accessibilityRole="button"
            accessibilityLabel={`Pick ${s.person.name}`}
          >
            <View style={styles.rowText}>
              <Text style={styles.rowName} numberOfLines={1}>
                {s.person.name || s.person.email}
              </Text>
              <Text style={styles.rowEmail} numberOfLines={1}>
                {s.person.email}
              </Text>
            </View>
            <Text style={styles.tag}>{s.tag}</Text>
          </Pressable>
        ))}
        {text !== '' && suggestions.length === 0 && !canInvite && found !== null && (
          <Note>No one found.</Note>
        )}
        <ErrorText>{error}</ErrorText>
        <View style={formStyles.actions}>
          <Button label="SEARCH ALL SNIPBACK USERS" kind="plain" onPress={searchEveryone} busy={searching} />
        </View>
      </Sheet>
    );
  }

  const address = pick.kind === 'invite' ? pick.email : pick.person.email;
  return (
    <Sheet visible={visible} title={title} onClose={onClose}>
      <Value label="Email" value={address} />
      {pick.kind === 'org' && <Note tone="good">Already in this organization.</Note>}
      {pick.kind === 'global' && <Note tone="good">{`${address} already has a Snipback account.`}</Note>}
      {pick.kind === 'invite' && (
        <Note tone="warn">{`${address} doesn't have a Snipback account yet. They'll get an invitation email.`}</Note>
      )}
      {pick.kind === 'org' ? (
        <Value label="Name" value={pick.person.name} />
      ) : (
        <View style={formStyles.row}>
          <View style={formStyles.half}>
            <Field label="First name" value={first} onChangeText={setFirst} placeholder="Enter first name" />
          </View>
          <View style={formStyles.half}>
            <Field label="Last name" value={last} onChangeText={setLast} placeholder="Enter last name (optional)" />
          </View>
        </View>
      )}
      <RoleChips roles={addRoleOptions(viewerIsAdmin)} selected={role} onSelect={r => setRole(r as UserRole)} />
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
      {pick.kind !== 'org' && (
        <Field
          label="Message (optional)"
          value={message}
          onChangeText={setMessage}
          placeholder="Send a message along with the notification email"
          multiline
        />
      )}
      <ErrorText>{error}</ErrorText>
      <View style={formStyles.actions}>
        <Button label={team ? 'ADD TO TEAM' : 'ADD TO ORGANIZATION'} onPress={add} busy={busy} />
        <Button label="BACK" kind="plain" onPress={() => setPick(null)} disabled={busy} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 10,
  },
  rowDisabled: {
    opacity: 0.45,
  },
  rowText: {
    flex: 1,
  },
  rowName: {
    color: colors.white,
    fontSize: 15,
    fontWeight: 'bold',
  },
  rowEmail: {
    color: colors.lightGray,
    fontSize: 13,
  },
  tag: {
    color: colors.midGray,
    fontSize: 12,
  },
});
