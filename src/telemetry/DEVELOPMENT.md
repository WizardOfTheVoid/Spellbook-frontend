# Telemetry worker

## Deactivated in ordinary releases

Telemetry is disconnected from the application while search work proceeds. Preserve this worker, application integration modules, tests and all recordings for future development. Ordinary `app:dist` no longer publishes the worker or includes `dist/telemetry/win-x64` in installer resources. Distribution verification accepts its absence and rejects an accidentally bundled Telemetry executable; private recordings, fixtures and unexpected executables remain prohibited.

Manual `telemetry:build`, `telemetry:test`, `telemetry:publish` and `telemetry:app:test` commands remain available. Run `npm run log -- frontend dist:test` from the repository root for distribution-policy regression tests. Existing recordings remain in each user's application-data `telemetry/<userId>/recordings` directory; deactivation does not clean or migrate them.

To re-enable on the future Telemetry branch, review and reconnect the main-process orchestrator/auth/game subscriptions and IPC registry, preload bridge, admin navigation/panel loading and shutdown cleanup. Restore `telemetry:publish` to `app:dist`, the Telemetry `extraResources` entry, and the worker/version requirements in `scripts/verifyDistribution.mjs` together. Verify the worker/version contract and private-data exclusions before accepting a release. Create that branch only after the search fix is complete.

The retained Admin → Telemetry implementation connects the local Windows x64 worker to Overview, Kills, Combat, Items and Map. It captures ordinary EAC-enabled traffic for diagnostics. Core keeps its command path. Telemetry does not read game memory or perform automatic moderation.

## Ownership

Each subsystem has an entry point: `capture/captureOrchestrator.cs`, `decoding/decodingOrchestrator.cs`, `tracking/trackingOrchestrator.cs`, `recording/recordingOrchestrator.cs`, `playback/playbackOrchestrator.cs`, `api/apiOrchestrator.cs` and `runtime/telemetryOrchestrator.cs`. Extend protocol support in focused primitives, packet/channel/object helpers, property profiles or RPC handlers.

The dormant integration in `src/app/main/telemetry/` owns process startup, account namespaces, name lookups, request validation and cancellation. `telemetryQueries.ts` handles bounded reads; `telemetryReads.ts` tracks live/replay request cohorts. When reattached, the preload bridge exposes `window.chivTelemetry` through typed IPC. Main independently requires a signed-in superadmin in the primary window and frame. Revocation cancels reads before cleanup finishes.

Main uses per-launch bearer-authenticated HTTP on an ephemeral loopback port. The address and token do not reach the renderer. NDJSON carries committed invalidations through IPC, with one unacknowledged update and one latest resync. The stream cursor is separate from the committed capture sequence and time. Hiding the page cancels viewing work; recording remains independent.

## Capture

`program.cs` selects the unelevated worker or elevated `--capture-host`. Only the helper captures packets. It has no HTTP listener, database or production credentials. Its private pipe checks the Windows user SID and both peer PIDs at Identification impersonation level. Each Record action requires UAC. Parent leases and pipe closure stop owned sessions.

Packet Monitor's streaming API is required. Native endpoint constraints are installed before activation, and the helper independently checks the exact IPv4 UDP endpoint before delivering or saving packets. Retain this guard: callbacks on the tested Windows build included nonmatching traffic despite successful native filter calls. IPv6, fragments and unsupported link kinds are excluded.

Queues hold at most 2,048 packets. Overflow retains a loss marker even if no later packet arrives. Loss and connection changes invalidate actor and identity continuity. Partial assembly is limited to 128 channels, 8 MiB total and 256 KiB per message. Reliable reordering retains at most 64 messages per channel. Runtime drains at most 256 packets or ten milliseconds before checking commit and shutdown work.

The toolbar follows the current server until an explicit selection. Before joining, its server picker uses SpellBook's existing paged server directory and the gameplay endpoint. Selection stays fixed while capture starts or runs. Recording survives a main-menu visit and rejoining the selected server; a confirmed game exit or joining a different endpoint stops it with a visible reason. Temporary Core unavailability does not imply game exit. The recording indicator waits for native capture activation.

Record can also start during gameplay: `decoding/recovery/` admits provisional pawn tracks after supported movement in three distinct packets. Tracks remain anonymous until explicit metadata resolves them. Initial identities and classes may never repeat; recording before joining still provides better coverage.

## Evidence semantics

