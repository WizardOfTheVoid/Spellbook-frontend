# SpellBook development

## Chat activity and Debug

ListPlayers uses a 12-second normal interval and a 4-second Sentinel interval (`LISTPLAYERS_POLL_SECONDS` / `LISTPLAYERS_SENTINEL_POLL_SECONDS`), scheduled after each refresh completes. Sentinel selects background execution with `requireIdle: false` for ListPlayers and Wanted, bypassing movement, chat, focus, and overlay activity gates. Normal hidden execution retains those gates with `requireIdle: true`; Core still validates the target and serializes all commands. The configured movement cooldown is 1900ms. Restart Electron and Core after changing their respective `.env` files.

Debug's `isAfk` uses the same movement-idle threshold as Anti-AFK (`ANTI_AFK_MINIMUM_IDLE_MINUTES`, default two minutes), independently of whether Anti-AFK is enabled. The one-minute default is its pulse interval, not its idle threshold. Quick Actions shifts left by 75% of any sidebar width increase, shared by Dashboard, Servers, and My teams.

Physical Y, U, or Enter presses while Chivalry 2 is foreground restart the chat cooldown. `Movement__ChatCooldownMs=25000` controls it independently of the movement window. `MovementActivityTracker.isChatting()` reports whether the cooldown is active; `timeSinceChatting()` returns elapsed milliseconds, or null before the first chat key. Injected input is ignored. Enter restarts the timer; it does not infer that chat closed.

`/v2/meta/get` includes `movement.isChatting`, `timeSinceChattingMs`, and `chatCooldownRemainingMs`. Hidden ListPlayers and Wanted work defer on chatting and reuse the activity recheck cadence. Core rechecks after queue acquisition and returns `executed: false` with `CHAT_ACTIVE`. This applies to `requireIdle` execution only, at the existing command/batch entry boundary. It does not interrupt running input or detect chat that remains open beyond the cooldown.

Settings > Debug is a local boolean, default false, stored in `settings.json` and excluded from server preference sync. It enables the `/debug` window at the top-right of the selected display, above the game and below the main overlay. The window is unfocusable and click-through. `DebugActivityService` reads Core every 250 ms after each response, publishes through a dedicated read-only preload, clears unavailable data, and stops polling when disabled or quitting. All displayed durations use whole seconds. `lastCommand - 2s ago: ListPlayers` reports the latest submitted console command, including individual batch commands; failed attempts before submission do not replace it. Core's `/v2/meta/get` exposes the command and monotonic elapsed milliseconds for display, with null before any submission. This tracks input submission, not game acceptance.

Verify with Core tests, the activity/settings/window tests, `npm run app:check`, and `npm run app:build` (including `/debug` in packaged route checks). In-game QA should check Y/U/Enter, a thinking pause, expiry, overlay hide/reopen, display changes, and mouse passthrough. Desktop window tests do not establish exclusive-fullscreen compatibility.

## Text normalization

Electron Main bundles `any-ascii` because its ES module default export is not callable through the build's external CommonJS import. `scripts/normalizeCoreTextBuild.test.mjs` runs before `npm run app:build` and executes the bundled message normalizer to catch this interop failure; source-only tests do not reproduce it. Restart Electron after rebuilding Main.

`packages/shared/src/normalizeString.ts` is the shared game-text/player-name normalizer. It applies custom symbol JSON replacements, caps existing ASCII spaces (`game`: two; `name`: one), converts tabs to spaces, runs AnyAscii and trims, in that order. Both replacement stages use `normalizeScriptText.ts`: Chinese/Japanese characters (including half-width kana and attached marks) are preserved. Greek/Cyrillic words are preserved unless at least two letters are Latin, Latin letters form a strict majority of the word, and no two Greek/Cyrillic letters are adjacent (ignoring combining marks). This conservative heuristic permits `MΔGIC` and `Яanger` while retaining `ИванPlayer`; entirely Greek/Cyrillic stylized names remain unchanged because their intent is ambiguous. Latin accents still normalize through AnyAscii. The JSON supplies visual letter overrides, including `Ɓ` → `B`, and nonrecursive symbol replacements. OCR uses name mode and folds case for matching; visible names remain original.

`CoreHttpClient` applies game mode to structured outgoing messages/reasons and batches, including background requests. Core performs quoted-argument validation only; it rejects empty text, CR/LF/NUL, double quotes and lengths above 180 instead of rewriting or truncating. Raw commands are unchanged.

