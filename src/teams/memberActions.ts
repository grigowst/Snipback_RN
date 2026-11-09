import { ApiError } from '../api/client';
import {
  addMember,
  assertNameSurvives,
  fetchTeamFresh,
  removeMember,
  rosterWith,
  sendRoster,
  updateMemberProfile,
  type FreshTeam,
} from '../api/members';
import { DEFAULT_JERSEY } from '../api/teams';
import type { Person, TeamWithMembers } from '../api/types';
import { removeMemberLocally, writeTeam } from '../db/repositories';
import { jerseyTaken } from './memberRules';

// The member changes the hub's Members and Followers tabs make. Each one
// writes as little as possible to the server, reads a team fresh before
// changing its roster, and says plainly when only part of a change was saved.

/** The first part of a change was saved, a later part was not. */
export class PartialSaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PartialSaveError';
  }
}

/** Everything was saved, but something the user should know about happened. */
export class SaveWarning extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveWarning';
  }
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Please try again.');

/**
 * Stores the team the server sent back after a roster save, then warns if
 * the server renamed it (it rewrites some characters in the name it is sent).
 */
function storeSaved(fresh: FreshTeam, saved: TeamWithMembers): void {
  writeTeam(saved);
  if (saved.team.name && saved.team.name !== fresh.name) {
    throw new SaveWarning(
      `Saved, but the server also renamed the team from "${fresh.name}" to "${saved.team.name}". ` +
        'Please rename it back on the website.',
    );
  }
}

function onTeam(fresh: FreshTeam, userId: number) {
  return fresh.team.members.find(m => m.userId === userId);
}

// ---- Editing --------------------------------------------------------------

export type EditMemberInput = {
  /** The signed-in user. */
  viewerId: number;
  orgId: number;
  /** The team the editor was opened on, or 0 (All Teams). */
  teamId: number;
  memberId: number;
  /** The name as it was, and as it is now. */
  oldName: string;
  name: string;
  /** Their organisation role as it was, and as chosen now. */
  oldRoleId: number;
  roleId: number;
  /** Only used with a team. 9999 = no number; null = leave it as it is. */
  jerseyNumber: number | null;
};

/**
 * Saves the member editor. The name and organisation role go to updateUser
 * (only if one of them changed). With a team, the member's team role (the
 * new role, if it changed) and jersey are then written into the team's
 * fresh roster.
 */
export async function saveMemberEdit(input: EditMemberInput): Promise<void> {
  const { viewerId, orgId, teamId, memberId, name, roleId } = input;
  const profileChanged = name !== input.oldName || roleId !== input.oldRoleId;

  let before: FreshTeam | null = null;
  let jerseyNumber = DEFAULT_JERSEY;
  if (teamId > 0) {
    // Check against the server's roster before writing anything.
    before = await fetchTeamFresh(viewerId, teamId);
    const place = onTeam(before, memberId);
    if (!place) {
      throw new ApiError(`${input.oldName} is no longer on this team. Pull to refresh.`);
    }
    jerseyNumber = input.jerseyNumber ?? place.jerseyNumber;
    if (jerseyTaken(before.team.members, memberId, jerseyNumber)) {
      throw new ApiError('# number already exists');
    }
    const teamChanges =
      (roleId !== input.oldRoleId && roleId !== place.roleId) || jerseyNumber !== place.jerseyNumber;
    if (teamChanges) {
      assertNameSurvives(before);
    }
  }

  if (profileChanged) {
    await updateMemberProfile({ memberId, orgId, name, roleId, teamId });
  }
  if (!before) {
    return;
  }

  const oldPlace = onTeam(before, memberId)!;
  const teamRoleId = roleId !== input.oldRoleId ? roleId : oldPlace.roleId;
  if (teamRoleId === oldPlace.roleId && jerseyNumber === oldPlace.jerseyNumber) {
    return; // nothing to change on the team
  }
  try {
    // Read again: updateUser may itself have touched the team.
    const fresh = profileChanged ? await fetchTeamFresh(viewerId, teamId) : before;
    const entries = rosterWith(fresh, { userId: memberId, roleId: teamRoleId, jerseyNumber });
    storeSaved(fresh, await sendRoster(fresh, entries));
  } catch (e) {
    if (!profileChanged || e instanceof SaveWarning) {
      throw e;
    }
    throw new PartialSaveError(
      `The name and role were saved, but the team couldn't be updated: ${messageOf(e)}`,
    );
  }
}

