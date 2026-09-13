# Game status and console verification

The user authorized four simple boolean gates, exact Main Menu detection (running + Hastings + exactly one player), visible disconnected/menu states, snapshot invalidation, and durable console-key verification.

Use Main as the authority. A game-state service polls read-only metadata even while the renderer is hidden. Shared selectors define the four checks; bound Main and renderer methods require no arguments. Unknown metadata closes gates without pretending a confirmed game exit occurred. Preserve the last raw map/count separately from the accepted roster so clearing the Main Menu roster does not erase Main Menu detection.

Clear snapshots on confirmed game exit, recognized Main Menu, and observed server identity changes. Focus changes do not clear rosters. Version invalidation rejects ListPlayers responses started before a clear. Main Menu observations are handled before API submission.

Console verification is saved locally for the selected key with no expiry. Routine ListPlayers failures cannot revoke a passed check. Manual and onboarding checks can replace it; unavailable checks preserve the last confirmed result. Key changes require matching saved verification or a new check. Restart and logout retain the record.

- [x] Add shared game-state checks and Main lifecycle behavior with failing behavior tests.
- [x] Connect metadata monitoring, ListPlayers lifecycle, IPC/preload, and renderer subscription.
- [x] Replace duplicate renderer checks and show game stopped/Main Menu/status unavailable warnings.
- [x] Persist console verification and test restart, transient failures, explicit retries, and key changes.
- [x] Run focused tests, complete frontend tests, type checks and build; review the final diff and update Development.md.

Validation: 953 frontend tests pass; svelte-check has 0 errors and 4 existing CSS warnings; Electron build, packaged renderer routes, and preload checks pass. The Electron smoke check required execution outside the restricted sandbox after its GPU child failed there. Review is complete with no unresolved findings. Actual in-game transitions and installation remain unverified.
