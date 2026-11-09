import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { fetchTeamFresh } from '../../api/members';
import {
  fetchCategories,
  fetchTeamDefaults,
  newTeamDefaults,
  type Category,
  type HomeAway,
  type TeamDefaults,
  type TeamFields,
} from '../../api/teamEditor';
import type { Person } from '../../api/types';
import { readOrgRoles, readOrgUsers } from '../../db/repositories';
import { colors } from '../../theme';
import { createTeamFlow, editTeamFlow, type EditorResult } from '../teamEditorActions';
import {
  GAME_MODE_OPTIONS,
  LIVE_OPTIONS,
  PANE_LIMIT,
  PUBLIC_OPTIONS,
  TRACKING_OPTIONS,
  VIEW_OPTIONS,
  abbrInput,
  acceptNameInput,
  addedEntry,
  defaultValue,
  orgPane,
  serverRewritesName,
  setDefault,
  shownDefaults,
  teamPane,
  withCategory,
  type DefaultsField,
  type Option,
  type PaneRow,
} from '../teamEditorRules';
import { Button, ErrorText, Field, Label, Note, OptionChips, Sheet, Value, formStyles } from './FormParts';

// Creating or editing a team (V2CreateTeamViewController with
// TeamDefaultsTableViewController in iOS): name, abbreviation, stats switch,
// sport, home and away game defaults, and the members (the organisation's
// people on the left, the team on the right). The logo can't be changed yet
// (uploads need credentials from the backend); a team keeps the one it has.

export type EditorTarget = { kind: 'create' } | { kind: 'edit'; teamId: number };

type Props = {
  target: EditorTarget | null;
  userId: number;
  orgId: number;
  /** The organisation's sport: a new team starts with it. */
  orgCategory: number;
  onClose: () => void;
  /** Something was saved: the hub refreshes and selects the team (null: keep the selection). */
  onSaved: (teamId: number | null) => void;
};

/** What the editor opened with. */
type Opened = {
  fields: TeamFields;
  members: PaneRow[];
  /** null when the team's defaults couldn't be read (they are then left alone). */
  defaults: HomeAway | null;
  defaultsError: string | null;
};

const DEFAULT_ROWS: Record<DefaultsField, { label: string; options: Option[] }> = {
  gameType: { label: 'Game mode', options: GAME_MODE_OPTIONS },
  isLiveBroadcasting: { label: 'Live streaming', options: LIVE_OPTIONS },
  publicSnipping: { label: 'Public snipping', options: PUBLIC_OPTIONS },
  postToWebsite: { label: 'Post to website', options: PUBLIC_OPTIONS },
  statreportVisibility: { label: 'Stat report', options: PUBLIC_OPTIONS },
  tracking: { label: 'Ball tracking', options: TRACKING_OPTIONS },
  view: { label: 'Preferred view', options: VIEW_OPTIONS },
};

const VENUES: Option[] = [
  { value: 1, label: 'HOME DEFAULT' },
  { value: 2, label: 'AWAY DEFAULT' },
];