`actorChannelDecoder.cs` coordinates actor and component dispatch. PlayerState, Stats, inventory and supported combat component profiles retain source direction, connection, lifetime, object references and bit spans. Fragmented observations use the completing packet's ordinal and UTC. Unknown fields, native suffixes, packed flags and unverified numeric values remain explicit.

Typed PlayFab serialization plus the current pawn-to-PlayerState relationship proves an account. Arbitrary strings, shared channel numbers and item ownership do not. A cleared relationship invalidates reverse links before later observations, including within the same packet. Future identities do not relabel earlier positions. Incoming/outgoing tracks remain separate without explicit linking evidence; conflicting proofs are quarantined.

A complete supported PlayerState profile containing typed account identity can establish a channel-local account even when its actor GUID is missing. Retained profile fields stay within that channel lifetime. A reciprocal current pawn/state reference can later resolve the GUID; retained evidence keeps its original source ordinal while the link takes effect only at the proving observation. Generic class GUIDs do not identify PlayerStates globally. Account-only roster entries use `observationKind=account`; they have no invented pawn or map position. Supported component fields with unresolved owners remain `componentStateObserved` events without player attribution.

The player tracker emits sparse state changes for observed health, stamina, inventory, statuses and supported combat/profile fields. Missing health maximum remains null: the retained profile does not prove one. Null inventory means unknown; an observed empty array means empty. Counter changes require the corresponding observed event and participant relationship. Damage contributors remain an array. An attack or ability request does not prove execution. A death notification is distinct from channel closure or disconnection.

Inventory slots resolve named item classes from current item evidence. A reverse index refreshes only affected active holders when class evidence arrives, emitting `inventoryClassChanged` rather than another slot change or spawn. Earlier snapshots remain unchanged. Destroyed, evicted or disconnected object evidence cannot supply a stale class; dormancy retains the last known class.

A destroyed GUID reopening starts a fresh item observation with no former owner or instigator, even when its new class is already named. Former holder slots retain the raw GUID but cannot inherit the reused object's type until a new incoming sparse inventory assignment explicitly updates that slot. Length-only inventory updates, cached profiles and unrelated state changes cannot restore eligibility. Slot invalidations are bounded by current holder slots and clear on slot removal, pawn closure or continuity reset. Reuse processing precedes item/pawn routing so a GUID reused for a pawn loses its old item role.

Player movement keeps raw coordinates and coordinate space. Missing transforms never become assumed world positions. Trails split at gaps, base/space changes, lifetimes and large discontinuities. Items never become player map nodes.

`tracking/items/itemTracker.cs` separates first observation, reappearance, dormancy, relevance loss, replication end, destruction and class/relationship changes. First observation does not prove creation: an existing object can become relevant. Missing location never becomes `(0,0,0)`. Owner and instigator references are resolved only from evidence known when the event occurred; neither role proves the creator. Unknown archetypes stay unclassified. A bounded object history emits a coverage notice after eviction.

## Storage and queries

Recordings live under Electron `userData/telemetry/<user ID>/recordings/<UUID>/`. Files include `manifest.json`, SQLite/WAL, 64 MiB `packets/*.pcapng` segments and `packetHashes.json`. PCAPNG timestamps retain UTC; comments prefixed `spellbook.telemetry.v1:` preserve ordinal, monotonic time and loss. Stop drains, commits and hashes raw packets. Logout, game exit, server change and shutdown stop owned acquisition.

Schema 2 stores numeric positions separately from sparse entity/player changes, indexed metrics, membership checkpoints and cumulative summaries. Prepared statements share one writer transaction. Pending work commits at a 100 ms deadline or bounded byte threshold; quiet time publishes a one-second watermark. Storage size is reconciled every five seconds, with incremental accounting between checks. Checkpoints follow membership changes, not every movement observation.

Manifest and derived-view pointers publish through a complete sibling `.new` file and atomic replacement. Windows sharing/access-denied replacement errors receive three bounded retries (10, 20 and 40 ms); permanent failures propagate and preserve the previous and pending files. Pointer readers allow replacement while their read handle is open.

Frames return a read view containing generation, committed sequence and displayed time. Event, player, metric and trajectory reads use that same evidence bound. Queries must reject an obsolete generation and refresh from a new frame instead of mixing snapshots. Names are supplemental labels for identities already known at the cursor.

