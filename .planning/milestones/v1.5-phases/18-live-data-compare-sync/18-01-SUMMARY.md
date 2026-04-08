---
phase: 18-live-data-compare-sync
plan: 01
subsystem: database
tags: [tauri, typescript, ipc, capability]
requires:
  - phase: 17-safe-data-editing
    provides: prepare/commit safety contract and host API gating patterns
provides:
  - Shared compare/apply sync contracts across TS and Rust
  - Host API + desktop bridge methods for data sync operations
  - Tauri command entrypoints for diff/apply lifecycle
affects: [db-workbench, tauri-commands, host-api]
tech-stack:
  added: []
  patterns: [cross-layer contract first, fail-closed capability gate]
key-files:
  created: []
  modified:
    - shared/schema.ts
    - src-tauri/src/db_connector/mod.rs
    - client/src/extensions/host-api.ts
    - client/src/extensions/host-api-runtime.ts
    - client/src/lib/desktop-bridge.ts
    - client/src/extensions/host-context.tsx
    - src-tauri/src/builtin_extensions/mod.rs
    - src-tauri/src/db_connector/commands.rs
    - src-tauri/src/lib.rs
key-decisions:
  - "Phase 18 command surface is registered in lib.rs before runtime implementation to prevent unknown-command drift."
  - "Sync operations require dedicated db.data.sync capability and are fail-closed in host-api-runtime."
patterns-established:
  - "Cross-layer contract parity: shared/schema.ts and Rust mod.rs mirror request/response shapes."
  - "Frontend sync APIs are routed only via host-api -> desktop-bridge -> tauri command chain."
requirements-completed: [SYNC-01, SYNC-02, SYNC-03]
duration: 8 min
completed: 2026-04-08
---

# Phase 18 Plan 01: Command & Contract Foundation Summary

**Cross-layer compare/apply contracts and command routing now exist end-to-end with explicit sync capability gating.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-08T18:31:00+09:00
- **Completed:** 2026-04-08T18:39:21+09:00
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- Added additive TypeScript and Rust contracts for preview/detail/apply/job lifecycle, including blocker vocabulary and snapshot hash fields.
- Exposed sync methods through `ConnectionsApi`, runtime capability checks, and desktop bridge invoke wrappers.
- Registered all Phase-18 sync Tauri command entrypoints to guarantee invoke path reachability.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add shared and Rust contracts** - `615d514` (feat)
2. **Task 2: Wire host API and capability gate** - `51c30e6` (feat)
3. **Task 3: Register Tauri command entrypoints** - `1a95539` (feat)

## Files Created/Modified

- `shared/schema.ts` - Added compare/apply request-response and blocker/status models.
- `src-tauri/src/db_connector/mod.rs` - Added Rust mirror structs/enums for sync lifecycle contracts.
- `client/src/extensions/host-api.ts` - Extended `ConnectionsApi` with sync method signatures.
- `client/src/extensions/host-api-runtime.ts` - Added `db.data.sync` capability checks for sync methods.
- `client/src/lib/desktop-bridge.ts` - Added invoke wrappers for sync command surface.
- `client/src/extensions/host-context.tsx` - Updated noop host fallback to satisfy expanded interface.
- `src-tauri/src/builtin_extensions/mod.rs` - Declared `db.data.sync` capability for `db-connector`.
- `src-tauri/src/db_connector/commands.rs` - Added typed command handlers for sync entrypoints.
- `src-tauri/src/lib.rs` - Registered sync handlers in `tauri::generate_handler!`.

## Decisions Made

- Capability enforcement key is normalized to `db.data.sync` and used identically in manifest and runtime guard.
- Command handlers were introduced as typed stubs first so frontend bridge integration can proceed independently of runtime engine completion.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] HostApi fallback object drifted after interface expansion**
- **Found during:** Task 2 (host API and desktop bridge wiring)
- **Issue:** `client/src/extensions/host-context.tsx` noop `ConnectionsApi` lacked new sync methods, causing `npm run check` failure.
- **Fix:** Added fallback stubs for `previewDataDiff`, `fetchDataDiffDetail`, `previewDataApply`, `executeDataApply`, `fetchDataApplyJobDetail`.
- **Files modified:** `client/src/extensions/host-context.tsx`
- **Verification:** `npm run check` returned 0 after patch.
- **Committed in:** `51c30e6` (Task 2)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** No scope creep; blocker fix was required to keep TypeScript interface contract coherent.

## Issues Encountered

- None.

## User Setup Required

- None - no external service configuration required.

## Next Phase Readiness

- Phase-18 runtime modules can now implement compare/apply logic without changing API shape.
- UI integration can safely call sync commands because capability and command registry are present.

---
*Phase: 18-live-data-compare-sync*
*Completed: 2026-04-08*
