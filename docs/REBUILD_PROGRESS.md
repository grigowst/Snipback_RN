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
| 5 | Teams & users: users sync, hub Members and Followers, phone USERS and TEAMS | `feature/teams-users` | #4, #5 | ✅ Merged |
| 6 | Member management: add, edit and remove members in the hub | `feature/team-members` | #6 | ✅ Merged |
| 7 | Team list: My Team / Opponent toggle, opponents, search, favourites, the team "…" menu | `feature/team-editing` | #7 | ✅ Merged |
| 8 | Team editor: create and edit a team, home/away game defaults, members | `feature/team-editor` | — | 🛠 Built; checked on LIVE |

**Tests:** 276 Jest tests pass, on real Realm in memory. TypeScript and ESLint are clean.

**Devices checked:**
- **iPad simulator:** with the real LIVE account. Step 5: the website opens signed in (checked from the hub's Members, before Members became an in-app grid), and a club's users list cached (559 people, 121 with photos). The in-app Members grid works in DD Org - 11907: filters, jersey numbers, and initials where a photo link is dead. Followers works there too: one team, All Teams (6 people) and the Managers filter. Ab Org2 - 2630 now loads its 312 teams.
- **iPad, step 6 on LIVE** (DD Org - 11907 › New6 - Basketball, with your OK): P9's jersey set to 99 and back to no number, with no one else changed; F2 (already in the organisation) added as a follower, then removed from the team, staying a Follower in the organisation and on New3 Tennis and R2. The roster ended exactly as it started. Each save also renamed the team (see Known issues).
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
  - Each card shows the photo (or initials), name, role, email, and the jersey number when one team is selected. A photo that fails to load also falls back to initials.
  - Tapping your own card says to edit your profile in profile settings. Other cards open a placeholder until member editing is built.
- **Teams status in the hub:** while the list has no teams yet, the rail under MY TEAM says "Loading teams…", and a failed teams sync is shown there. Before this, a failed teams sync showed nothing anywhere.
- **Not a coach:** Members and Followers show an alert and the hub stays on Games. HOME gets the iOS "Not Available in Home Organization" text.
- **Phone tiles:** USERS opens the website's user pages and TEAMS its team pages, signed in (`selected_tab` `user` / `team`).
- **Out-of-range numbers:** `toInt` (used by every sync) now turns a number JavaScript can't hold exactly into 0. LIVE has two roster places in Ab Org2 - 2630 with a jersey number of 9223372036854775807 (Int64.max). Realm refused that value, and because a team list is saved in one write, the whole organisation's 312 teams were lost on every sync. Found by running the app's own teams sync inside the running iPad app.
- **Jersey numbers default to 9999:** a missing or unusable jersey number (no value, empty, text, or too big, like those Int64.max values) is stored as 9999, iOS's "no number" default. A real 0 from the server is kept. Neither 9999 nor 0 is shown on a card, as in iOS.
- **RSA for long values:** `rsaEncrypt` now splits values over 245 bytes the way SwiftyRSA does: each chunk is encrypted to its own 256-byte block, and the blocks are joined and base64-encoded once. Values that fit one block (passwords, ids) are encrypted exactly as before. Needed because the session token is sent encrypted.

### Step 6: Member management (guide module 02)
- **Where:** the tablet hub's Members and Followers tabs, for coaches and admins. Tapping a card opens the member editor; **+ MEMBER** opens the add sheet.
- **Organisation roles** (`fetchOrgRoles`): `/api/getUsersAssociateOrganizations` gives everyone's role in the organisation (16 people in DD Org - 11907, 569 in Ab Org2 - 2630 on LIVE). It is synced with the users list and cached as `OrgRole` (schema v6). Saving a member always sends their real organisation role; until the list has loaded, the editor can't save.
- **How a team's roster is changed** (`src/api/members.ts`): `/api/team/update` takes the team's whole roster as comma lists (ids, roles, jerseys). Every change:
  1. reads the team fresh from the server (`listTeamByTeamIds`, with the ids encrypted as LIVE requires);
  2. changes one member;
  3. sends everyone else back with their own team role and jersey, and the team's stats switch, logo and abbreviation as read;
  4. refuses to send a list that would drop anyone or has someone twice;
  5. stores the team the server sends back.
  The by-id read was checked against the main teams list on LIVE: identical rosters for all 25 teams in both.
- **Member editor:** first and last name, email (read only), team, role (iOS's rules: an admin can only become a coach and a coach only an admin, both by an admin; others can become player, follower, manager, recruit or coach, or admin by an admin), and on a team the jersey number (up to 3 digits; empty means no number).
  - Saves the name and role (`updateUser`) only if one changed, then the team role (the new role, if it changed) and jersey on the team. A jersey field left untouched keeps the server's number.
  - **REMOVE FROM TEAM** (on a team) or **DELETE FROM ORGANIZATION** (All Teams), after a confirmation: `removeUserFromOrganization` with the team id or 0. Not offered on your own card.
- **Add member:** type a name or email to see the organisation's people (people already on the team are shown but can't be picked), **SEARCH ALL SNIPBACK USERS** (`searchUser`), or invite a new email.
  - Someone already in the organisation is put on the team's roster only.
  - Someone new to the organisation is added with `addUser` (which emails them; new accounts get an invitation), then put on the team with the chosen role and jersey.
  - The role starts as Player on Members and Follower on Followers. Admin is offered only to admins.
- **Partial saves:** when a first step was saved and a later one failed, the app says exactly that ("…was added to the organisation, but the team couldn't be updated: …").
- **After any change:** the hub shows it at once and fetches teams, users and roles again.
- **Team names:** `/api/team/update` rewrites "-" in the team name it is sent (found on LIVE). Roster changes on a team whose name has a "-" are refused before anything is written. If the server renames a team anyway, the save is kept and the app says so.

### Step 7: The hub's team list (guide module 02)
Module 02 is split: this step is the hub's left rail; creating and editing a team (`V2CreateTeamViewController`, with home/away defaults) is step 8. The team editor saves the team's name through `/api/team/create` and `/api/team/update`, where the "-" problem lives, so it waits for the backend's answer.
- **The rail** (`TeamRail`): the organisation, a **My Team / Opponent team** toggle, a search box (names containing the text, any case), **Archived (n)** ("Visit website to manage this.", as in iOS) and a ★ on the favourite team. HOME has none of these, as in iOS.
- **Opponent team** (`useOpponents`, `src/api/opponents.ts`): the organisation's opponents from `/api/team/list/listMyOpponentTeam` (plain ids, as iOS sends them; LIVE accepts them), fetched the first time the toggle opens for an organisation and cached as `OpponentTeam` (schema v7). Deleted ones are hidden. "Org - All Teams" comes first.
  - **Picking an opponent filters the games list:** `listGamesV2` with `team_type` 2 and the opponent's id (0 for all opponents). Checked on LIVE: the server returns only games against that opponent (for example, opponent 33 in organisation 2054: one game, which has it as the away team). No opponent in DD Org - 11907 has games, so its lists are empty. Opponent lists are cached under their own key, apart from a team with the same id.
  - Members and Followers keep the team picked under My Team, as in iOS.
  - **+ ADD OPPONENT TEAM** and an opponent's "…" (rename) are for coaches and admins: `/api/team/addingOpponentTeams` with `team_name`, plus `opponentteamId` to rename. The new opponent is selected.
- **A team's "…" menu** (`TeamMenuModal`). Coaches and admins get:
  - **Team Invite Links:** "Invite user as" Coach, Follower or Player, each sharing that link with the system share sheet. The links (`sharecode_short_url`, `short_url_coach`, `short_url_follower`) are now cached with the team; on LIVE they still open snipback.com's Join page.
  - **Team Webpage:** the website's `team/<unique number>` page in the app, signed in (the sign-in link now takes a landing page). If no sign-in link can be made, the page opens without signing in, as in iOS.
  - **Duplicate Team:** asks for a name (starting as the team's), refuses an empty name or one a listed team already has, then `/api/team/duplicateTeam`. The copy is selected. If the server saves a different name, the app says so.
  - **Set as Favourite / Unfavourite:** after a confirmation; `/api/team/setTeamFavourite` or `unSetTeamFavourite`.
  - **Delete Team** (admins only): after a confirmation; `/api/team/delete`. The selection goes back to "Org - All Teams".

  Players, followers and others get only Set as Favourite / Unfavourite. "Org - All Teams" has no menu (iOS has Edit Org there, for the organisation's owner).
- **After any change:** the team list is read again from the store at once, then teams are fetched from the server.
- **Checked on LIVE** (DD Org - 11907, with approval):
  - Starring R2 moved the star from New6 to R2 on the server (one favourite per organisation); starring New6 again restored it.
  - Duplicating R2 as "R2 copy" created team 10701 with R2's whole roster and new invite links, but not R2's logo or abbreviation. Deleting it marked it deleted (`is_deleted` 1); the server keeps the row, and the app hides it. R2 was unchanged.
  - Renaming the opponent "fttttttt" to "fttttttt test" and back.
  - Adding the opponent "RN Test Opponent" (id 3320). It stays: there is no way to delete an opponent.
  - Before and after: favourites, R2 and every other team and opponent were the same, apart from the deleted "R2 copy" row and the new opponent.

### Step 8: The team editor (guide module 02)
- **Where:** **+ ADD TEAM** in the hub's rail (My Team, coaches and admins) and **Edit Team**, first in a team's "…" menu. Built as one sheet (`TeamEditorModal`); iOS opens the defaults on a separate screen.
- **Fields:** team name, abbreviation (up to 3 capitals), the stats switch, and the sport (`/api/game/listGameCategories`, 38 sports on LIVE). A new team starts with the organisation's sport (`organization_category`, now kept with each organisation: schema v8).
  - **Name input:** as in iOS, typing a character from iOS's blocked list (`< > " ' \` \ ( ) / ; { } $ | & # % * ^ ~ ! @ _ .`) or a line break is refused. Characters already in a name (the "_" the server put there, say) stay. iOS allows "-" and spaces (its source says they were taken off the list "as instructed").
  - **The logo** can't be changed (uploads need credentials from the backend). A team keeps its logo; iOS sends an empty logo on every edit unless a new one was uploaded.
- **Game defaults** (`/api/team/listDefaultSettings`, `/api/team/saveDefaultSettings`): Home and Away, each with game mode (Scout, Practice, Game), live streaming, public snipping, post to website, stat report, ball tracking and, while tracking is on, the preferred view. Scout shows only the game mode, and switching a default to Scout clears the rest, as iOS does when saving. Both rows take the home row's sport, as iOS sends them.
  - **Facility camera scheduling** (room, cameras, duration) isn't editable yet (it needs the rooms list). It is kept exactly as read; iOS clears it on the away row.
  - **Defaults that can't be read** are shown as such and never sent (iOS falls back to blank defaults, which would overwrite the team's).
- **Members:** the organisation's people on the left, the team on the right, each with a search, ticks, and **ADD →** / **← REMOVE**. Someone added joins with their organisation role (as iOS) and no jersey number. People can't be added until the organisation's roles have loaded.
- **Saving** (`src/teams/teamEditorActions.ts`):
  - Every check runs before the first write.
  - **Create:** `/api/team/create` with the members and both defaults, then the defaults are saved again on their own, as iOS does. The new team is selected.
  - **Edit:** only what changed is written: the team (`/api/team/update`) only if the name, abbreviation, stats switch or members changed; the defaults only if they changed.
  - A team edit reads the team fresh first. A field the user didn't change is sent as the server has it now. Everyone else keeps their team role and jersey; the removed people are left out and listed in `deletedPlayers` (as iOS); only the people chosen for removal may leave.
  - **Names with "-"** are refused before anything is written: on create, on a rename, and for any change to a team whose name already has "-". Such a team's defaults can still be saved on their own. If the server saves a different name anyway, the app says so.
  - If the team was saved but its defaults weren't, the app says "Partly saved".
- **Checked on LIVE** (DD Org - 11907, with approval):
  - **Create** "RN Test Team" (abbreviation RNT, post to website private at home, practice away): created as team 10702 with both defaults as chosen. **The server adds the creator** to a new team (as role 4, the creator's organisation role, no jersey). P9 wasn't added at create time (a test-tool slip), so **creating a team with members wasn't exercised on LIVE**; adding was checked in the edit.
  - **Edit:** renamed to "RN Test Team 2", abbreviation RT2, stats off, P9 and F2 added (as Player and Follower, their organisation roles), home stat report private. All saved as sent; away untouched. Then P9 removed: only the creator and F2 stayed, and P9 stayed in the organisation and on New5, New6 and R2.
  - **Delete:** after the confirmation; the row stays with `is_deleted` 1, as in step 7.
  - **`/api/team/create` also changes "-" to "_":** "RN Test - Dash", sent straight to the API, was saved as "RN Test _ Dash" (team 10703, then deleted).
  - Before and after: favourites, R2, every other team and the opponents were the same, apart from the two deleted test teams.

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
| Saving a roster | Sends the screen's member list (on Followers: only followers and managers), everyone with their organisation role, and a blank stats switch, logo and abbreviation | Reads the team fresh, changes one member, resends everyone else exactly as read with the team's settings, and refuses to drop anyone | iOS can remove people and reset team settings on LIVE |
| Reading one team | `listTeamByTeamIds` with plain `teamIds` | With `enc_teamIds` | LIVE answers the plain form with "Encrypted parameters are missing" |
| Adding someone already in the organisation | `addUser`, then the roster | The roster only | `addUser` also sends an organisation role and could change theirs |
| Member editor save | Always calls `updateUser`, then the team | `updateUser` only if the name or role changed; the team only if its role or jersey changed | Fewer writes to LIVE |
| Clearing a jersey number | Not possible (an empty field keeps the old number) | An empty field means no number (9999) | 9999 is the default |
| Add-member suggestions | Emails only, and only people on some team; the invite row only after a global search | Names and emails of everyone in the organisation's users list; the invite row as soon as the email is valid | Easier to find people |
| Starting role when adding | Always Player | Player on Members, Follower on Followers | Matches the tab |
| Roster changes on teams with "-" in the name | Sent; the server renames the team ("-" becomes "_") | Refused before any write, with an explanation | Avoids renaming teams on LIVE until the server is fixed |
| Removal message | "User deleted successfully", even for a team | "…was removed from U14." / "…from the organization." | Says what happened |
| Deleting from the organisation | Leaves the person in the local data until the next sync | Clears their team places, user link and role locally at once | No stale cards |
| Users cache | One `User` table, rows only ever added or updated | Per-organisation links; people no organisation lists are removed | A full replace per organisation without wiping people shared with another |
| Opponent "…" | An action sheet with one option, Edit Opponent Team | Opens the rename dialog directly | Same result, one tap fewer |
| Opponent list sync | The launch sync, or once per organisation when the list is empty | Each time the toggle is first opened for an organisation, and after an add or rename | No launch sync for opponents yet; the list stays current |
| Team menu actions | Change Realm by hand (iOS resets old favourites itself and marks a deleted team) | Update the cache only after the server agrees, then refresh from the server | The server's answer wins |
| Invite-links sheet | A pop-up view with Coach, Follower and Player buttons | A sheet with the same three buttons and BACK | Same options |
| Team menu: Edit Team, Bulk Upload | In the menu | Not yet: Edit Team comes with the team editor (step 8); Bulk Upload needs upload credentials from the backend | Not built yet |
| Duplicate name | Must not exactly match a listed team; not trimmed | Same check, after trimming spaces | Avoids names that differ only by spaces |
| Team editor layout | A two-pane editor; the defaults on a separate screen; the logo and abbreviation in a pop-up | One sheet: fields, sport, both defaults, the two member panes | Everything in one place |
| Team edit: members' roles | Everyone on the team is sent with their organisation role | Everyone keeps their team role and jersey as read fresh; only people added take their organisation role | iOS's flattening changes team roles on every edit |
| Team edit: logo | Sent empty unless a new logo was uploaded in that session | The team's logo as read | iOS removes the logo on every edit |
| Team edit: what is written | The team, then the defaults, every time | Only what changed | Fewer writes to LIVE |
| Team edit: facility camera | Editable; cleared on the away row when saving | Kept exactly as read (not editable yet) | The rooms list isn't built |
| Team defaults not readable | Blank defaults, saved on Save | Shown as unreadable and never sent | Saving made-up defaults would overwrite the team's |
| Team names with "-" | Allowed; the server saves "_" instead | Refused before saving (defaults alone still save) | The server rewrites "-" in create and update |
| New member from inside the team editor | A "New member" button (invite by email) | Not in the editor; use + MEMBER on Members or Followers | Same flow, one place |
| Creating a team: the creator | Listed with everyone else, so a coach can send themselves too | Not listed ("You're added to a new team automatically") | The server adds the creator itself; sending them as well can put them on the team twice |

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
| 6 | `OrgRole` (everyone's organisation role) |
| 7 | Team invite links (`playerLink`, `coachLink`, `followerLink`); `OpponentTeam` |
| 8 | `Organization.organizationCategory` (a new team's sport) |

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
- [x] **iPad:** log out and sign in again to get the device number back (#78180 shows again).
- [ ] **Phone (iPhone simulator or Android emulator):** sign in, open a club org, and check that the team picker and TEAM WEBPAGE work.
- [ ] **Android:** force-stop and reopen. You should stay signed in; session restore hasn't been tested on Android yet.
- [ ] **Games on a device:** PRACTICES, SCOUT and HOME lists, and loading the next page.
- [ ] **Tablet portrait:** all dashboard tiles fit without scrolling.
- [x] **Merge PR #3**, then update `main` locally and run the checks.
- [x] **Phone USERS and TEAMS** on the iPhone simulator: the website opens signed in.
- [x] **iPad, club org 2630:** its teams didn't save because of two Int64.max jersey numbers (see step 5). Fixed; its 312 teams now load.
- [x] **iPad Members grid** in DD Org - 11907: cards, filters, jersey numbers, initials for dead photo links.
- [x] **iPad Followers grid** in DD Org - 11907: one team, All Teams and the Managers filter. (No one there has a photo that loads, so a loaded photo hasn't been seen yet.)
- [ ] **Android:** USERS and TEAMS open the website signed in (rebuild first, for the WebView), and the hardware back button goes back inside the website.
- [x] **Step 6 on LIVE:** a jersey change and restore, adding someone already in the organisation to a team, and removing them from that team only. All rosters ended as they started.
- [ ] **Rename New6 back** to "New6 - Basketball" (website), then read it back. The step 6 test renamed it to "New6 _ Basketball". After the website rename (2026-11-09), the API still returned "New6 _ Basketball" (08:27 UTC), and the website's own team page lists "NEW6 _ BASKETBALL" too: either the rename didn't save, or the website also turns "-" into "_".
- [ ] **Not tested on LIVE (step 7):** Unfavourite, and the share sheet itself (the invite links were checked to open the Join page).
- [ ] **Not seen on screen (steps 7 and 8):** the LIVE checks answered confirmations automatically, so the real confirmation pop-ups (favourite, delete) and the "Team created" / "Deleted" messages haven't been seen on a device.
- [ ] **Team editor on a phone and on Android:** only the iPad was used.
- [ ] **Android:** the invite share sheet (Android gets the link as the message text) and Team Webpage.
- [ ] **Not tested on LIVE:** inviting a new email (`addUser` creates an account and emails it) and deleting someone from the organisation.

### Known issues and risks
- **Team names rewritten by `/api/team/update` and `/api/team/create` (backend):** saving New6's roster on LIVE renamed "New6 - Basketball" to "New6 _ Basketball"; the name sent was the server's own. Create does the same ("RN Test - Dash" was saved as "RN Test _ Dash"). Of 1,121 readable teams, 52 have a "-" and only that one a spaced "_". iOS sends the name on every member and team save, so it has the same effect. The iOS source says "-" was taken off its blocked list "as instructed", and it blocks "_", so a "-" in team names is wanted. In the app, roster changes and team saves on names with "-" are refused. Question for the backend: why do create and update turn "-" into "_", and can `name` be left out of update when only the roster changes?
- **Removing from a team** (`removeUserFromOrganization` with a team id) was checked on LIVE: it removes the person from that team only.
- **Test data left on LIVE (approved):** the opponent "RN Test Opponent" (id 3320) in DD Org - 11907, which can't be deleted, and the deleted team rows "R2 copy" (10701), "RN Test Team 2" (10702) and "RN Test _ Dash" (10703).
- **A new team includes its creator:** `/api/team/create` adds the signed-in user as a member (with their organisation role), even when the list sent is empty.
- **Duplicate rows in a roster (backend data):** R2's roster on LIVE lists Grigo Qdev twice. The app refuses roster changes for a team with someone twice (step 6), so member and detail edits on R2 are refused (its game defaults can still be saved). Likely cause: R2's creator ticked themselves when creating it (iOS lists the creator, and the server adds the creator too). The app no longer offers the creator when creating a team.
- **Deleted teams stay in the teams list:** `/api/team/delete` sets `is_deleted` 1; the team still comes back from `myteamsV3` and is hidden by the app, as in iOS.
- **Schema changes in development:** after a schema version bump, restart the app instead of reloading it, or Realm reports "already opened with different schema version". Users always get a fresh start after an update.
- **No test organisation on LIVE:** DD Org - 11907 and Ab Org2 - 2630 are both `is_test_org` 0.
- **Int64.max jersey numbers (backend data):** two roster places in Ab Org2 - 2630 hold 9223372036854775807. The app reads them as 9999, the "no number" default. When member editing sends a team's whole roster back (as iOS does), those places will go back as 9999.
- **Dead photo links (backend data):** most user photos on `snipbackai.s3.amazonaws.com` and `s3.us-east-1.amazonaws.com` answer 404; those on `streaming*.snipback.com` load. The app shows initials for the dead ones.
- **Static-flag error:** in development, hot reload can show React's "Expected static flag was missing". Reload once.
- **Bundle IDs:** still the React Native template defaults (`org.reactjs.native.example.Snipback-RN`, `com.snipback_rn`). They need changing before Firebase, push notifications, and Apple/Google sign-in.
- **Realm:** MongoDB no longer actively develops it; this is the community-maintained release.
- **Public repo:** the code is public and includes the LIVE API addresses. They are also inside the shipped app.
- **Storage keys in iOS:** the iOS source has hard-coded cloud storage keys. They were **not** copied; uploads should get credentials from the backend.

---

## What still needs to be done

### Next small steps (finish what exists)
- **Teams and members (rest of module 02):**
  - a member's photo (needs upload credentials from the backend) and recruit profile;
  - the team logo (needs upload credentials from the backend) and facility camera scheduling in the team defaults (needs the rooms list);
  - Bulk Upload in the team "…" menu (needs upload credentials from the backend);
  - Edit Org on "Org - All Teams" (the organisation's owner only);
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
| 02 | Teams, Rosters & Users | 🟡 Users sync, hub Members and Followers grids, phone USERS/TEAMS (website), member add/edit/remove, the team list (opponents, search, favourites, "…" menu), the team editor done. Still to do: logos and member photos (uploads), Bulk Upload, facility camera defaults, the share-and-pick screen |
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
1. **Game Creation (04).** It needs the team and opponent pickers, which can now be built on the team and opponent lists.
2. **Tags & Snip Collections (09).**
3. **Library & Assignments (11).**
4. **Game menus and delta sync.**
5. **Then the native-heavy modules:** the film player (07), recording (05) and uploads (15), followed by Sideline (06), LAN (16) and live preview (17).

---

## Project layout

```
src/
  api/          REST client, endpoints, mapping (auth, organizations, teams, team editor, opponents, members, users, profile, games, website, paging)
  auth/         AuthContext (signed-in state), Keychain session storage
  config/       environment (server, reported version), RSA public key
  dashboard/    tiles, organisation and team logic and state, header, grid, pickers
  db/           Realm schema, store (schema ledger), repositories
  games/        games list hook, row rules, list and row components
  navigation/   RootNavigator
  screens/      Splash, Login, Dashboard, Settings, Games, GamesHub, Website, ComingSoon
  teams/        Members and Followers rules, roster grid, member editor and add sheet, member actions;
                the hub's team rail, team "…" menu, opponent dialog, opponents hook, team actions;
                the team editor (rules, save flows, sheet)
  theme/        colours and fonts
  utils/        device info, RSA
__tests__/      Jest tests (unit and app-level)
assets/         fonts and images (dashboard and games icons copied from iOS)
docs/           this file
```