The historical player catalog retains contexts ended by an explicit PlayerState clear, suppresses aliases only after their observed merge, and prefers a pawn context over an account-only context for each canonical track. Within that choice it prefers the latest active incoming context. Departed selections keep their historical alias scope. Catalog selection uses existing schema 2 data; recovering additional packet evidence requires reprocessing.

Matching item class, event kind, relationship and recorded second share one stable group within a continuity interval. A hundred observations update one row's count. Cumulative group progress supports earlier cursors without showing the final count early. Raw individual evidence remains queryable with `groupItems=false`; mixed-object groups clear representative actor/location fields. Group counts are diagnostic evidence, not a mass-duplication verdict.

Responses are bounded to 1 MiB. Event pages contain at most 200 rows, player pages at most 200, frames at most 512 entities and trajectories an explicit shared point budget. The renderer requests at most 64 tracks and 2,048 map points, prioritizing the selected and active players. Frame summaries remain independent of search and pagination.

Summary queries keep the small kind/track catalogs outside their indexed history lookups. Filtered event queries count per kind and merge bounded candidates; rewind/search counts also establish the latest matching sequence so page reads skip future entries. Startup adds optional query indexes to schema 2 recordings. A denied upgrade is reported without blocking other recordings, and schema 1 files retain their existing read path.

Visible map frames run at most ten times per second; other views at most five. Event tabs with a nonempty text search automatically refresh at most twice per second; direct user actions still request a read immediately. History details run at most twice per second. Requests coalesce, newer seeks cancel obsolete work and stale responses cannot replace the displayed selection. Hidden pages and unchanged paused views issue no viewing queries. Live rewind and saved replay retain separate state. See the renderer's owning `DEVELOPMENT.md` for scheduling and cache details.

## Import, reprocessing and quotas

Import selects one file in Main: `capture.json`, `manifest.json` or an adjacent PCAPNG segment. `telemetryImportSelection.ts` discovers associated segments in numeric order, including moved legacy folders and UTF-8 BOM metadata. Discovery stays within the recording folder and rejects missing or duplicate segments. Without metadata, the selected packet file requires an explicit endpoint. A saved recording never silently inherits the current game server.

Old schema recordings remain readable. New fields require explicit reprocessing. Reprocessing reads preserved raw segments, keeps timing/loss/quiet tail and builds a separate generation. It switches `view.json` only after completion and retains the previous view if cancellation or decoding fails. Missing raw packets fail without replacing the saved view. Derived generations currently duplicate raw segments, so allow disk space for both.

Default limits are 2 GiB per recording, 10 GiB total and 512 MiB minimum free space. Quota stops preserve evidence; no automatic deletion occurs. Recovery marks unfinished committed sessions interrupted. Imports and reprocessing share one reserved operation slot with acquisition and support cancellation.

Names use authenticated `GET /players/by-playfab/:id`, four concurrent requests and a ten-minute account-scoped cache. The lookup UTC is persisted. Names are optional labels, never account proof. The worker receives no production credentials.

## Verification

Use SDK 10 with `global.json` and workstation GC. From repository root run `npm run log -- frontend <script>` with `telemetry:test`, `telemetry:app:test`, `telemetry:publish`, `app:check` or `app:build`. Run root `npm run verify:boundary` against a clean tracked export. The wrapper uses root `.artifacts/tmp/telemetry/sdk` if present, otherwise installed `dotnet`.

Private corpus checks are opt-in through the variables documented beside `decoding/verifiedCorpus.test.cs`; captures stay outside shipped code. `TELEMETRY_PERFORMANCE=1` enables the explicit storage benchmark. It distinguishes an accelerated full-rate one-hour history from a paced ingestion/query sample. CPU is reported in logical-core units, not divided by the machine's processor count. Synthetic storage checks do not measure native capture or wire decoding cost.

Retained integration reports, screenshots and performance results belong under root `.artifacts/qa/telemetry/integration20261020/`. Check saved-packet parity, synthetic causality and bursts, browser interactions, the sandboxed Electron preload/Main/worker path and installed EAC-enabled gameplay separately. Earlier acceptance does not prove a newer build passed installed-game checks.

Ordinary `app:dist` builds currently exclude the worker. The retained manual publish command writes to `dist/telemetry/win-x64`; reattaching the former installer resource would place it under `resources/telemetry/`. Distribution checks still reject captures, SQLite, fixtures, tests and unexpected environment files. Stop owned QA workers before republishing locked Windows binaries. Local builds and branch pushes do not publish a release.
