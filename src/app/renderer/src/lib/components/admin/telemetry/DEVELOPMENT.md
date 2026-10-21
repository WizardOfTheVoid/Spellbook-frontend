# Telemetry renderer

Admin → Telemetry reads the existing desktop telemetry bridge. Record/Stop control capture, the library lists persisted recordings, and import/reprocess expose worker job progress and cancellation. The current server address supplies the initial IPv4 endpoint; a manual override survives server changes, and returning to the menu preserves the last valid address.

The capture toolbar uses the shared `currentServerSummary` name and gameplay endpoint, matching SpellBook's Game Server view. Automatic selection is the default; Choose server uses the existing paged server query and shared Select to choose a target before joining. Search requests one page of active servers and uses only the validated host plus gameplay port, never the query port. Session details contains the optional address override. A retained endpoint after leaving a server is labeled Last detected server, and Record requires a valid endpoint. Returning to automatic selection without a detected server clears a manual target. The standalone QA shell does not receive Electron's current-game state and therefore cannot discover a real current server by itself.

The target is locked while startup or acquisition is in progress. The toolbar reports active capture only after the worker confirms helper activation; start capture before joining to include initial traffic. Main preserves acquisition through the menu, same-target rejoin and temporarily unavailable Core. Explicit Stop, account logout, a confirmed game exit after observing it running, or a confirmed join to another host/game port stops it. A target change during helper activation saves the capture and reports the mismatch. Main's `telemetryCaptureLifecycle.ts` owns these transition rules, independent of whether the renderer is visible.

## Ownership

- `telemetryPanel.svelte` coordinates page composition, active lifecycle and snapshot rendering.
- `session/telemetryModels.ts` defines renderer models. Session controls and the recording library live beside it.
- `session/telemetrySessionOrchestrator.ts` owns independent live/replay workspaces, capture commands, lifecycle, desired/resolved cursors and scheduling.
- `session/telemetryReadScheduler.ts` permits one in-flight cohort and one replaceable pending cohort. Manual seeks and hiding invalidate/cancel old work; only a complete current cohort publishes.
- `session/telemetryWorkerSource.ts` joins a frame with dependent reads carrying its exact read view and workspace request ID. A bounded retry obtains a fresh frame after a generation/read-view race.
- `preview/` contains isolated fictional fixtures and their behavior tests. Production never creates the preview source or substitutes fictional observations for worker errors.
- `players/` owns the persistent roster, compact searchable picker and identity strip.
- `overview/` composes Dashboard statistic cards, history charts and player state.
- `events/` shares the Kills, Combat and Items feed with separate filters for each tab. Avoid forwarding-only view wrappers.
- `items/` formats item references for event titles and inventory slots. Known asset prefixes become readable kinds and recognized folders become tags; structural folders are omitted. Raw paths remain in tooltips and event details, and continue to drive storage, grouping and search. Numeric suffixes and unknown references are preserved.
- `map/` owns geometry, equal-scale projection and the interactive XY view.
- `timeline/` owns shared playback controls and recorded-time formatting.

Live and replay retain separate player, tab, cursor, speed, playback, event filters and pages. Player/tab changes keep time; event timestamps seek and pause. Looking at replay or hiding the panel preserves capture. Only the explicit Stop command stops acquisition from this renderer.

The shared page header has a Live toggle: on opens the live workspace, off opens recordings. It switches the source without starting or stopping acquisition. `session/telemetryHeader.svelte` uses the same session state; Record/Stop remain in the session toolbar.

Play/Pause, speed and the timeline slider share one row. The playback button keeps a fixed width when its label changes. The timestamp follows the slider, moving below only in narrow containers. Playback state is conveyed by the button; a catch-up row appears only while a recording is rewound or paused. Speed is disabled at the live head because live following uses real time.

The session toolbar keeps recording controls and a compact details disclosure. Duration stays beside the timeline and in details instead of repeating in the toolbar. The roster and library use the shared Input so names and IDs have enough typing space in narrow columns. The page header reduces its back-button size and spacing below 480px panel width to keep the title and Live toggle on one line.

Rendering and reads require a mounted, active panel and a visible document. Hiding cancels reads, unsubscribes and clears timers; returning reconciles worker status/library once. Paused saved sessions perform no recurring reads. A paused live cursor keeps its snapshot while capture advances.

Frame reads are limited to 10 Hz for Map and 5 Hz elsewhere, and only a changed relevant head/cursor requests another cohort. Drag seeks are limited to 10 Hz with an immediate release read. History/trails refresh at 2 Hz: 60 seconds and 240 points shared across health/stamina; 30 seconds and 2,048 total trail points. Map queries prioritize the selected player and active players within 64 entity IDs and disclose omissions. The player catalog pages 100 lifetimes; forward playback reuses the same generation/membership revision only while the cached cursor is no later than the requested cursor. Rewinding before that catalog obtains a fresh page. Active frame state overrides catalog state. Selected departed lifetimes can be fetched directly.

