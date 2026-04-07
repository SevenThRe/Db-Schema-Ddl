---
phase: 16-unified-workspace-flow
plan: 01
subsystem: ui
tags: [db-workbench, workspace-routing, legacy-fallback, object-explorer]
requires:
  - phase: 15-query-runtime-hardening-v1_5
    provides: stable runtime semantics and schema context from Phase 15
provides:
  - Deterministic primary SQL workbench entry when an active connection exists
  - Legacy connections/schema/diff tabs retained as explicit fallback tools
  - Persistent object explorer labeling in the primary operator sidebar
affects: [phase-16-plan-02, db-workbench-navigation, operator-shell]
tech-stack:
  added: []
  patterns:
    - primary-route-defaults-to-sql-when-connection-exists
    - legacy-tabs-explicitly-marked-as-fallback
    - object-explorer-heading-stabilized-in-primary-sidebar
key-files:
  created:
    - .planning/phases/16-unified-workspace-flow/16-01-SUMMARY.md
  modified:
    - client/src/components/extensions/DbConnectorWorkspace.tsx
    - client/src/components/extensions/db-workbench/WorkbenchLayout.tsx
    - client/src/components/extensions/db-workbench/ConnectionSidebar.tsx
key-decisions:
  - "Primary DB route selection now resolves to sql when a selected connection is present, while no-connection entry remains on connections."
  - "Legacy tabs are preserved for continuity but intentionally labeled as fallback (`Legacy tools`) to avoid competing with the primary SQL start path."
  - "Object navigation stays inside the fixed-width operator sidebar and is explicitly surfaced as Object Explorer."
patterns-established:
  - "Entry pattern: selected connection defaults to `PRIMARY_WORKSPACE_VIEW` and persists query params for view + connection."
  - "Navigation pattern: legacy tools stay reachable without being presented as the default landing surface."
requirements-completed: [FLOW-01, NAV-01]
duration: 3 min
completed: 2026-04-07
---

# Phase 16 Plan 01: Primary Workspace Route Summary

**DB work now lands on one primary SQL workbench path by default when a connection is active, while legacy views remain explicit fallback tools and the object explorer remains visible in the primary sidebar.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-07T12:35:16+09:00
- **Completed:** 2026-04-07T12:37:33+09:00
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added `PRIMARY_WORKSPACE_VIEW` in `DbConnectorWorkspace` and updated initial route selection so active-connection entry deterministically opens SQL workbench while no-connection entry remains on connections.
- Kept legacy `connections/schema/diff` tabs available, but marked their intent with `Legacy tools` labeling so the SQL workbench route is the clear first path.
- Added `Primary DB workspace` hint text in `WorkbenchLayout` and changed sidebar section heading to `Object Explorer` without moving table/key/index/open-table behavior out of the operator sidebar.

## Task Commits

Each task was committed atomically:

1. **Task 1: Promote SQL workbench as default route with legacy fallback labeling** - `93b9676` (feat)
2. **Task 2: Keep primary shell cues and object explorer visibility stable** - `a91a469` (feat)

**Plan metadata:** Included in this plan completion docs commit.

## Files Created/Modified

- `.planning/phases/16-unified-workspace-flow/16-01-SUMMARY.md` - Plan execution summary for Phase 16 / Plan 01.
- `client/src/components/extensions/DbConnectorWorkspace.tsx` - Primary-route constant, initial view selection branch on active connection, and explicit legacy tools labeling.
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx` - Added primary workspace hint text near top-level shell.
- `client/src/components/extensions/db-workbench/ConnectionSidebar.tsx` - Renamed object section heading to `Object Explorer` while preserving table explorer behavior.

## Decisions Made

- Treat SQL workbench as the primary entry path only at route-selection defaults, not as a hard lock, so schema/diff remain reachable for fallback workflows.
- Keep legacy controls in place for migration continuity, but make fallback status explicit in UI copy.
- Keep object explorer in the same fixed-width operator sidebar so navigation and query launch affordances remain co-located.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan `16-01` is complete and enforces FLOW-01 entry behavior and NAV-01 object explorer visibility prerequisites.
- Phase 16 is ready to continue with `16-02-PLAN.md`.

---
*Phase: 16-unified-workspace-flow*
*Completed: 2026-04-07*