The `normalizePlayerNames` tick action must also be allowed by Main's `ServerIpcHandlers.tickAction` validator. Its Start request maps to `POST /admin/tick-actions/normalizePlayerNames/start`; Main changes require restarting Electron.

## Player action range

The player profile's PlayFab ID header shows `ID: [DB ID] - Normalized: [normalized name]` on hover for superadmins once the DB profile loads. It uses the stored `player.id` and `player.latestNormalizedName`, with a dash when the normalized name is missing. `PanelHeader.eyebrowTooltip` uses the shared tooltip action.

Renderer offense labels use `utils/formatOffenseType.ts`: underscores become spaces, words are capitalized, and FFA stays uppercase. Action labels, detailed tooltips, dashboard rows, Wanted metadata, punishment tooltips, and profile offense choices share this formatter.

The tooltip Author row displays `author @ teamName` when the action response includes `creditedTeam`, otherwise just the author. Older responses remain supported without a team suffix.

Offense tooltips use `playerActionTooltip.svelte`: action type and offense in the title, server in the subtitle, and icon rows for Author, Duration, and Reason. Ban duration uses completed elapsed hours over total ban hours, capped at expiry or a related unban in the loaded history. Permanent bans show elapsed hours / Permanent; non-ban actions show None.

The player action tags default to All time. Last 30 days and Last 90 days filter by `createdAt` using a rolling day cutoff before applying the eight-tag display limit. Filtering uses the profile's existing latest-200-action snapshot; action menus retain the unfiltered snapshot for related unbans. Notes tiles display the count in the suffix badge without parentheses.

## Team actions

The selected team header uses `TeamActions.svelte` and the shared InfinityMenu. Rename is available to owners, team admins, and superadmins; ownership transfer is limited to owners and superadmins. `TeamManagementModal.svelte` loads current members for the recipient picker and refreshes teams, membership, and profile-owner permissions after saving. The former owner retains assigned permissions and at least Read access. Saving returns to the members view, including when transfer removes admin access.

The existing delete confirmation is opened from the menu; the Admin Teams archive retains its delete button. Permission explanations appear when hovering the permission itself, including disabled permissions, and when an enabled checkbox receives focus. The add-member button shares the Team members heading row, and the four management tiles share a two-column grid.

The desktop bridge uses `PATCH /teams/:teamId` and `PATCH /teams/:teamId/ownership` for these actions.

The My teams list groups the clan notice and create/join tiles above a separate membership section. It uses `gap-1` for spacing; `infoNotice.svelte` presents short informational messages without changing their copy.

`teamListRow.svelte` displays member count, your Owner/Admin/Member status, claimed-server count, and profile count using icon tags in the shared row's `meta` slot. Owner takes precedence over Admin. The team list response supplies the counts; unavailable counts appear as a dash.

## Menu and tooltip placement

`DetailedTooltip.svelte` requires `title`, `subtitle`, and a `content` Svelte snippet. Its subtitle always truncates to one line; callers own the content layout. Pass a snippet that renders the component through `tooltip={{ text: fallbackLabel, content: details }}` on a Tag, or `use:tooltip` on another trigger. The shared tooltip layer renders rich content with the same positioning and hover/focus lifecycle as text tooltips.

`overlayPlacementPreference` in `overlayPosition.ts` sets the shared order: right, bottom, top, left. The first side that fits wins, with viewport clamping as a last resort. Both overlays use `overlayGap = -4` for a 4px overlap with their anchor.

Override the preferred side per component with ``use:tooltip={{ text: `Help`, placement: `top` }}`` or ``openInfinityMenu({ name: `Actions`, icon: `fa-bars`, items, placement: `left` }, position, owner)``. The override is tried first, followed by the remaining shared sides. A menu retains its preference while navigating children.

## Analysis mockup

The main navigation exposes Analysis with a security icon only to superadmins. Page selection and content rendering both enforce the same role restriction. The lazy-loaded mockup reuses the dashboard's `dashboardStatCard.svelte`, `PanelHeader`, and `Tag` components, with three example statistics and four selectable tiles. All values are explicitly mock data; selecting a tile changes its selected state and description without requesting analysis data.

