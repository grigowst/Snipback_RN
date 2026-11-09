import { ApiError } from '../api/client';
import { fetchTeamFresh, type RosterEntry } from '../api/members';
import {
  createTeam,
  saveTeamDefaults,
  sendTeamUpdate,
  type HomeAway,
  type TeamFields,
} from '../api/teamEditor';
import type { Team } from '../api/types';
import { writeTeam } from '../db/repositories';
import {
  defaultsChanged,
  editorEntries,
  rewrittenNameMessage,
  serverRewritesName,
  teamNameCheck,
} from './teamEditorRules';

// Saving the team editor. Every check runs before the first write; then the
// writes go in iOS's order (the team, then its game defaults), and only what
// changed is written.

export type EditorResult = {
  /** The team as saved, or null when only the defaults were saved. */
  team: Team | null;
  /** The server saved a different name than the one sent. */
  renamed: boolean;
  /** The team was saved but its defaults weren't (a partial save). */
  defaultsError: string | null;
};

const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Please try again.');

export type CreateInput = {
  userId: number;
  orgId: number;
  name: string;
  abbr: string;
  statEnable: number;
  members: RosterEntry[];
  defaults: HomeAway;
};

/**
 * Creates a team with its members and defaults, then saves the defaults
 * again on their own, as iOS does after create.
 */
export async function createTeamFlow(input: CreateInput): Promise<EditorResult & { team: Team }> {
  const name = teamNameCheck(input.name);
  if (!name.ok) {
    throw new ApiError(name.error);
  }
  if (serverRewritesName(name.value)) {
    throw new ApiError(rewrittenNameMessage(name.value, true));
  }
  const saved = await createTeam({ ...input, name: name.value, abbr: input.abbr.trim().toUpperCase() });
  writeTeam(saved);
  let defaultsError: string | null = null;
  try {
    await saveTeamDefaults(saved.team.id, input.defaults);
  } catch (e) {
    defaultsError = messageOf(e);
  }
  return { team: saved.team, renamed: saved.team.name !== name.value, defaultsError };
}

export type EditInput = {
  userId: number;
  teamId: number;
  /** The team's fields as read when the editor opened, and as they are now. */
  opened: TeamFields;
  fields: TeamFields;
  added: RosterEntry[];
  removed: number[];
  /** The defaults as read and as they are now; null when they couldn't be read. */
  defaults: { opened: HomeAway; now: HomeAway } | null;
};

const normalised = (f: TeamFields): TeamFields => ({
  name: f.name.trim(),
  abbr: f.abbr.trim().toUpperCase(),
  statEnable: f.statEnable,
});

/**
 * Saves the editor's changes to an existing team. Returns null when nothing
 * changed. The team is read fresh first: a field the user didn't change is
 * sent as the server has it now, and only the people the user removed may
 * leave the roster.
 */
export async function editTeamFlow(input: EditInput): Promise<EditorResult | null> {
  const opened = normalised(input.opened);
  const now = normalised(input.fields);
  const nameChanged = now.name !== opened.name;
  const abbrChanged = now.abbr !== opened.abbr;
  const statChanged = now.statEnable !== opened.statEnable;
  const teamChanged =
    nameChanged || abbrChanged || statChanged || input.added.length > 0 || input.removed.length > 0;
  const saveDefaults = input.defaults !== null && defaultsChanged(input.defaults.opened, input.defaults.now);
  if (!teamChanged && !saveDefaults) {
    return null;
  }

  let team: Team | null = null;
  let renamed = false;
  if (teamChanged) {
    if (nameChanged) {
      const name = teamNameCheck(now.name);
      if (!name.ok) {
        throw new ApiError(name.error);
      }
    }
    const fresh = await fetchTeamFresh(input.userId, input.teamId);
    const send: TeamFields = {
      name: nameChanged ? now.name : fresh.name,
      abbr: abbrChanged ? now.abbr : fresh.abbr,
      statEnable: statChanged ? now.statEnable : fresh.statEnable,
    };
    if (serverRewritesName(send.name)) {
      throw new ApiError(rewrittenNameMessage(send.name, nameChanged));
    }
    const entries = editorEntries(fresh, input.added, input.removed);
    const saved = await sendTeamUpdate(fresh, send, entries, input.removed);
    writeTeam(saved);
    team = saved.team;
    renamed = saved.team.name !== send.name;
  }

  let defaultsError: string | null = null;
  if (saveDefaults && input.defaults) {
    try {
      await saveTeamDefaults(input.teamId, input.defaults.now);
    } catch (e) {
      if (!teamChanged) {
        throw e;
      }
      defaultsError = messageOf(e);
    }
  }
  return { team, renamed, defaultsError };
}
