import Realm from 'realm';
import { SCHEMA } from './schema';

// The app's single local store (the default Realm in iOS, AppDelegate.swift).
//
// SCHEMA VERSION LEDGER — every schema change takes the NEXT number and adds a
// line here. Never reuse a number, and never use deleteRealmIfMigrationNeeded:
// recordings and offline games will live in this store and must survive
// upgrades.
//   1  Organization, Team, TeamMember (step 3: organisations and teams).
//   2  Organization.rowKey; rows keyed per membership (the API's "key").
//      Old-format rows are swept by the next organisation sync.
//   3  Game, GameList (step 4: the games list).
//   4  Game.gameDate int → double (the API sends fractional seconds). The
//      games cache is cleared; it refills from the server.
//   5  User, OrgUser (step 5: the users list).
//   6  OrgRole (step 6: everyone's organisation role, for the member editor).
//   7  Team invite links (playerLink, coachLink, followerLink; '' until the
//      next teams sync) and OpponentTeam (step 7: the team list).
//   8  Organization.organizationCategory (1 until the next organisations
//      sync; step 8: a new team's sport).
export const SCHEMA_VERSION = 8;

const DEFAULT_PATH = 'snipback.realm';

let realm: Realm | null = null;
let overrideConfig: Partial<Realm.Configuration> | null = null;

/** Migrations that need more than Realm's automatic column changes. */
function onMigration(oldRealm: Realm, newRealm: Realm) {
  if (oldRealm.schemaVersion === 3) {
    // v3 stored gameDate as an integer; the cached games are server data.
    newRealm.delete(newRealm.objects('Game'));
    newRealm.delete(newRealm.objects('GameList'));
  }
}

function config(): Realm.Configuration {
  return {
    path: DEFAULT_PATH,
    schema: SCHEMA,
    schemaVersion: SCHEMA_VERSION,
    onMigration,
    ...overrideConfig,
  };
}

/** The open store, opened on first use. */
export function getStore(): Realm {
  if (!realm || realm.isClosed) {
    realm = new Realm(config());
  }
  return realm;
}

/** Deletes everything (sign-out, or a fresh sign-in by another account). */
export function clearStore(): void {
  const store = getStore();
  store.write(() => {
    store.deleteAll();
  });
}

export function closeStore(): void {
  if (realm && !realm.isClosed) {
    realm.close();
  }
  realm = null;
}

/** Tests: use an in-memory store so nothing touches disk. */
export function configureInMemoryStoreForTests(path: string): void {
  closeStore();
  overrideConfig = { inMemory: true, path };
}