let categoriesCache: Category[] | null = null;

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export default function TeamEditorModal({ target, userId, orgId, orgCategory, onClose, onSaved }: Props) {
  const [opened, setOpened] = useState<Opened | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [categories, setCategories] = useState<Category[] | null>(categoriesCache);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);

  const [name, setName] = useState('');
  // Bumped when a typed character is refused, so the field shows the old name again.
  const [, setRefused] = useState(0);
  const [abbr, setAbbr] = useState('');
  const [stat, setStat] = useState(1);
  const [defaults, setDefaults] = useState<HomeAway | null>(null);
  const [venue, setVenue] = useState<1 | 2>(1);
  const [showSports, setShowSports] = useState(false);
  const [teamIds, setTeamIds] = useState<Set<number>>(new Set());
  const [leftPicked, setLeftPicked] = useState<Set<number>>(new Set());
  const [rightPicked, setRightPicked] = useState<Set<number>>(new Set());
  const [leftSearch, setLeftSearch] = useState('');
  const [rightSearch, setRightSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetKey = target ? (target.kind === 'edit' ? `edit:${target.teamId}` : 'create') : null;

  // Open: read the team fresh (edit), its saved defaults and the sports list.
  useEffect(() => {
    setOpened(null);
    setLoadError(null);
    setError(null);
    setBusy(false);
    setVenue(1);
    setShowSports(false);
    setLeftPicked(new Set());
    setRightPicked(new Set());
    setLeftSearch('');
    setRightSearch('');
    if (!target) {
      return;
    }
    let cancelled = false;
    const ready = (o: Opened) => {
      if (cancelled) {
        return;
      }
      setOpened(o);
      setName(o.fields.name);
      setAbbr(o.fields.abbr);
      setStat(o.fields.statEnable);
      setDefaults(o.defaults);
      setTeamIds(new Set(o.members.map(m => m.userId)));
    };
    if (target.kind === 'create') {
      ready({
        fields: { name: '', abbr: '', statEnable: 1 },
        members: [],
        defaults: { home: newTeamDefaults(1, orgCategory), away: newTeamDefaults(2, orgCategory) },
        defaultsError: null,
      });
    } else {
      (async () => {
        try {
          const fresh = await fetchTeamFresh(userId, target.teamId);
          let teamDefaults: HomeAway | null = null;
          let defaultsError: string | null = null;
          try {
            teamDefaults = await fetchTeamDefaults(target.teamId);
          } catch (e) {
            defaultsError = errorText(e, "This team's game defaults couldn't be read.");
          }
          ready({
            fields: { name: fresh.name, abbr: fresh.abbr, statEnable: fresh.statEnable },
            members: fresh.team.members.map(m => ({ userId: m.userId, name: m.userName, email: m.userEmail })),
            defaults: teamDefaults,
            defaultsError,
          });
        } catch (e) {
          if (!cancelled) {
            setLoadError(errorText(e, "Couldn't load this team. Please try again."));
          }
        }
      })();
    }
    if (!categoriesCache) {
      fetchCategories()
        .then(list => {
          categoriesCache = list;
          if (!cancelled) {
            setCategories(list);
          }
        })
        .catch(e => {
          if (!cancelled) {
            setCategoriesError(errorText(e, "The sports list couldn't be loaded."));
          }
        });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when another team opens or on retry
  }, [targetKey, attempt]);

  // The organisation's people and roles, from the store (synced with the teams).
  const { people, roles } = useMemo(() => {
    if (!target) {
      return { people: [] as Person[], roles: new Map<number, number>() };
    }
    try {
      return { people: readOrgUsers(orgId), roles: readOrgRoles(orgId) };
    } catch {
      return { people: [] as Person[], roles: new Map<number, number>() };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once per opening
  }, [targetKey, orgId]);

  const memberInfo = useMemo(() => {
    const info = new Map<number, PaneRow>();
    for (const p of people) {
      info.set(p.id, { userId: p.id, name: p.name || p.email, email: p.email });
    }
    for (const m of opened?.members ?? []) {
      info.set(m.userId, { ...m, name: info.get(m.userId)?.name || m.name || m.email });
    }
    return info;
  }, [people, opened]);

  if (!target) {
    return null;
  }

  const isEdit = target.kind === 'edit';
  const title = isEdit ? 'EDIT TEAM' : 'CREATE NEW TEAM';

  if (loadError || !opened) {
    return (
      <Sheet visible wide title={title} onClose={onClose}>
        {loadError ? (
          <>
            <ErrorText>{loadError}</ErrorText>
            <View style={formStyles.actions}>
              <Button label="TRY AGAIN" onPress={() => setAttempt(a => a + 1)} />
              <Button label="CANCEL" kind="plain" onPress={onClose} />
            </View>
          </>
        ) : (
          <Note>Loading team…</Note>
        )}
      </Sheet>
    );
  }

  const rolesKnown = roles.size > 0;
  // The server puts the creator on a new team itself; listing them too could
  // put them on it twice (which then blocks every later change to the team).
  const left = orgPane(isEdit ? people : people.filter(p => p.id !== userId), teamIds, leftSearch);
  const right = teamPane(
    [...teamIds].map(id => memberInfo.get(id) ?? { userId: id, name: `User ${id}`, email: '' }),
    rightSearch,
  );
  const category = defaults?.home.category ?? orgCategory;
  const categoryName = categories?.find(c => c.id === category)?.name ?? `Sport ${category}`;
  const row: TeamDefaults | null = defaults ? (venue === 1 ? defaults.home : defaults.away) : null;

  const typeName = (text: string) => {
    const next = acceptNameInput(name, text);
    if (next === name) {
      setRefused(n => n + 1);
    }
    setName(next);
    setError(null);
  };

  const changeDefault = (field: DefaultsField, value: number) => {
    if (!defaults || !row) {
      return;
    }
    const updated = setDefault(row, field, value);
    setDefaults(venue === 1 ? { ...defaults, home: updated } : { ...defaults, away: updated });
  };

  const toggle = (set: Set<number>, id: number) => {
    const next = new Set(set);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    return next;
  };

  const addPicked = () => {
    if (leftPicked.size === 0) {
      Alert.alert('', 'Please select at least one person to add.');
      return;
    }
    setTeamIds(new Set([...teamIds, ...leftPicked]));
    setLeftPicked(new Set());
  };

  const removePicked = () => {
    if (rightPicked.size === 0) {
      Alert.alert('', 'Please select at least one person to remove.');
      return;
    }
    setTeamIds(new Set([...teamIds].filter(id => !rightPicked.has(id))));
    setRightPicked(new Set());
  };

  const finish = (result: EditorResult, savedName: string) => {
    onSaved(result.team?.id ?? null);
    onClose();
    if (result.defaultsError) {
      Alert.alert(
        'Partly saved',
        `${savedName} was saved, but its game defaults couldn't be: ${result.defaultsError}`,
      );
    } else if (result.renamed && result.team) {
      Alert.alert('Saved', `The team was saved as "${result.team.name}" (the server changed the name).`);
    } else if (!isEdit) {
      Alert.alert('Team created', `${savedName} was created.`);
    }
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    const openedIds = new Set(opened.members.map(m => m.userId));
    const added = [...teamIds].filter(id => !openedIds.has(id)).map(id => addedEntry(id, roles));
    const removed = [...openedIds].filter(id => !teamIds.has(id));
    try {
      if (target.kind === 'create') {
        if (!defaults) {
          setBusy(false);
          return;
        }
        const result = await createTeamFlow({ userId, orgId, name, abbr, statEnable: stat, members: added, defaults });
        finish(result, result.team.name);
      } else {
        const result = await editTeamFlow({
          userId,
          teamId: target.teamId,
          opened: opened.fields,
          fields: { name, abbr, statEnable: stat },
          added,
          removed,
          defaults: opened.defaults && defaults ? { opened: opened.defaults, now: defaults } : null,
        });
        if (result === null) {
          onClose(); // nothing changed
          return;
        }
        finish(result, result.team?.name ?? name.trim());
      }
    } catch (e) {
      setError(errorText(e, 'Could not save the team. Please try again.'));
      setBusy(false);
    }
  };

  return (
    <Sheet visible wide title={title} onClose={() => !busy && onClose()}>
      <View style={formStyles.row}>
        <View style={styles.nameBox}>
          <Field label="Team name" value={name} onChangeText={typeName} placeholder="Enter team name" />
        </View>
        <View style={styles.abbrBox}>
          <Field
            label="Abbreviation"
            value={abbr}
            onChangeText={t => setAbbr(abbrInput(t))}
            placeholder="ABC"
            autoCapitalize="characters"
            maxLength={3}
          />
        </View>
        <View style={styles.statBox}>
          <Label>Stats</Label>
          <Switch
            value={stat === 1}
            onValueChange={on => setStat(on ? 1 : 0)}
            trackColor={{ true: colors.themeRed, false: colors.border }}
            accessibilityLabel="Stats"
          />
        </View>
      </View>
      {serverRewritesName(name) && (
        <Note tone="warn">
          The server changes "-" to "_" in team names, so a name with "-" can't be saved from the app yet.
        </Note>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>SPORT AND GAME DEFAULTS</Text>
        {defaults === null ? (
          <Note tone="warn">{`${opened.defaultsError ?? "This team's game defaults couldn't be read."} They won't be changed.`}</Note>
        ) : (
          <>
            <View style={styles.sportRow}>
              <Value label="Sport" value={categoryName} />
              <Pressable
                onPress={() => setShowSports(s => !s)}
                disabled={!categories}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Change sport"
              >
                <Text style={[styles.link, !categories && styles.linkOff]}>{showSports ? 'DONE' : 'CHANGE'}</Text>
              </Pressable>
            </View>
            {categoriesError && !categories && <Note>{`The sports list couldn't be loaded: ${categoriesError}`}</Note>}
            {showSports && categories && (
              <OptionChips
                label="Sport"
                options={categories.map(c => ({ value: c.id, label: c.name }))}
                selected={category}
                onSelect={value => {
                  setDefaults(withCategory(defaults, value));
                  setShowSports(false);
                }}
              />
            )}
            <OptionChips label="Default for" options={VENUES} selected={venue} onSelect={v => setVenue(v as 1 | 2)} />
            {row &&
              shownDefaults(row).map(field => (
                <OptionChips
                  key={field}
                  label={DEFAULT_ROWS[field].label}
                  options={DEFAULT_ROWS[field].options}
                  selected={defaultValue(row, field)}
                  onSelect={value => changeDefault(field, value)}
                />
              ))}
            {row && (row.facilitycamRoomId > 0 || row.facilitycamDuration > 0) && (
              <Note>Facility camera scheduling for this default is kept as it is (it can't be changed in the app yet).</Note>
            )}
          </>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>MEMBERS</Text>
        {!rolesKnown && <Note>Loading the organisation's roles… people can be added once they have loaded.</Note>}
        {!isEdit && <Note>You're added to a new team automatically.</Note>}
        <View style={styles.panes}>
          <Pane
            title="ORGANIZATION MEMBERS"
            rows={left}
            picked={leftPicked}
            onPick={id => setLeftPicked(toggle(leftPicked, id))}
            search={leftSearch}
            onSearch={setLeftSearch}
          />
          <View style={styles.moves}>
            <Button label="ADD →" kind="plain" onPress={addPicked} disabled={!rolesKnown || busy} />
            <Button label="← REMOVE" kind="plain" onPress={removePicked} disabled={busy} />
          </View>
          <Pane
            title="TEAM MEMBERS"
            rows={right}
            picked={rightPicked}
            onPick={id => setRightPicked(toggle(rightPicked, id))}
            search={rightSearch}
            onSearch={setRightSearch}
          />
        </View>
      </View>

      <ErrorText>{error}</ErrorText>
      <View style={formStyles.actions}>
        <Button label={isEdit ? 'UPDATE' : 'SAVE'} onPress={save} busy={busy} disabled={!defaults && !isEdit} />
        <Button label="CANCEL" kind="plain" onPress={onClose} disabled={busy} />
      </View>
    </Sheet>
  );
}

function Pane({
  title,
  rows,
  picked,
  onPick,
  search,
  onSearch,
}: {
  title: string;
  rows: PaneRow[];
  picked: Set<number>;
  onPick: (id: number) => void;
  search: string;
  onSearch: (text: string) => void;
}) {
  const shown = rows.slice(0, PANE_LIMIT);
  return (
    <View style={styles.pane}>
      <Text style={styles.paneTitle}>{`${title} (${rows.length})`}</Text>
      <TextInput
        value={search}
        onChangeText={onSearch}
        placeholder="Search name or email"
        placeholderTextColor={colors.midGray}
        style={styles.search}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={`Search ${title.toLowerCase()}`}
      />
      <ScrollView style={styles.paneList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
        {shown.map(r => {
          const isPicked = picked.has(r.userId);
          return (
            <Pressable
              key={r.userId}
              onPress={() => onPick(r.userId)}
              style={[styles.person, isPicked && styles.personPicked]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isPicked }}
              accessibilityLabel={`${title === 'TEAM MEMBERS' ? 'Team member' : 'Organization member'} ${r.name}`}
            >
              <Text style={styles.check}>{isPicked ? '☑' : '☐'}</Text>
              <View style={styles.personText}>
                <Text style={styles.personName} numberOfLines={1}>
                  {r.name}
                </Text>
                {r.email !== '' && (
                  <Text style={styles.personEmail} numberOfLines={1}>
                    {r.email}
                  </Text>
                )}
              </View>
            </Pressable>
          );
        })}
        {rows.length > PANE_LIMIT && (
          <Text style={styles.more}>{`Showing ${PANE_LIMIT} of ${rows.length}. Search to find others.`}</Text>
        )}
        {rows.length === 0 && <Text style={styles.more}>No one here.</Text>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  nameBox: {
    flex: 3,
  },
  abbrBox: {
    flex: 1,
  },
  statBox: {
    marginTop: 12,
    alignItems: 'flex-start',
  },
  section: {
    marginTop: 18,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  sectionTitle: {
    color: colors.white,
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 1.5,
  },
  sportRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  link: {
    color: colors.themeRed,
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 1,
    paddingBottom: 2,
  },
  linkOff: {
    opacity: 0.4,
  },
  panes: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  pane: {
    flex: 1,
  },
  paneTitle: {
    color: colors.midGray,
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 6,
  },
  search: {
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: colors.field,
    color: colors.white,
    fontSize: 14,
  },
  paneList: {
    height: 260,
    marginTop: 6,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  moves: {
    width: 130,
    justifyContent: 'center',
    gap: 10,
  },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  personPicked: {
    backgroundColor: colors.field,
  },
  check: {
    color: colors.lightGray,
    fontSize: 16,
  },
  personText: {
    flex: 1,
  },
  personName: {
    color: colors.white,
    fontSize: 14,
  },
  personEmail: {
    color: colors.midGray,
    fontSize: 12,
  },
  more: {
    color: colors.midGray,
    fontSize: 12,
    padding: 10,
  },
});
