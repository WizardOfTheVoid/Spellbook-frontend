# SpellBook development

For the Windows installer and setup instructions, see [README.md](README.md#installation).

This repository contains the Core and overlay app. The client connects to the SpellBook API and Discord integration.

## Profile presets and console setup

Superadmins can publish a non-Default profile with **Preset: Yes** in the builder. Publication changes use the normal Save action. Published profiles remain with their owner and keep their server claims, but only superadmins can edit, delete, or transfer them. Per-user enablement still belongs to the viewer. Unpublishing restores normal owner permissions. Default retains its dedicated source option.

Create and Restore share **From preset**. The authenticated catalog endpoints, `GET /server-profiles/presets` and `GET /server-profiles/presets/:profileId`, expose only names, descriptions, and copyable actions/commands. Ordinary owner-scoped reads remain unchanged. Deleted profiles and profiles belonging to archived teams are excluded. Duplicate catalog names include their profile ID for distinction.

Copies are independent, unpublished, and unassigned. Restore replaces actions/commands only, preserving the destination's metadata, publication flag, claims, and server-owned variables. The picker reads the latest saved source when confirmed; a later unpublish does not revoke a copy already loaded into a draft. Missing-variable safeguards are copied, while variable values remain with the destination servers.

The account Profile form presents Console key immediately after PlayFab ID, before Save profile. It reuses Settings' recorder and saves immediately on this computer; account profile saving remains separate. Loading, recording, and saving a key disable profile submission. Load/save failures expose Retry, and existing bindings and the default remain valid choices. The recorder does not change Chivalry 2's own key binding.

Electron reports confirmed Adminsay and Serversay submissions to `POST /statistics/messages`, using Core's `data.sent` and returned command for single sends and `data.sentCommands` for the submitted batch prefix (including failures and four-command unban expansion). Reports contain only a fresh request ID and counts, with at most 100 of each type per report. Uploads share a five-second timeout per Core result, run without delaying the game result, stop after an upload failure or account epoch change, and never retry game input. These are best-effort totals: offline uploads, lost Core responses, and single-command failures without submission evidence can undercount. Submission confirms console input, not server acceptance.

## UI test policy

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

The console-key recorder appears in Settings and Profile during first login. It stores a physical key code on this computer, excludes it from account settings synchronization, and passes it to Core with each console request. Core validates it against `packages/shared/assets/consoleKeys.json` before selecting the request's scan code. Reset preserves the configured Core console-open mode. Recording never sends input to the game; F3, F4, F12, Enter, Escape, and modifier combinations cannot be recorded. F3 opens and closes SpellBook.

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

Server details and the current-server view show Team for members of the claiming team. Claimed replaces Mine without changing the existing personal/readable-team filter scope; teams link to that filter. Profile server selectors use Claimed servers. Admin user rows show the reported version, and hovering the navbar logo shows `Press F3 to toggle overlay`.

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
