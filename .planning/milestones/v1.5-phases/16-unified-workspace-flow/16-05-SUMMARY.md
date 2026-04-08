---
phase: 16-unified-workspace-flow
plan: 05
subsystem: ui
tags: [db-workbench, session, flow, regression-tests, persistence]

requires:
  - phase: 16-unified-workspace-flow
    provides: Per-connection session persistence scaffolding and phase-16 continuity tests from 16-02/16-04
provides:
  - Selected object focus (`selectedTableName`) is persisted in v2 connection-scoped workbench sessions
  - Connection switch/reopen restore now hydrates selected table focus together with tabs/drafts/recent/snippets
  - Regression tests lock selected-object isolation and restore behavior across connection IDs
affects: [phase-16-unified-workspace-flow, phase-17-safe-data-editing, db-workbench-operator-flow]

tech-stack:
  added: []
  patterns:
    - connection-scoped session contract includes selected object focus as first-class state
    - workbench session hydration restores selected table focus deterministically on connection switch
    - node test flow keeps `.tsx` verification command loader-safe via explicit `--import tsx`

key-files:
  created: []
  modified:
    - client/src/components/extensions/db-workbench/workbench-session.ts
    - client/src/components/extensions/db-workbench/WorkbenchLayout.tsx
    - test/client/db-workbench-session-phase16.test.ts
    - test/client/db-workbench-flow-phase16.test.tsx

key-decisions:
  - "Persist selected object focus in `WorkbenchSessionState` as `selectedTableName: string | null` within `db-workbench:session:v2:{connectionId}`."
  - "Hydration order restores selected table focus during connection switch before continuing normal schema snapshot reconciliation."

patterns-established:
  - "Session payload expansion is backward-safe: malformed or legacy payloads normalize selected object to null"
  - "FLOW-02 continuity checks must assert selected object isolation for at least two connection IDs"

requirements-completed: [FLOW-02, FLOW-03]

duration: 10 min
completed: 2026-04-08
---

# Phase 16 Plan 05: Selected Object Session Persistence Summary

**DB Workbench now persists and restores selected table focus per connection, closing the remaining FLOW-02 continuity gap without breaking existing session isolation behavior.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-04-08T16:02:10+09:00
- **Completed:** 2026-04-08T16:12:39+09:00
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Extended the v2 session contract with `selectedTableName` and default/normalization handling for legacy or malformed payloads.
- Wired `WorkbenchLayout` restore/persist path so connection-switch hydration includes `setSelectedTableName(restored.selectedTableName)` and session writes include selected object state.
- Added regression coverage for selected object isolation and restore behavior across two connection IDs while preserving existing tabs/recent/snippet assertions.
- Verified phase-required `.tsx` node test execution explicitly with `node --import tsx --test --experimental-strip-types ...`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend per-connection session contract to persist selected object state** - `558e549` (feat)
2. **Task 2: Lock selected-object persistence with regression coverage and loader-safe verification commands** - `a8b8308` (test)

## Files Created/Modified
- `client/src/components/extensions/db-workbench/workbench-session.ts` - Added `selectedTableName` to the session contract, default state, and sanitization.
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx` - Restored/persisted selected table focus in connection-scoped session wiring.
- `test/client/db-workbench-session-phase16.test.ts` - Added two-connection `selectedTableName` isolation assertions.
- `test/client/db-workbench-flow-phase16.test.tsx` - Added selected-object restore regression assertion for connection switching.

## Decisions Made
- Kept selected object persistence in the existing v2 session payload rather than introducing a new storage key to preserve a single connection-scoped session source of truth.
- Restored selected table from session in the connection change effect and retained existing schema snapshot reconciliation logic to avoid behavior changes for explorer fallback selection.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- FLOW-02 continuity now includes selected object persistence alongside tabs/drafts/recent/snippets.
- FLOW-03 behavior remains intact and re-verified with phase regression tests.
- Plan metadata can advance to the next phase-16 plan (`16-06`) if still in scope, or close the phase according to roadmap progression.

---
*Phase: 16-unified-workspace-flow*
*Completed: 2026-04-08*
