# Snipback React Native rebuild: progress and to-do

This repo rebuilds the native **Snipback iOS app** in React Native, one step at a time, for **iPhone, iPad, Android phone and Android tablet**.

*Last updated: 6 November 2026.*

## Contents

- [Sources](#sources)
- [Status at a glance](#status-at-a-glance)
- [What has been done](#what-has-been-done)
- [Differences from the iOS app](#differences-from-the-ios-app)
- [Technical notes](#technical-notes)
- [Open checks and known issues](#open-checks-and-known-issues)
- [What still needs to be done](#what-still-needs-to-be-done)
- [Project layout](#project-layout)

---

## Sources

| What | Where |
|---|---|
| iOS app (the reference) | `hipointinc/snipbackai-ios`, branch `master-pro-v5`, commit `644b2aa9c` (local copy: `~/Documents/Grigo/GitHub/Q-DevEngine/snipbackai-ios`) |
| Module guides (18 modules + legacy appendix) | `~/Documents/Grigo/snipback-module-guides/markdown/README.md` |
| This repo | `github.com/grigowst/Snipback_RN` (default branch `main`) |

---

## Status at a glance

| Step | What | Branch | PR | Status |
|---|---|---|---|---|
| 1 | Sign-in: API client, Keychain session, Splash, Login | `feature/login-dashboard` | #1 | ✅ Merged |
| 2 | Dashboard: tiles by role, organisation picker, Settings | `feature/login-dashboard` | #1 | ✅ Merged |
| 3 | Local store (Realm), profile refresh, org/team sync, phone team picker | `feature/data-sync` | #2 | ✅ Merged |
| 4 | Games hub: games list with tabs, tablet hub shell, games cache | `feature/games-hub` | #3 | ✅ Merged |
| 5 | Teams & users: users sync, hub Members and Followers, phone USERS and TEAMS | `feature/teams-users` | #4 + follow-up | ✅ #4 merged; follow-up (teams status, in-app Members) to open |

**Tests:** 231 Jest tests pass, on real Realm in memory. TypeScript and ESLint are clean.

**Devices checked:**
- **iPad simulator:** with the real LIVE account. Step 5: the website opens signed in (checked from the hub's Members, before Members became an in-app grid), and a club's users list cached (559 people, 121 with photos).
- **iPhone simulator:** signed in with the real LIVE account. Step 5: USERS and TEAMS open the website signed in. A club's 19 teams cached with their rosters, and every person on them is in the users list.
- **Android emulator:** builds and runs; not yet signed in since the version fix.

---

## What has been done

### Step 1: Sign-in (guide module 01)
- **Project setup:**
  - TypeScript;
  - React Navigation (native stack);
  - the `src/` layout;
  - Jest with mocks for the native modules.
- **API client** (`src/api/client.ts`):
  - sends the same headers as the iOS `APIManager`;
  - RSA-encrypts passwords and ids (PKCS#1 v1.5, public key copied from the iOS app);
  - HTTP 401 signs the user out;
  - HTTP 308 shows an "Update" alert.
- **Version gate:** LIVE refuses sign-in unless the `deviceInfo` header carries an accepted app version. The store versions are reported per platform (iOS 15.4.7 / 851, Android 1.1.2 / 206) from `src/config/environment.ts`.
- **Session:** the token and user are kept in the iOS Keychain / Android Keystore. iOS uses UserDefaults, which the module guides list as a weakness.
- **Screens:**
  - Splash restores the session, with a 1 s minimum as in iOS.
  - Login keeps the existing design, with a field text-colour fix and a busy state on Sign In.
- **Platform setup:**
  - iOS 27 UIScene lifecycle (SceneDelegate);
  - the BazoukSSK font;
  - a Podfile fix for Xcode 27 (raises old pod deployment targets);
  - a `MainActivity` fix for react-native-screens.

### Step 2: Dashboard (guide module 01)
- **Organisations:** loaded from `getUsersOrganizationV1` and mapped as the iOS `Organization` model does.
- **Selected organisation:** the default org after a fresh sign-in, otherwise the saved choice, otherwise HOME.
- **Tiles:** order, names, icons and role access ported from `prepareDashBoardItems` and `DashBoardUIHelper`.
  - iPad tile set on tablets, iPhone tile set on phones.
  - Tiles a role can't use are dimmed.
- **Grid:** two columns on phones. On tablets every tile fits on one screen, as `iPadTileSize` does.
- **Header:** logo, "ORG | Name" selector, bell, avatar and device number.
- **Organisation picker:** the iOS tree (sub-orgs under their parents, orphans shown at the top level, cycle guard), plus search.
- **Settings:** a minimal screen with account, organisation, version, server and Log Out.
- **Other tiles:** open a "not built yet" placeholder.

### Step 3: Local store and team sync (guide modules 13 and 14)
- **Realm 20 (community)** is the local store. Screens get plain copies, never live Realm objects.
- **Cache first:** the dashboard shows cached organisations and teams at once, so it opens offline, then the server list replaces them.
- **Full replace:** each sync fetches every page and replaces the whole set in one write.
  - Rows the server no longer returns are removed.
  - A failed page leaves the cache untouched.
- **Organisations:** one row per membership, keyed on the API's `key`.
- **Teams:** each kept under its own organisation, with rosters keyed by team and user.
- **Profile refresh:** only `is_terms_accepted` and `organization` are taken from it, as in iOS.
- **Phone team picker:** shown outside HOME. The default is the only team, else the first favourite, else "Org - All Teams".
- **TEAM WEBPAGE tile:** on phones, when a single team is selected.
- **Clearing:** the store is cleared on sign-out and before a new sign-in.
- **Late syncs:** a sync that finishes after logout writes nothing.

### Step 4: Games hub (guide module 03), PR #3
- **Phone:** GAMES/TEAMS opens the games list for the dashboard's organisation and team. The team can be changed there.
- **Tablet:** a Teams & Games hub, with teams on the left and segments across the top. **Games works**; Members, Followers, Schedule, Assignments and Library are placeholders.
- **Tabs GAMES, PRACTICES and SCOUT** from `/api/game/listGamesV2`:
  - `game_type` 1, 0 and 2;
  - organisation 0 for a HOME user;
  - 50 per page.
  
  "No games found" counts as an empty page. More pages load on scroll, and you can pull to refresh.
- **Rows:**
  - date: short on phones, medium on tablets;
  - name;
  - team names, duration and score (tablets);
  - status chip;
  - REC;
  - "…" options.
  
  Tapping a row or REC, or the "…" button, opens a placeholder.
- **Cache:** each list is stored exactly as the server returned it (per user, organisation, team and tab), so it opens offline as last seen.
- **Late answers:**
  - Answers for a list no longer on screen are ignored.
  - A load-more can't run during a refresh.
  - A load-more that finishes after a refresh is dropped, so a list never skips a page.
- **Checked with real LIVE data on the iPad:** 50 games with a next page, correct dates and teams, and deleted games hidden. The check caught a bug: game dates are fractional seconds, so they are stored as decimals (schema v4).

### Step 5: Teams & users (guide module 02)
- **Real payload (checked on LIVE):** each user row has `id`, `name`, `email`, `username`, `avatar` (null when there is no photo), `number`, `createdby`, `created_at`, `updated_at` and `is_admin`. There is no per-organisation role, so the Members and Followers cards use team roles.
- **Users sync** (`src/api/users.ts`): `/api/getAllUsersV2`, 400 per page, the full list each time, run with the teams sync whenever the organisation changes.
  - People are cached once each (`User`), with a separate link per organisation (`OrgUser`).
  - Replacing one organisation's list only removes that organisation's links. A person's row goes only when no organisation lists them, so someone in two clubs is never wiped by one club's sync.
  - The API row is kept whole in `rawJson` for later screens.
  - A failure keeps the cache and shows nothing; a sync that finishes after logout or an organisation change writes nothing.
- **Website sign-in link** (`src/api/website.ts`, `WebsiteScreen`): `/api/createWebsiteAccessToken` gives a one-time token, and the website page `authentication/<token>` opens inside the app, signed in.
  - A new token is requested on every open. It is never cached or logged.
  - Android's back button goes back inside the website first.
- **Hub Members and Followers (tablet):** coaches and admins see the same in-app grid on both tabs (`RosterPanel`), for the selected team or, under "All Teams", the whole organisation.
  - **Members:** everyone but followers and managers (team roles 1, 2, 3, 4, 6). Filters: All, Admins, Coaches, Players, Recruiters, as iOS's `showMembers()`.
  - **Followers:** followers and managers (roles 5 and 7). Filters: All, Followers, Managers.
  - Name search, sorted by name. Each tab starts from All with an empty search.
  - Each card shows the photo (or initials), name, role, email, and the jersey number when one team is selected.
  - Tapping your own card says to edit your profile in profile settings. Other cards open a placeholder until member editing is built.
- **Teams status in the hub:** while the list has no teams yet, the rail under MY TEAM says "Loading teams…", and a failed teams sync is shown there. Before this, a failed teams sync showed nothing anywhere.
- **Not a coach:** Members and Followers show an alert and the hub stays on Games. HOME gets the iOS "Not Available in Home Organization" text.
- **Phone tiles:** USERS opens the website's user pages and TEAMS its team pages, signed in (`selected_tab` `user` / `team`).
- **RSA for long values:** `rsaEncrypt` now splits values over 245 bytes the way SwiftyRSA does: each chunk is encrypted to its own 256-byte block, and the blocks are joined and base64-encoded once. Values that fit one block (passwords, ids) are encrypted exactly as before. Needed because the session token is sent encrypted.

---

## Differences from the iOS app

Each of these was chosen on purpose.

| Area | iOS | React Native | Why |
|---|---|---|---|
| Session storage | UserDefaults | Keychain / Keystore | Device backups don't copy the token in clear |
| Games list | Filters a local table that several syncs fill | Shows each list exactly as the server returned it | Avoids the HOME org-0 mismatch; iOS's `teamIds contains[c]` bug (team 5 matching 15) isn't carried over |
| Game dates | The game's own time zone, once its zone list has loaded | The device time zone | The zone list isn't built yet |
| Game status | An icon from status, upload and stream state, and broadcast | A simplified LIVE / ENDED / NOT STARTED chip | The full logic comes with the player and menus |
| Game rows | Storyboard cells | White cards on black | iOS rows use dark text |
| Long tile labels | Truncated with "…" | Shrink slightly to fit | Readability |
| Bell icon | Apple SF Symbol | Original artwork | The SF Symbols licence only covers Apple platforms |
| Roster ids | max+1 integer ids | `teamId:userId` keys | Avoids the `nextPrimaryKey` bug listed in the guide findings |
| RECRUIT tile flag | Live from a Firebase listener | The organisation row's `enable_recruiter` | Firebase isn't added yet |
| Hub Members tab | Coaches are sent to the website's roster (Roster 2.0) | The in-app grid, like Followers (iOS's earlier `showMembers()`) | Asked for; keeps the roster in the app |
| Members/Followers grid source | Cached `User` rows whose ids are in the team mappings | The team mappings themselves; the users list only adds photos and current names | Works before the users sync and offline; nobody disappears because their user row hasn't synced |
| Members/Followers card role | The person's role in the organisation, from other users' `Organization` rows (missing ones show "Player") | The person's role on the team (or teams) shown, e.g. "Follower · Manager" | RN only caches the signed-in user's organisation rows |
| Role filters under All Teams | Organisation roles | Team roles across the organisation's teams | Same reason |
| Members/Followers alert outside HOME | "Not Available in Home Organization", even in a club | "Permission Denied: only coaches and admins…" | The iOS text is wrong outside HOME |
| Users cache | One `User` table, rows only ever added or updated | Per-organisation links; people no organisation lists are removed | A full replace per organisation without wiping people shared with another |

---

## Technical notes

### Environment
- **Server:** LIVE. Switch it with `ACTIVE_ENVIRONMENT` in `src/config/environment.ts`.
- **Reported app version:** set per platform in `REPORTED_APP_VERSION`. Raise it whenever the backend raises its minimum version; otherwise sign-in fails with "Some important updates are pending" (HTTP 308).

### Local store (Realm)
- **Schema ledger:** in `src/db/store.ts`. Every schema change takes the **next** number and adds a ledger line.
- **No `deleteRealmIfMigrationNeeded`:** never use it. Recordings and offline games will live in this store later.

| Version | Change |
|---|---|
| 1 | Organization, Team, TeamMember |
| 2 | `Organization.rowKey`; rows keyed per membership |
| 3 | Game, GameList |
| 4 | `Game.gameDate` stored as a decimal; the games cache is cleared on upgrade |
| 5 | `User` and `OrgUser` (the users list) |

### Tests
- **Realm in Jest:** tests use Realm's Node build in memory, in a temp folder (`jest.setupAfterEnv.js`).
- **`forceExit`:** set in `jest.config.js`, because Realm keeps Node running after close.
- **Mutation checks:** each step's key rules were broken on purpose to confirm a test fails.

### Website pages
- **Base URL:** `WEBSITE_BASE_URL` in `src/config/environment.ts` (snipback.com; the QA site for QA).
- **WebView:** `react-native-webview` 14.0.1, pinned (the `latest` tag; 15–17 are on `next`). Its type file declares `WebView<P = undefined>`, which strict TypeScript turns into `never` props, so the screen uses `WebView<object>`.
- **Jest:** the WebView is mocked in `jest.setup.js` as a plain view with `testID="webview"`.

### Git and PR workflow
- **One branch and one commit per step,** made from `main`.
- **Pushing:** the repo belongs to GitHub user **grigowst**; this Mac's git/gh account (**grigoqdev**) can only read it. Push as grigowst with an explicit refspec, for example:
  ```
  git push https://grigowst@github.com/grigowst/Snipback_RN.git feature/<name>:feature/<name>
  ```
- **PRs:** opened in the browser from a pre-filled compare link. To let `gh pr create` work from this Mac, add grigoqdev as a collaborator.

### Verifying on iOS
- **Logs:** React Native's console logs from the iOS simulator can't be read on this Mac.
- **Instead:** iOS behaviour is checked with screenshots, and by copying the app's Realm file out of the simulator and reading it with Node.

---

## Open checks and known issues

### To check by hand
- [ ] **iPad:** log out and sign in again to get the device number back. A profile-merge bug, since fixed, removed it from the saved session.
- [ ] **Phone (iPhone simulator or Android emulator):** sign in, open a club org, and check that the team picker and TEAM WEBPAGE work.
- [ ] **Android:** force-stop and reopen. You should stay signed in; session restore hasn't been tested on Android yet.
- [ ] **Games on a device:** PRACTICES, SCOUT and HOME lists, and loading the next page.
- [ ] **Tablet portrait:** all dashboard tiles fit without scrolling.
- [x] **Merge PR #3**, then update `main` locally and run the checks.
- [x] **Phone USERS and TEAMS** on the iPhone simulator: the website opens signed in.
- [ ] **iPad, club org 2630:** in the first check its users list cached but its teams did not, so the hub only had "All Teams". Open the hub there and wait. The rail now shows "Loading teams…" or the error.
- [ ] **iPad Members and Followers grids** on a device: cards, filters, search and photos, in a club where you are a coach or admin (for example DD Org - 11907).
- [ ] **Android:** USERS and TEAMS open the website signed in (rebuild first, for the WebView), and the hardware back button goes back inside the website.

### Known issues and risks
- **Static-flag error:** in development, hot reload can show React's "Expected static flag was missing". Reload once.
- **Bundle IDs:** still the React Native template defaults (`org.reactjs.native.example.Snipback-RN`, `com.snipback_rn`). They need changing before Firebase, push notifications, and Apple/Google sign-in.
- **Realm:** MongoDB no longer actively develops it; this is the community-maintained release.
- **Public repo:** the code is public and includes the LIVE API addresses. They are also inside the shipped app.
- **Storage keys in iOS:** the iOS source has hard-coded cloud storage keys. They were **not** copied; uploads should get credentials from the backend.

---

## What still needs to be done

### Next small steps (finish what exists)
- **Teams and members (rest of module 02):**
  - add a member by email (`AddUserTableViewController`), with role and jersey;
  - edit or remove a member (`EditUserViewController`), from a Members or Followers card;
  - create and edit a team, with home/away defaults (`V2CreateTeamViewController`);
  - the team "…" menu: invite links, bulk upload, team web page, duplicate, favourite, delete;
  - the My Team / Opponent team toggle and opponent teams;
  - direct messages from a card (needs messaging).
- **Games:**
  - delta sync with saved timestamps (until then, games beyond page 1 can go stale);
  - the other tabs (TUTORIALS, LIKED FILM, DELETED FILM, LOCAL GAMES, REPORT);
  - the My Team / Opponent toggle;
  - shared films in Scout;
  - year and game-mode filters;
  - search;
  - game time zones.
- **Game menus:**
  - the live-game menu: Watch, Real-Time View, Make Recorder, Remote;
  - the "…" options: status, End Game, download MP4, share, move, statistics;
  - score consoles per sport.
- **Dashboard:**
  - notification count on the bell;
  - My Profile;
  - the full Settings screen;
  - MY PUBLIC PAGE and TEAM WEBPAGE opening the web pages (iOS opens these in Safari with a sign-in link for the page's path; the token call from step 5 takes a `redirect_url`);
  - RECORDER's "pick a game" mode.
- **Sign-in extras:**
  - Forgot Password and Resend Credentials;
  - Sign Up;
  - Sign in with Apple and Google;
  - magic-link login;
  - joining a team with a share code.
- **Logout:** warn when uploads are still pending, as iOS does.

### Infrastructure
- **Real bundle IDs and app icons.**
- **Firebase:** Auth with a custom token, the Realtime Database listeners and Messaging. Needs `GoogleService-Info.plist` and `google-services.json`.
- **Socket.IO:** game status.
- **Push notifications and deep links:** universal links, plus the `watch` and `dashboard` schemes.
- **Tags sync.** The paging helper in `src/api/paging.ts` is ready for it.
- **Releases:** signing and CI.

### Module roadmap (from the module guides)

| # | Module | Status |
|---|---|---|
| 01 | App Shell, Sign-in & App Guide | 🟡 Sign-in, dashboard, minimal Settings done. Still to do: My Profile, full Settings, App Guide, links |
| 02 | Teams, Rosters & Users | 🟡 Users sync, hub Members and Followers grids, phone USERS/TEAMS (website) done. Still to do: add/edit members, team create/edit, "…" menu, opponents |
| 03 | Games Hub & Live Scoring | 🟡 Games list done (PR #3). Still to do: other tabs, menus, score consoles, Schedule |
| 04 | Game Creation | ⬜ |
| 05 | Recording & Capture | ⬜ Needs native modules |
| 06 | Sideline Mode | ⬜ Needs native modules |
| 07 | Film Player & Playback Engine | ⬜ Needs native modules |
| 08 | Live Snipping & Snip Editor | ⬜ |
| 09 | Tags & Snip Collections | ⬜ |
| 10 | Charting, Playbook & GamePlan | ⬜ |
| 11 | Library & Assignments | ⬜ |
| 12 | Messaging, Notifications & Recruit | ⬜ Needs Firebase |
| 13 | Networking & API | 🟡 Client, encryption, paging done; more endpoints as screens need them |
| 14 | Data & Sync | 🟡 Realm store, orgs, teams, games; delta sync, Firebase, Socket.IO to do |
| 15 | Uploads & Transfer | ⬜ Needs native modules |
| 16 | LAN & On-device Server | ⬜ Needs native modules |
| 17 | Live Preview, Voice & Gimbal | ⬜ Needs native modules |
| 18 | Shared Helpers & UI Kit | 🟡 Theme, device helpers, RSA; more as needed |

**Suggested order:**
1. **Rest of Teams & Users (02).** Add and edit members, create and edit teams, opponents. Game Creation needs the team and opponent pickers.
2. **Game Creation (04).**
3. **Tags & Snip Collections (09).**
4. **Library & Assignments (11).**
5. **Game menus and delta sync.**
6. **Then the native-heavy modules:** the film player (07), recording (05) and uploads (15), followed by Sideline (06), LAN (16) and live preview (17).

---

## Project layout

```
src/
  api/          REST client, endpoints, mapping (auth, organizations, teams, users, profile, games, website, paging)
  auth/         AuthContext (signed-in state), Keychain session storage
  config/       environment (server, reported version), RSA public key
  dashboard/    tiles, organisation and team logic and state, header, grid, pickers
  db/           Realm schema, store (schema ledger), repositories
  games/        games list hook, row rules, list and row components
  navigation/   RootNavigator
  screens/      Splash, Login, Dashboard, Settings, Games, GamesHub, Website, ComingSoon
  teams/        Members and Followers rules, roster grid
  theme/        colours and fonts
  utils/        device info, RSA
__tests__/      Jest tests (unit and app-level)
assets/         fonts and images (dashboard and games icons copied from iOS)
docs/           this file
```