// ---- Adding ---------------------------------------------------------------

export type AddMemberFlowInput = {
  viewerId: number;
  orgId: number;
  /** A team to put them on, or 0. */
  teamId: number;
  email: string;
  name: string;
  roleId: number;
  /** Only used with a team. 9999 = no number. */
  jerseyNumber: number;
  message: string;
};

/**
 * Adds someone to the organisation (inviting them if they're new), then,
 * with a team, makes sure they're on its roster with the chosen role and
 * jersey. Returns the person.
 */
export async function addMemberFlow(input: AddMemberFlowInput): Promise<Person> {
  const { viewerId, orgId, teamId, jerseyNumber, roleId } = input;
  if (teamId > 0) {
    // Check before anyone is added or invited.
    const before = await fetchTeamFresh(viewerId, teamId);
    assertNameSurvives(before);
    if (jerseyTaken(before.team.members, -1, jerseyNumber)) {
      throw new ApiError('# number already exists');
    }
  }

  const person = await addMember({
    email: input.email.trim(),
    name: input.name,
    roleId,
    teamId,
    createdBy: viewerId,
    orgId,
    message: input.message.trim(),
  });
  if (teamId <= 0) {
    return person;
  }

  try {
    // addUser's team list may already have put them on the team.
    const fresh = await fetchTeamFresh(viewerId, teamId);
    const place = onTeam(fresh, person.id);
    if (place && place.roleId === roleId && place.jerseyNumber === jerseyNumber) {
      writeTeam(fresh.team);
      return person;
    }
    const entries = rosterWith(fresh, { userId: person.id, roleId, jerseyNumber });
    storeSaved(fresh, await sendRoster(fresh, entries));
    return person;
  } catch (e) {
    if (e instanceof SaveWarning) {
      throw e;
    }
    throw new PartialSaveError(
      `${person.name || person.email} was added to the organisation, but the team couldn't be updated: ${messageOf(e)}`,
    );
  }
}

/**
 * Puts someone who is already in the organisation onto a team, with a team
 * role and jersey. Only the team's roster is written: iOS also calls addUser,
 * which sends an organisation role and could change theirs (a coach added as
 * a follower).
 */
export async function addToTeamFlow(input: {
  viewerId: number;
  teamId: number;
  memberId: number;
  name: string;
  roleId: number;
  jerseyNumber: number;
}): Promise<void> {
  const fresh = await fetchTeamFresh(input.viewerId, input.teamId);
  assertNameSurvives(fresh);
  if (onTeam(fresh, input.memberId)) {
    throw new ApiError(`${input.name} is already on this team.`);
  }
  if (jerseyTaken(fresh.team.members, input.memberId, input.jerseyNumber)) {
    throw new ApiError('# number already exists');
  }
  const entries = rosterWith(fresh, {
    userId: input.memberId,
    roleId: input.roleId,
    jerseyNumber: input.jerseyNumber,
  });
  storeSaved(fresh, await sendRoster(fresh, entries));
}

// ---- Removing -------------------------------------------------------------

/** Removes someone from a team, or (teamId 0) from the organisation. */
export async function removeMemberFlow(input: {
  orgId: number;
  teamId: number;
  memberId: number;
}): Promise<void> {
  await removeMember(input);
  removeMemberLocally(input.orgId, input.memberId, input.teamId);
}
