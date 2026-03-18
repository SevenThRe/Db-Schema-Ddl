---
phase: 05-apply-history-and-visualization
plan: 01
subsystem: contracts-history-graph-seams
tags: [db-management, history, apply, graph, contracts]
requires: [04-03]
provides:
  - History compare/apply/graph Zod contracts and typed routes
  - Snapshot-event and deploy-job persistence seams separate from immutable snapshots
  - Wave 0 deterministic Phase 5 fixtures and structural tests
affects: [shared, server, client, test]
tech-stack:
  added: [@xyflow/react, elkjs]
  patterns: [typed route contracts, immutable snapshots plus event history, summary-first deploy jobs]
key-files:
  created:
    - test/server/db-phase5-fixtures.ts
    - test/server/db-history-phase5.test.ts
    - test/server/db-apply-phase5.test.ts
    - test/client/db-management-phase5-ui.test.tsx
  modified:
    - shared/schema.ts
    - shared/routes.ts
    - server/storage.ts
    - client/src/hooks/use-db-management.ts
    - package.json
    - package-lock.json
key-decisions:
  - "Represent compare inputs as explicit file/live/snapshot sources so baseline is not tied to last successful apply."
  - "Persist scan events and deploy jobs as separate records instead of mutating immutable schema snapshots."
  - "Expose history/apply/graph via typed hook seams and remembered mode constants before UI rendering work starts."
duration: unknown
completed: 2026-03-17T12:52:30.601Z
---

# Phase 5 Plan 01: Contracts, Storage Seams, and Wave 0 Tests Summary

**Plan 05-01 established the shared language for Phase 5 history compare, safe apply, and graph mode without collapsing snapshot history into deployment state.**

## Accomplishments

- Added new shared schemas for compare sources, scan events, history list/detail, history compare, safe apply requests, deploy jobs, statement-level results, graph DTOs, and DB management view modes in `shared/schema.ts`.
- Extended `shared/routes.ts` with typed DB management endpoints for history list/detail, history compare, apply submission, deploy job detail, and graph DTO loading.
- Extended `server/storage.ts` with persistence seams for immutable snapshots plus separate scan-event and deploy-job records in both memory and database-backed storage implementations.
- Added focused client hooks and mode constants in `client/src/hooks/use-db-management.ts` for history queries, compare/apply mutations, deploy job detail, graph data loading, and remembered active mode state.
- Created deterministic Phase 5 fixtures and test scaffolds in `test/server/db-phase5-fixtures.ts`, `test/server/db-history-phase5.test.ts`, `test/server/db-apply-phase5.test.ts`, and `test/client/db-management-phase5-ui.test.tsx`.

## Verification

- `npm install` completed successfully and refreshed `package-lock.json` for `@xyflow/react` and `elkjs`.
- `npm run check`: **passed**
- `node --test --import tsx test/server/db-history-phase5.test.ts`: **passed**
- `node --test --import tsx test/server/db-apply-phase5.test.ts`: **passed**
- `node --test --import tsx test/client/db-management-phase5-ui.test.tsx`: **passed**

## Deviations from Plan

### Git Safety Deviation

- **Issue:** The repository has a large dirty worktree with many unrelated pre-existing changes.
- **Adjustment:** I verified the implementation directly in the main thread but did not create the plan's atomic git commits, to avoid bundling unrelated changes into Phase 5 history.
- **Impact:** Code, tests, and lockfile are now in a good local state, but the GSD “one commit per task” expectation remains intentionally unmet for safety.

## Deferred Issues

- Atomic git commits for Tasks 1-3 were intentionally skipped because the current worktree contains many unrelated changes.

## Self-Check: PARTIAL

Missing completion items:
- Per-task git commits
