import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ApiError } from '../../api/client';
import { createGame, fetchTimeZones, zoneLabel, type StateTimeZone } from '../../api/gameCreate';
import type { GameTab } from '../../api/games';
import { fetchCategoriesCached, fetchTeamDefaults, type Category, type HomeAway } from '../../api/teamEditor';
import type { Organization, Team } from '../../api/types';
import { colors } from '../../theme';
import { Button, ErrorText, Field, Label, Note, OptionChips, Sheet, Value, formStyles } from '../../teams/components/FormParts';
import { acceptNameInput } from '../../teams/teamEditorRules';
import {
  GAME_KIND_OPTIONS,
  applyTeamDefaults,
  createGameBody,
  defaultZoneId,
  newGameForm,
  shownParts,
  withSport,
  type GameForm,
} from '../gameForm';
import { deviceZone, formatDate, formatTime, wallTime } from '../zonedTime';
import OpponentStep from './OpponentStep';
import StartPicker from './StartPicker';

// Creating a game (CreateGameVC / CreateGameVM in iOS), online. Name, mode,
// start on the venue's clock, home or away, game type, sport, opponent,
// other teams and the advanced options. Cameras, payment, volleyball
// rotation, video upload and offline creation aren't built.

type Props = {
  visible: boolean;
  userId: number;
  org: Organization;
  isHomeOrg: boolean;
  /** The team the game is for; null in HOME. */
  team: { id: number; name: string } | null;
  /** The list's tab: the game's starting mode. */
  tab: GameTab;
  /** The organisation's teams (Other Teams). */
  orgTeams: Team[];
  onClose: () => void;
  /** A game was created (or may have been): show that tab's list, refreshed. */
  onCreated: (tab: GameTab) => void;
};

type Step = 'form' | 'start' | 'zone' | 'opponent' | 'others';

const MODES = [
  { value: 0, tab: 'GAMES' as GameTab, label: 'GAMES' },
  { value: 1, tab: 'PRACTICES' as GameTab, label: 'PRACTICE' },
  { value: 2, tab: 'SCOUT' as GameTab, label: 'SCOUT' },
];
const PUBLIC = [
  { value: 1, label: 'PUBLIC' },
  { value: 0, label: 'PRIVATE' },
];
const ON_OFF = (on: number) => [
  { value: on, label: 'ENABLED' },
  { value: 0, label: 'DISABLED' },
];
const VIEWS = [
  { value: 1, label: 'CENTER VIEW' },
  { value: 2, label: 'CORNER VIEW' },
];

