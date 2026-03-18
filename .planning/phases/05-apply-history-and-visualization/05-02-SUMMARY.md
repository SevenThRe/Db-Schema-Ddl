---
phase: 05-apply-history-and-visualization
plan: 02
subsystem: backend-history-apply-graph
tags: [db-management, history, apply, graph, backend]
requires: [05-01]
provides:
  - Changed-only DB scan history and compare-source orchestration
  - Safe apply jobs with statement-level execution results and post-apply rescan
  - Full-database graph DTOs with changed-table highlighting metadata
affects: [server, shared, test]
tech-stack:
  added: []
  patterns: [immutable snapshots plus scan events, summary-first deploy jobs, typed route handlers]
key-files:
  created:
    - server/lib/extensions/db-management/history-service.ts
    - server/lib/extensions/db-management/apply-service.ts
    - server/lib/extensions/db-management/graph-service.ts
  modified:
    - server/routes/db-management-routes.ts
completed: 2026-03-18T00:05:34.9558219+09:00
---

# Phase 5 Plan 02: Backend History, Apply, and Graph Summary

**Plan 05-02 completed the Phase 5 backend core so history, safe apply, and graph mode all run off the same canonical DB schema model.**

## Accomplishments

- Added `history-service.ts` to list changed-only scan history, load snapshot details, and compare `file`, `live`, and `snapshot` sources without introducing a second diff engine.
- Added `apply-service.ts` to submit conservative MySQL apply jobs, persist summary-first deploy records plus statement-level results, stop on first failure, and refresh the target snapshot after execution.
- Added `graph-service.ts` to emit full-database graph DTOs with changed-table and changed-edge highlighting, plus filtered `full`, `changed`, and `selection` modes.
- Extended `server/routes/db-management-routes.ts` with typed Phase 5 endpoints for history list/detail, history compare, apply submission, deploy job detail, and graph data loading.

## Verification

- `npm run check`: **passed**
- `node --test --import tsx test/server/db-history-phase5.test.ts`: **passed**
- `node --test --import tsx test/server/db-apply-phase5.test.ts`: **passed**

## Deviations from Plan

- Apply remains intentionally conservative in Phase 5: it executes file-driven safe subsets only and continues to keep destructive, rename, PK/FK, shrink, and nullability-tightening changes preview-only.

## Self-Check: PASS