Events use worker filtering/search and 100 grouped rows per page with shared pagination controls. An active text search limits automatic Kills/Combat/Items cohorts to 2 Hz because broad historical searches are more expensive. Normal feeds retain 5 Hz and Map retains 10 Hz. Search edits, released seeks, tab and player changes request an immediate complete cohort; dragging retains its 10 Hz seek limit. Frame and event results always publish together. Statistic cards use worker summary totals independently of loaded rows. Completed snapshots, detail reuse and catalog pages share one LRU cache limited to eight entries and 8 MiB serialized. Detail reuse includes generation, lifetime and continuity/loss metadata so it cannot cross a reprocess or capture gap.

## Interpretation and fixtures

Every view uses the same cursor-scoped snapshot. Selection retains its original track anchor and follows only aliases proven at the current cursor; rewinding restores the earlier anonymous track. Unknown metrics use `null`, displayed as `—`. Unchanged values do not expire just because another update has not arrived. Missing samples and new lifetimes break charts and trajectories.

The roster counts recorded tracks, not the current server population. An unresolved outgoing track is labeled Local movement from explicit direction metadata; it may represent the same person as an incoming track without enough evidence to merge them. Ended marks an inactive track without implying that the person left the server. Frame/catalog merging uses both track and lifetime IDs, retaining ended track contexts after an identity clear while giving the current frame precedence for the same pair. The Overview total counts observed incoming tracks and separately reports those still active. Direction remains unknown when older recordings lack it.

`observationKind: account` exposes an observed account/profile without claiming a pawn link or current server presence. These rows retain observed names and IDs, are labeled Observed account, and never borrow pawn positions, trajectories or health history. Explicitly linked contexts sharing a track prefer the pawn representative. Equal names or account strings do not merge tracks. Combat includes `accountStateObserved` and `componentStateObserved`; unassigned component values keep their evidence without invented participants. Items includes `inventoryClassChanged` as a type update, separately from observations and inventory slot changes.

An ended context cannot inherit a later position from the same pawn entity. Trails are omitted when that entity maps to multiple track contexts at the current cursor, because trajectory points do not prove which context owns them. Rewinding to an unambiguous context restores its trail; the current active position remains available.

Deaths retain every contributor and do not invent a single killer. A death notification preserves its raw reason code without assigning unproven meanings; channel closure never implies a disconnect or death. Attack starts/cancels are requests. Item observation is not creation, and owner/instigator relationships do not identify a creator. Historical item GUIDs are never resolved against current frame identities; event-time references carry attribution. Worker group keys update one item row as its count grows. Unknown inventory is distinct from a known empty inventory: a null slot is unknown, while an observed zero object reference is Empty. Base-relative coordinates are excluded from world maps.

Fixtures contain eight fictional players, two initially anonymous, identity resolution at 8s, death at 12s, respawn at 18s, missing health at 10–16s, a position gap at 14–18s, a 100-item burst at 20–20.99s, disconnect at 24s and inventory change at 26s. Sample names/IDs are not production accounts.

## Layout and validation

The visible Admin Telemetry marker participates in existing Dashboard width rules. A named `telemetry` container switches the roster to a picker below 760px content width; cards stack further below 480px. Roster and view content scroll independently, with the timeline outside both. A short map body scrolls inside the view rather than clipping its viewport/footer. Windows at most 800px tall use one workspace scroller instead of nested view scrollers, retaining access to all details and the fixed timeline. Existing shared tokens, controls, ListRow, Avatar, Tag, DashboardStatCard and EvilCharts/LayerChart are reused.

Run from the repository root:

```powershell
npm run log -- frontend telemetry:app:test
npm run log -- frontend app:check
npm run log -- frontend app:renderer:build
```

Behavior tests cover cohort races, hiding, cursor isolation, reconnect, bounded retries/caches, causal identity/data, grouped totals, event-time item relationships, catalog reuse, metric gaps and geometry. The integration browser harness lives under root `.artifacts/tmp/telemetryIntegration/`; it mounts the actual AdminPanel and routes the bridge through Main's orchestrator into a real worker rooted at `.artifacts/qa/telemetry/integration20261020/recordings`. Production name lookups return 404 in that harness, and starting live capture requires coordinated Electron acceptance.

Local checks and retained capture replay do not establish live-game or packaged Electron acceptance. Keep those results separate in the integration QA report.