For the Windows installer and setup instructions, see [README.md](README.md#installation).

This repository contains the Core and overlay app. The client connects to the SpellBook API and Discord integration.

## Navigation history

Help/Debug/Onboarding header Back and Close controls share `IconButton` sizing and styling. Its optional `element` binding lets the modal keep initial focus on Close.

Panel headers go to the previous visited view, falling back to their existing parent only when history is empty. Mouse Back/Forward uses Electron's `app-command` events through `overlay:history`; the renderer uses the same history, with no second mouse-event handler. History stays inside the signed-in app session and resets on account changes.

`lib/navigation/navigationHistory.ts` owns the stack. Explicit `navigation.visit` calls record page, subpage and Help/Debug/Onboarding transitions; `rememberNavigation` restores component state after lazy mounting. Route selectors exclude search, filters, pagination and scroll from extra history steps. New navigation clears Forward. Temporary menus and confirmation dialogs are not destinations, and mouse navigation waits while a confirmation is open. Existing unsaved-change guards also apply to Back/Forward between editors; returning to a discarded new profile restores its initial draft. Async restoration checks `isCurrent()` after awaiting a load before changing the selected destination.

Coverage includes player profile/actions/notes and referenced users, Wanted details, server details/variables/players, profile owners/actions/commands, teams/requests, Admin subviews, dashboard tabs, and Help sections, including entry through menus, tray and notifications. Adding a navigable local view requires a `rememberNavigation` binding and `navigation.visit` at its entry point. Use `navigationScroll` on its scrolling container.

Navigation tests run in `npm run app:test`. Desktop acceptance: Wanted → player → Notes → header Back → Wanted detail → mouse Forward → Notes; Help → Onboarding → checklist destination → Back; profile command → Settings → Back; Back then a new destination clears Forward. Test Cancel/Discard for dirty profiles and rapid Back during slow team/server loads. OS delivery of physical side buttons requires a desktop check.

## System tray

The system tray shows the app name/version, a separator, Profile, Settings, My teams, Help, a separator, Toggle (current overlay key), and Quit. Quit uses Electron's quit role and the existing guarded runtime/Core shutdown. Navigation shows the overlay and sends `overlay:navigate` through the preload bridge. The signed-in navigation rail uses the existing guarded page selection and Help dialog; its listener is removed on unmount. Signed-out users see the login screen when the overlay opens.

## Profile presets and console setup

Superadmins can publish a non-Default profile with **Preset: Yes** in the builder. Publication changes use the normal Save action. Published profiles remain with their owner and keep their server claims, but only superadmins can edit, delete, or transfer them. Per-user enablement still belongs to the viewer. Unpublishing restores normal owner permissions. Default retains its dedicated source option.

Create and Restore share **From preset**. The authenticated catalog endpoints, `GET /server-profiles/presets` and `GET /server-profiles/presets/:profileId`, expose only names, descriptions, and copyable actions/commands. Ordinary owner-scoped reads remain unchanged. Deleted profiles and profiles belonging to archived teams are excluded. Duplicate catalog names include their profile ID for distinction.

Copies are independent, unpublished, and unassigned. Restore replaces actions/commands only, preserving the destination's metadata, publication flag, claims, and server-owned variables. The picker reads the latest saved source when confirmed; a later unpublish does not revoke a copy already loaded into a draft. Missing-variable safeguards are copied, while variable values remain with the destination servers.

The account Profile form presents Console key immediately after PlayFab ID, before Save profile. It reuses Settings' recorder and saves immediately on this computer; account profile saving remains separate. Loading, recording, and saving a key disable profile submission. Load/save failures expose Retry, and existing bindings and the default remain valid choices. The recorder does not change Chivalry 2's own key binding.

Electron reports confirmed Adminsay and Serversay submissions to `POST /statistics/messages`, using Core's `data.sent` and returned command for single sends and `data.sentCommands` for the submitted batch prefix (including failures and four-command unban expansion). Reports contain only a fresh request ID and counts, with at most 100 of each type per report. Uploads share a five-second timeout per Core result, run without delaying the game result, stop after an upload failure or account epoch change, and never retry game input. These are best-effort totals: offline uploads, lost Core responses, and single-command failures without submission evidence can undercount. Submission confirms console input, not server acceptance.

## UI test policy

UI tests should check behavior and dynamic data, such as disabled actions and the connected guild name. Do not pin ordinary titles, explanatory copy, colors, or layout; harmless presentation edits should not fail tests.

Dashboard “Admins online” counts enabled, non-banned users whose `last_active` is within the 15 minutes ending at the snapshot time, including the cutoff. It uses the existing `global.activeAdmins` response field; moderation history is not required.

Admin → Discord contains message broadcast, latest published release broadcast, and single-server message modals. The Server API owns superadmin authorization, eligible recipients, GitHub release lookup, and queue insertion. Only enabled Discord servers with an updates channel are recipients. The app reports queued recipient counts; Bot delivery remains asynchronous. Opening or cancelling a modal sends nothing.

The release modal previews GitHub's latest stable release and checks the version again on submit. Manual broadcasts intentionally allow announcing an already announced release; automated release announcements retain their existing deduplication. `/discord/broadcasts/guilds` and `/discord/broadcasts/latest-release` provide reads, while POST `/discord/broadcasts`, `/discord/broadcasts/guild`, and `/discord/broadcasts/latest-release` queue the three actions. No new environment variables or migration are required.

The navrail avatar menu includes Onboarding, which opens the existing Help modal directly on its onboarding tab. Help and the bug button open its debug tab.

UI tests cover behavior: navigation, keyboard handling, permissions, state changes, and action/API payloads. Cosmetic edits such as wrapper divs, spacing, colors, animation timing, or control layout should not fail CI. Avoid assertions on component source text, exact CSS declarations, tag counts, import spelling, or markup hierarchy; review appearance visually when needed.

`npm run app:test` retains the behavior tests. Type checks, renderer builds, and packaged-route verification remain required by the existing validation commands. The former presentation/layout source checks were removed from the test suite.

## Dev / Build

You need Windows, Node.js 22.21.1+, .NET 8, and Chivalry 2.

```powershell
npm ci
npm run dev
```

The Server API defaults to `http://127.0.0.1:48126/api/v1`. Change it with `CHIV_SERVER_URL` when needed.

`src/app/.env` and `src/core/CoreHost/.env` are non-secret runtime configuration. They are loaded in development and shipped with production builds as `resources/app/.env` and `resources/core/.env`. Process environment values take precedence. Keep secrets out of these files; the `.env.example` files document supported settings.

## Commands

```powershell
npm run dev
npm test
npm run check
npm run build
```

Distribution work is explicit:

```powershell
$env:SPELLBOOK_SERVER_URL='https://chivalry2.dev/api/v1'
npm run app:dist
npm run dist:verify
npm run dist:checksums
```

`npm run build` never publishes anything. Packaged builds contain the public Server URL, never a Server token.

## Project map

- `src/app` - Electron, preload, and the Svelte overlay
- `src/core` - local Windows game bridge
- `packages/shared` - shared public types and helpers
- `scripts` - build and release helpers

Electron Main owns windows, workers, settings, HTTP, and Core startup. Preload is the renderer boundary. Core validates the game process, serializes input, and restores focus. Use `@spellbook/shared/*` instead of relative imports across package folders.

The suspended account screen displays the `ACCOUNT_SUSPENDED` error message as the suspension reason, preserving line breaks. The API supplies the saved reason or a fallback when none was recorded.

The main navigation's bug button opens `BetaModal.svelte` and launches the shared confetti effect. The modal explains beta bug reporting and links to Discord through `chivAuth.openHelp()`. Bug reports, admin chat, and community help currently share `https://chivalry2.dev/discord` until channel-specific URLs are supplied. The interactive walkthrough is disabled with a `coming soon` tooltip. Modal focus, background interaction, and overlay visibility use the existing modal helpers.

PlayFab ID is required by the signup/profile form and profile API. Active accounts with a missing or whitespace-only ID are routed to Profile with a notice until they save it; pending approval and suspension screens retain their existing behavior. Navigation and player-selection callbacks cannot leave Profile while the ID is missing. Session onboarding also treats whitespace-only IDs as incomplete.

Sentinel's border uses a separate, non-focusable window on `/sentinel`, controlled by Main's Sentinel state. It stays visible when the overlay hides, follows the selected display, and raises the visible overlay above itself. Only this decorative window passes mouse input through.

`npm run app:renderer:verify` checks that each packaged route mounts and loads Font Awesome. Sentinel passes when either border layer is present, regardless of surrounding markup.

## Beta support and profile actions

Profile action tiles use two columns and show the action title and description without command counts or command previews. Stored delays still apply during execution. Server actions include every enabled action with the server domain; each tile runs its nested commands as one action.

`Share logs` in Settings and the beta modal exports a local file through Electron's save dialog for attachment to a Discord ticket. Main writes diagnostics under `userData/logs/current.log` and `previous.log`, rotating at 512 KiB each. Renderer errors, unhandled rejections, warnings, and error notices join Main startup/warning/error entries. Credential fields and URL parameters are redacted; request bodies are omitted. Export does not upload anything, and cancellation is silent.

The console-key recorder appears only in Settings. The onboarding console-key checklist item opens Settings and is marked complete when clicked, with progress stored locally per signed-in user. It stores a physical key code on this computer, excludes it from account settings synchronization, and passes it to Core with each console request. Core validates it against `packages/shared/assets/consoleKeys.json` before selecting the request's scan code. Reset preserves the configured Core console-open mode. Recording never sends input to the game; F3, F4, F12, Enter, Escape, and modifier combinations cannot be recorded. The overlay and Quick Open Player keys are also recorded in Settings, defaulting to F3 and F4. All three keys stay local and cannot overlap (including the default Numpad minus console key). Changes re-register Electron shortcuts immediately, retaining the old keys if registration or saving fails. Recording suspends global shortcuts and focused Escape/DevTools handling until completion, cancellation, blur, hide, reload, or renderer exit. F12 opens DevTools only while the app has focus and is never registered globally. Startup loads saved keys before shortcuts and tray initialization. Renderer shortcut labels use `KeybindValue`; inline tooltip snippets set `detailed: false` to retain the standard tooltip styling. The native tray uses the same key label helper.

Account Profile and editable game profiles register unsaved drafts with `unsavedChanges`. Back, owner changes, cancel, and main navigation wait for the shared Svelte `ConfirmModal`, with Keep editing and Discard changes choices. Escape or hiding the overlay keeps edits. Concurrent navigation cannot replace a pending choice, and leaving the editing session invalidates it. Navigation inside a game-profile draft retains edits; successful saves establish a new clean state. Console-key changes save immediately and are separate from the profile draft.

Team deletion uses the shared `DeleteTeamButton` in Account Teams and Admin Teams. It captures the selected team when opened, closes after a successful delete or a 404, then refreshes teams and profile-owner permissions. Team/profile panels clear selections that disappear during a normal reload, and stale team-list requests cannot restore a locally deleted team. Profile actions re-fetch the active profile immediately before dispatch and require the captured action ID to remain present and enabled.

An active server can supply the signed-in user's personal profile and its claimed team profile. Both profile action lists render in personal/team order; context menus merge their enabled player actions and mark personal entries with a faded user icon. Punishment and unban commands, reasons, and durations come from these configured actions. Default actions apply when neither profile exists. The renderer accepts older single-profile responses during rollout.

Profile creation and Restore share `ProfileSourceModal`: start empty, copy a readable team profile, or copy the saved system Default. Creation opens an unassigned draft owned by the selected destination. Restore replaces only the draft's actions and nested commands, retaining profile details, ownership, server claims, and variable definitions. Nothing is persisted until Save. Restoring Default from itself reloads its saved actions. Copies are independent, discard database IDs, and preserve all command settings; duplicate action/profile names get a bounded, collision-checked suffix.

The builder sends only changed fields when saving an existing profile, so an actions-only Restore does not rewrite server assignments. Right-click action and command rows use InfinityMenu for Duplicate/Delete; zero actions are valid, while each action still needs a command. Read-only users can inspect action and command details, with mutation controls disabled. Default edits require superadmin; team operations use the loaded owner permissions. Owner subtitles follow the actual profile through nested editing views. Source requests are invalidated on cancellation or selection changes.

Unban checks Wanted status before sending and uses the unban audit endpoint, retaining the related offense when opened from history. All profile execution paths recheck the user, game availability, and current server immediately before dispatch. Nonempty message prefixes have one separating space. Discord connection guidance explains creating a channel and running `/sb-config`; note guidance explains `@` admin mentions and `#` action references. Team permission changes show a success notice after the save completes.

The Default editor shows superadmins a persistent warning across profile, action, and command views. Profile source dropdowns expand in the dialog's layout so all choices fit. Rows use UISFX `open` on activation, `drag-start` on pickup, `reorder` on a changed position, and one `snap` when a drag returns unchanged or is cancelled. These cues use the global player and its saved sound preferences.

## Safety

All four app windows explicitly use `thickFrame: false` to disable Electron's native Windows frame animations. The main overlay's CSS fade-in uses `800ms var(--easing)`.

Admin actions require the visible interactive overlay. Core validates the target game and return window before sending input.

No memory injection, anti-cheat bypass, gameplay mutation, hidden punishment logic, or persistence belongs in Core.

## Releases

Public candidates build on GitHub's Windows runner. The workflow checks the installer, checksums, notices, and SBOM before promotion. Release notes live in [CHANGELOG.md](CHANGELOG.md).

Windows installers are currently unsigned. Bundled sounds are project-approved assets with intentionally minimal provenance notes.

The proposed click-to-download installer flow is documented in the [implementation plan](../docs/superpowers/plans/2026-09-05-installer-download-and-run.md). It is not implemented yet; update actions currently open the release download page.

Server details and the current-server view show Team for members of the claiming team. Claimed replaces Mine without changing the existing personal/readable-team filter scope; teams link to that filter. Profile server selectors use Claimed servers. Admin user rows show the reported version, and hovering the navbar logo shows `Press <current overlay key> to toggle overlay`.

Profile row context menus support Open, Duplicate, and Enable/Disable for me. Duplication opens an unsaved draft with copied actions and no claims. Enablement persists per account and applies to the entire profile; Default stays enabled as the fallback. Successful changes refresh active action views, and execution still re-fetches the active profiles before dispatch. Session changes invalidate pending preference responses.

The avatar and My teams account-menu item share a red count of pending team join requests the user can review across their teams. Onboarding and other notifications do not contribute. Counts refresh every eight seconds and immediately after approving or rejecting a request, update an open menu, disappear at zero, and clear on account changes. The server derives scope from the authenticated user.

Profile command duration controls appear only for bans. The slider and MAX button cap edits at 1337 hours. Existing stored command durations remain unchanged until edited.

No rank selects players without recorded XP, excluding zero XP, and is mutually exclusive with rank bounds/Low rank. Player rows show red for any active ban, otherwise yellow for a punishment within seven days. Hover/focus shows the relevant action, offense, reason, issue date, and ban expiry. Live, archive, and Wanted rows share status logic and a clock; server refresh is still needed to observe new punishments or unbans. Implementation and validation details are in the [small UI improvements plan](../docs/superpowers/plans/2026-09-06-small-ui-improvements.md).

## Game server names

Visible game server names default to the stored display name, with the raw name as fallback. Use `getServerLabel(server)` when the record is available; preserve spaces and words such as `1v1` in raw fallback labels. Apply this to headings, rows, tooltips, selectors, action text, and other display-only labels. Raw name input fields (including the disabled Reported name field), identifiers, matching, and logic checks retain their original values. Do not overwrite the raw name in a data record to change its presentation.

## Player presence

The Online tag is enabled in database player archives, including Wanted. Selecting it sends `isOnline: true` through the existing paginated player query; deselecting it removes that filter. Live server lists omit the tag because their roster is already online.

Player rows use the pulsing Online dot. Player and Wanted profile headings place that dot inline with the username, with the same tooltip on the name and dot; there is no separate presence text block. Tooltips contain only the permitted server name and measured duration, such as `Duel (45+ sec)`, `Duel (3+ min)`, or `Duel (2+ hrs)`. Values use whole numbers rounded down at 60-second and 3600-second boundaries. When location is restricted or unknown, show `In a server for 2+ min` using the independently disclosed duration. Unknown duration leaves only the name or `In a server`; offline or unavailable presence has no tooltip. The display does not extrapolate a running timer.

Rows fetch the existing permission-filtered player detail only when the dot is hovered or focused, rechecking on the next interaction. Profile headings reuse their already loaded presence. No location fields are added to list responses. Leaving the target, switching players/accounts, or destroying the component invalidates pending tooltip loads; failures show no fallback location.

Presence details are cleared on player/account changes and logout; delayed responses from the previous session are discarded. Missing or redacted presence never falls back to action history or the current game server. Remote presence remains separate from the local server/profile used to execute commands.

The App tests and type checking passed, with the existing unused-CSS warnings in StartupOverlay and BetaModal. A Playwright harness mounting the real player rows, profile, and server-list components with controlled API responses verified name/dot tooltips, whole-number duration units, claimed-server and superadmin visibility, generic duration for another admin, display-name/raw-name fallback, offline clearing, and delayed-response account switching/logout. This does not claim live server-fetch or packaged Electron validation.
