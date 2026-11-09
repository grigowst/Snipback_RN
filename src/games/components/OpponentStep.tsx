import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { searchOpponents, type OpponentSearch, type OpponentTeamRow } from '../../api/gameCreate';
import { colors } from '../../theme';
import { saveOpponentFlow } from '../../teams/teamActions';
import { Button, ErrorText, Field, Note, formStyles } from '../../teams/components/FormParts';
import { GENERIC_OPPONENT, type OpponentChoice } from '../gameForm';

// Picking the opponent (OpponentTeamPickerViewController in iOS): the
// organisation's opponent directory, a search of every SnipBack team from two
// letters, its name-only opponents, the generic "Opponent", and adding a new
// name-only opponent.

type Props = {
  userId: number;
  orgId: number;
  /** The game's sport (0 = any); the search starts narrowed to it. */
  sportId: number;
  /** The game's own team: left out of the search, and refused if picked. */
  myTeamId: number;
  current: OpponentChoice;
  onPick: (opponent: OpponentChoice) => void;
  onBack: () => void;
};

const EMPTY: OpponentSearch = { directory: [], results: [], named: [], page: 1, hasMore: false };
const DEBOUNCE_MS = 250;

export default function OpponentStep({ userId, orgId, sportId, myTeamId, current, onPick, onBack }: Props) {
  const [query, setQuery] = useState('');
  const [sportOnly, setSportOnly] = useState(sportId > 0);
  const [includeOlder, setIncludeOlder] = useState(false);
  const [found, setFound] = useState<OpponentSearch>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  // Only the latest request's answer counts.
  const latest = useRef(0);

  const run = async (page: number) => {
    const q = query.trim();
    const mine = ++latest.current;
    if (q.length === 1) {
      setFound(EMPTY);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await searchOpponents({
        orgId,
        query: q,
        sportId: sportOnly ? sportId : 0,
        includeOlder,
        excludeTeamIds: [myTeamId],
        page,
      });
      if (mine !== latest.current) {
        return;
      }
      setFound(prev => (page === 1 ? next : { ...prev, results: [...prev.results, ...next.results], page: next.page, hasMore: next.hasMore }));
    } catch (e) {
      if (mine === latest.current) {
        setError(e instanceof Error ? e.message : 'The search is not available right now.');
      }
    } finally {
      if (mine === latest.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => run(1), DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new search for each change
  }, [query, sportOnly, includeOlder]);

  const pickTeam = (row: OpponentTeamRow) => {
    if (row.teamId === myTeamId) {
      setError('The opponent team cannot be the same as your team.');
      return;
    }
    onPick({ id: row.teamId, name: row.label, teamType: 0, nameOnly: false });
  };

  const addOpponent = async () => {
    setBusy(true);
    setError(null);
    try {
      const { opponent } = await saveOpponentFlow({ userId, orgId, name: newName });
      onPick({ id: opponent.id, name: opponent.name, teamType: 1, nameOnly: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the opponent. Please try again.');
      setBusy(false);
    }
  };

  if (adding) {
    return (
      <View>
        <Field
          label="Opponent team name"
          value={newName}
          onChangeText={setNewName}
          placeholder="A name only, not a SnipBack team"
          autoFocus
        />
        <ErrorText>{error}</ErrorText>
        <View style={formStyles.actions}>
          <Button label="ADD OPPONENT" onPress={addOpponent} busy={busy} disabled={newName.trim() === ''} />
          <Button label="BACK" kind="plain" onPress={() => setAdding(false)} disabled={busy} />
        </View>
      </View>
    );
  }

  const inDirectory = new Set(found.directory.map(r => r.teamId));
  const results = found.results.filter(r => !inDirectory.has(r.teamId));
  const q = query.trim();
  const note =
    loading && results.length === 0
      ? 'Searching…'
      : q.length < 2
        ? 'Type at least 2 letters to search every SnipBack team.'
        : results.length === 0 && found.directory.length === 0 && found.named.length === 0
          ? includeOlder
            ? 'No teams found.'
            : 'No teams found. Turn on Include older teams to look further back.'
          : null;

  return (
    <View>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search school, program or team"
        placeholderTextColor={colors.midGray}
        style={styles.search}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        accessibilityLabel="Search opponent teams"
      />
      <View style={styles.filters}>
        {sportId > 0 && (
          <Toggle label="This sport only" value={sportOnly} onChange={setSportOnly} />
        )}
        <Toggle label="Include older teams" value={includeOlder} onChange={setIncludeOlder} />
      </View>
      {note && <Note>{note}</Note>}
      <ErrorText>{error}</ErrorText>

      <Section title="YOUR OPPONENTS">
        {found.directory.map(r => (
          <TeamRow key={`d${r.teamId}`} row={r} checked={!current.nameOnly && current.id === r.teamId} onPress={() => pickTeam(r)} />
        ))}
      </Section>
      <Section title="SNIPBACK TEAMS">
        {results.map(r => (
          <TeamRow key={`r${r.teamId}`} row={r} checked={!current.nameOnly && current.id === r.teamId} onPress={() => pickTeam(r)} />
        ))}
        {found.hasMore && (
          <Row title={loading ? 'Loading…' : 'Load more'} accent onPress={() => !loading && run(found.page + 1)} a11y="Load more teams" />
        )}
      </Section>
      <Section title="NAME-ONLY OPPONENTS">
        {found.named.map(o => (
          <Row
            key={`n${o.opponentId}`}
            title={o.name}
            detail={o.abbr ? `${o.abbr} · name only` : 'Name only'}
            checked={current.nameOnly && current.id === o.opponentId}
            onPress={() => onPick({ id: o.opponentId, name: o.name, teamType: 1, nameOnly: true })}
            a11y={`Opponent ${o.name}`}
          />
        ))}
      </Section>
      <Section title="OTHER">
        <Row
          title="Opponent"
          detail="No team named"
          checked={current.id === 0}
          onPress={() => onPick(GENERIC_OPPONENT)}
          a11y="Opponent (no team named)"
        />
        <Row title="+ Add opponent" detail="A name only, not a SnipBack team" accent onPress={() => setAdding(true)} a11y="Add opponent" />
      </Section>
      <View style={formStyles.actions}>
        <Button label="BACK" kind="plain" onPress={onBack} />
      </View>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const items = React.Children.toArray(children).filter(Boolean);
  if (items.length === 0) {
    return null;
  }
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {items}
    </View>
  );
}

function TeamRow({ row, checked, onPress }: { row: OpponentTeamRow; checked: boolean; onPress: () => void }) {
  const meta = [row.sport, row.gender ? row.gender[0].toUpperCase() + row.gender.slice(1) : '', row.isOlder ? 'Older team' : '', row.sameSchool ? 'your school' : '']
    .filter(Boolean)
    .join(' · ');
  return <Row title={row.label} detail={meta} checked={checked} onPress={onPress} a11y={`Opponent ${row.label}`} />;
}

function Row({
  title,
  detail,
  checked = false,
  accent = false,
  onPress,
  a11y,
}: {
  title: string;
  detail?: string;
  checked?: boolean;
  accent?: boolean;
  onPress: () => void;
  a11y: string;
}) {
  return (
    <Pressable onPress={onPress} style={styles.row} accessibilityRole="button" accessibilityState={{ selected: checked }} accessibilityLabel={a11y}>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, accent && styles.accent]} numberOfLines={2}>
          {title}
        </Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      {checked && <Text style={styles.check}>✓</Text>}
    </Pressable>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggle}>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.themeRed, false: colors.border }} accessibilityLabel={label} />
      <Text style={styles.toggleText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  search: {
    height: 40,
    marginTop: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.field,
    color: colors.white,
    fontSize: 15,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 10,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleText: {
    color: colors.lightGray,
    fontSize: 13,
  },
  section: {
    marginTop: 14,
  },
  sectionTitle: {
    color: colors.midGray,
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    color: colors.white,
    fontSize: 15,
  },
  accent: {
    color: colors.themeRed,
    fontWeight: 'bold',
  },
  rowDetail: {
    color: colors.midGray,
    fontSize: 12,
    marginTop: 2,
  },
  check: {
    color: colors.themeRed,
    fontSize: 18,
    paddingHorizontal: 6,
  },
});