const zonesCache = new Map<number, { zones: StateTimeZone[]; selected: number }>();

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export default function CreateGameModal({ visible, userId, org, isHomeOrg, team, tab, orgTeams, onClose, onCreated }: Props) {
  const [step, setStep] = useState<Step>('form');
  const [form, setForm] = useState<GameForm>(() => newGameForm({ tab, start: 0, zoneId: 0, category: 0 }));
  const [, setRefused] = useState(0);
  const [zones, setZones] = useState<StateTimeZone[] | null>(null);
  const [zonePicked, setZonePicked] = useState(false);
  const [zoneSearch, setZoneSearch] = useState('');
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [teamDefaults, setTeamDefaults] = useState<HomeAway | null>(null);
  const [showSports, setShowSports] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Open: a new form, the time zones, the sports and the team's defaults.
  useEffect(() => {
    if (!visible) {
      return;
    }
    let cancelled = false;
    setStep('form');
    setForm(newGameForm({ tab, start: Math.floor(Date.now() / 1000), zoneId: 0, category: 0 }));
    setZonePicked(false);
    setZoneSearch('');
    setTeamDefaults(null);
    setShowSports(false);
    setShowAdvanced(false);
    setBusy(false);
    setError(null);

    const cached = zonesCache.get(org.orgId);
    const zoneList = cached ? Promise.resolve(cached) : fetchTimeZones(org.orgId);
    zoneList
      .then(z => {
        zonesCache.set(org.orgId, z);
        if (!cancelled) {
          setZones(z.zones);
          const id = defaultZoneId(z.zones, z.selected, deviceZone());
          setForm(f => (f.zoneId === 0 ? { ...f, zoneId: id } : f));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setZones([]);
        }
      });
    fetchCategoriesCached()
      .then(list => !cancelled && setCategories(list))
      .catch(() => {});
    if (team) {
      fetchTeamDefaults(team.id)
        .then(d => {
          if (!cancelled) {
            setTeamDefaults(d);
            setForm(f => applyTeamDefaults(f, f.venue === 2 ? d.away : d.home));
          }
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a fresh form each time it opens
  }, [visible]);

  const zone = useMemo(() => zones?.find(z => z.id === form.zoneId), [zones, form.zoneId]);
  const otherTeams = useMemo(
    () =>
      orgTeams
        .filter(t => t.isArchive === 0 && t.teamType === 0 && t.isDeleted === 0 && t.id !== team?.id)
        .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())),
    [orgTeams, team],
  );

  if (!visible) {
    return null;
  }

  const parts = shownParts(form, isHomeOrg);
  const set = (patch: Partial<GameForm>) => setForm(f => ({ ...f, ...patch }));
  const title = team ? `CREATE GAME FOR ${team.name.toUpperCase()}` : 'CREATE GAME';
  const w = wallTime(form.start, zone?.identifier);
  const categoryName = form.category > 0 ? categories?.find(c => c.id === form.category)?.name ?? `Sport ${form.category}` : 'Select';

  const typeName = (text: string) => {
    const next = acceptNameInput(form.name, text);
    if (next === form.name) {
      setRefused(n => n + 1);
    }
    set({ name: next });
    setError(null);
  };

  const changeVenue = (venue: 1 | 2) => {
    // A new venue starts from that venue's saved defaults, as iOS does.
    setForm(f => {
      const next = { ...f, venue };
      return teamDefaults ? applyTeamDefaults(next, venue === 2 ? teamDefaults.away : teamDefaults.home) : next;
    });
  };

  const create = async () => {
    if (form.name.trim() === '') {
      setError('Please enter a name.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createGame(createGameBody(form, { userId, orgId: org.orgId, myTeam: team ? { id: team.id, teamType: 0 } : null }));
      onCreated(form.tab);
      onClose();
      Alert.alert('Game created', `${form.name.trim()} was created.`);
    } catch (e) {
      if (e instanceof ApiError && e.statusCode === undefined) {
        // No answer: it may have been created. Never retried automatically.
        onCreated(form.tab);
        setError(
          `${e.message} The game may still have been created: check the list before trying again.`,
        );
      } else {
        setError(errorText(e, 'Could not create the game. Please try again.'));
      }
      setBusy(false);
    }
  };

  const close = () => !busy && onClose();

  if (step === 'start') {
    return (
      <Sheet visible title="STARTS" onClose={close}>
        <Note>{zone ? `On the venue's clock: ${zoneLabel(zone)}` : "On this device's clock."}</Note>
        <StartPicker start={form.start} zone={zone?.identifier} onChange={start => set({ start })} />
        <View style={formStyles.actions}>
          <Button label="DONE" onPress={() => setStep('form')} />
        </View>
      </Sheet>
    );
  }

  if (step === 'zone') {
    const text = zoneSearch.trim().toLowerCase();
    const shown = (zones ?? []).filter(z => text === '' || zoneLabel(z).toLowerCase().includes(text));
    return (
      <Sheet visible title="TIME ZONE" onClose={close}>
        <Note>Changing the zone shows the same start on that zone's clock.</Note>
        <TextInput
          value={zoneSearch}
          onChangeText={setZoneSearch}
          placeholder="Search state or time zone"
          placeholderTextColor={colors.midGray}
          style={styles.search}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Search time zones"
        />
        {shown.map(z => (
          <Pressable
            key={z.id}
            onPress={() => {
              set({ zoneId: z.id });
              setZonePicked(true);
              setStep('form');
            }}
            style={styles.listRow}
            accessibilityRole="button"
            accessibilityState={{ selected: z.id === form.zoneId }}
            accessibilityLabel={`Time zone ${zoneLabel(z)}`}
          >
            <Text style={styles.listText}>{zoneLabel(z)}</Text>
            {z.id === form.zoneId && <Text style={styles.check}>✓</Text>}
          </Pressable>
        ))}
        <View style={formStyles.actions}>
          <Button label="BACK" kind="plain" onPress={() => setStep('form')} />
        </View>
      </Sheet>
    );
  }

  if (step === 'opponent') {
    return (
      <Sheet visible title="OPPONENT TEAM" onClose={close}>
        <OpponentStep
          userId={userId}
          orgId={org.orgId}
          sportId={form.category}
          myTeamId={team?.id ?? 0}
          current={form.opponent}
          onPick={opponent => {
            set({ opponent });
            setStep('form');
          }}
          onBack={() => setStep('form')}
        />
      </Sheet>
    );
  }

  if (step === 'others') {
    return (
      <Sheet visible title="OTHER TEAMS" onClose={close}>
        <Note>The game also shows for these teams.</Note>
        {otherTeams.map(t => {
          const picked = form.otherTeamIds.includes(t.id);
          return (
            <Pressable
              key={t.id}
              onPress={() =>
                set({ otherTeamIds: picked ? form.otherTeamIds.filter(id => id !== t.id) : [...form.otherTeamIds, t.id] })
              }
              style={styles.listRow}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: picked }}
              accessibilityLabel={`Other team ${t.name}`}
            >
              <Text style={styles.check}>{picked ? '☑' : '☐'}</Text>
              <Text style={styles.listText}>{t.name}</Text>
            </Pressable>
          );
        })}
        <View style={formStyles.actions}>
          <Button label="DONE" onPress={() => setStep('form')} />
        </View>
      </Sheet>
    );
  }

  return (
    <Sheet visible title={title} onClose={close}>
      <Field label="Name" value={form.name} onChangeText={typeName} placeholder="Enter game name" />
      <OptionChips
        label="Mode"
        options={MODES}
        selected={MODES.find(m => m.tab === form.tab)?.value ?? 0}
        onSelect={v => set({ tab: MODES.find(m => m.value === v)?.tab ?? 'GAMES' })}
      />

      <PickRow label="Starts" value={`${formatDate(w)} · ${formatTime(w)}`} onPress={() => setStep('start')} a11y="Change start" />
      <PickRow
        label="Time zone"
        value={zones === null ? 'Loading…' : zone ? zoneLabel(zone) : "This device's clock"}
        onPress={() => zones && zones.length > 0 && setStep('zone')}
        a11y="Change time zone"
      />
      {!zonePicked && zone && <Note>{"The organisation's zone, or this device's."}</Note>}

      {parts.venue && (
        <OptionChips
          label="Venue"
          options={[
            { value: 1, label: 'HOME' },
            { value: 2, label: 'AWAY' },
          ]}
          selected={form.venue}
          onSelect={v => changeVenue(v as 1 | 2)}
        />
      )}
      {parts.gameKind && (
        <OptionChips label="Game type" options={GAME_KIND_OPTIONS} selected={form.gameKind} onSelect={gameKind => set({ gameKind })} />
      )}

      <View style={styles.sportRow}>
        <Value label="Category (optional)" value={categoryName} />
        <Pressable onPress={() => setShowSports(s => !s)} disabled={!categories} hitSlop={8} accessibilityRole="button" accessibilityLabel="Change category">
          <Text style={[styles.link, !categories && styles.linkOff]}>{showSports ? 'DONE' : 'CHANGE'}</Text>
        </Pressable>
      </View>
      {showSports && categories && (
        <OptionChips
          label="Category"
          options={categories.map(c => ({ value: c.id, label: c.name }))}
          selected={form.category}
          onSelect={c => {
            setForm(f => withSport(f, c));
            setShowSports(false);
          }}
        />
      )}

      {parts.teams && (
        <>
          <PickRow label="Opponent team" value={form.opponent.name} onPress={() => setStep('opponent')} a11y="Choose opponent team" />
          {form.opponent.nameOnly && <Note>A name-only opponent (not a SnipBack team).</Note>}
          <PickRow
            label="Other teams (optional)"
            value={
              form.otherTeamIds.length === 0
                ? 'None'
                : otherTeams.filter(t => form.otherTeamIds.includes(t.id)).map(t => t.name).join(', ')
            }
            onPress={() => setStep('others')}
            a11y="Choose other teams"
          />
        </>
      )}

      {parts.advanced && (
        <View style={styles.advanced}>
          <Pressable onPress={() => setShowAdvanced(s => !s)} accessibilityRole="button" accessibilityLabel="Advanced features">
            <Text style={styles.advancedTitle}>{`ADVANCED FEATURES ${showAdvanced ? '▲' : '▼'}`}</Text>
          </Pressable>
          {showAdvanced && (
            <>
              <OptionChips label="Live snipping" options={PUBLIC} selected={form.publicSnipping} onSelect={publicSnipping => set({ publicSnipping })} />
              {parts.websiteLocked ? (
                <View style={styles.locked}>
                  <Label>{isHomeOrg ? 'Show on public homepage' : 'Show on SnipBack.com'}</Label>
                  <Note>All Practices/Scout are Private</Note>
                </View>
              ) : (
                <OptionChips
                  label={isHomeOrg ? 'Show on public homepage' : 'Show on SnipBack.com'}
                  options={PUBLIC}
                  selected={form.postToWebsite}
                  onSelect={postToWebsite => set({ postToWebsite })}
                />
              )}
              <OptionChips label="Make stat public" options={PUBLIC} selected={form.statreportVisibility} onSelect={statreportVisibility => set({ statreportVisibility })} />
              <OptionChips
                label="Secondary low-quality (LQ) stream"
                options={ON_OFF(2)}
                selected={form.isLiveBroadcasting}
                onSelect={isLiveBroadcasting => set({ isLiveBroadcasting })}
              />
              {parts.ballTracking && (
                <>
                  <OptionChips
                    label="Ball tracking"
                    options={ON_OFF(1)}
                    selected={form.balltracking > 0 ? 1 : 0}
                    onSelect={v => set({ balltracking: v === 0 ? 0 : Math.max(1, form.balltracking) })}
                  />
                  {form.balltracking > 0 && (
                    <OptionChips label="Ball view" options={VIEWS} selected={form.balltracking} onSelect={balltracking => set({ balltracking })} />
                  )}
                </>
              )}
              <Note>Payment: free (paid games aren't available in the app yet).</Note>
            </>
          )}
        </View>
      )}

      <ErrorText>{error}</ErrorText>
      <View style={formStyles.actions}>
        <Button label="CREATE" onPress={create} busy={busy} />
        <Button label="CANCEL" kind="plain" onPress={close} disabled={busy} />
      </View>
    </Sheet>
  );
}

function PickRow({ label, value, onPress, a11y }: { label: string; value: string; onPress: () => void; a11y: string }) {
  return (
    <Pressable onPress={onPress} style={styles.pickRow} accessibilityRole="button" accessibilityLabel={a11y}>
      <View style={styles.pickText}>
        <Label>{label}</Label>
        <Text style={styles.pickValue} numberOfLines={2}>
          {value}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pickText: {
    flex: 1,
  },
  pickValue: {
    color: colors.white,
    fontSize: 16,
  },
  chevron: {
    color: colors.midGray,
    fontSize: 24,
    paddingHorizontal: 6,
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
  advanced: {
    marginTop: 18,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  advancedTitle: {
    color: colors.white,
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 1.5,
  },
  locked: {
    marginTop: 12,
  },
  search: {
    height: 40,
    marginTop: 12,
    marginBottom: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.field,
    color: colors.white,
    fontSize: 15,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  listText: {
    flex: 1,
    color: colors.white,
    fontSize: 15,
  },
  check: {
    color: colors.themeRed,
    fontSize: 16,
  },
});
