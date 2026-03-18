---
phase: 01-cross-database-compare-v1_1
plan: 02
subsystem: backend-compare-preview-graph
tags: [db-management, db-vs-db, backend, compare, graph]
requires: [01-01]
provides:
  - Live-vs-live compare backend reused from canonical diff helpers
  - Directional preview generation for source-to-target review
  - DB-vs-DB graph route and changed-table highlighting
affects: [server, shared, test]
tech-stack:
  added: []
  patterns: [canonical compare reuse, preview-only live-vs-live flow, graph derivation from compare result]
key-files:
  created: []
  modified:
    - server/lib/extensions/db-management/db-diff-service.ts
    - server/lib/extensions/db-management/history-service.ts
    - server/lib/extensions/db-management/graph-service.ts
    - server/routes/db-management-routes.ts
    - test/server/db-db-phase1.test.ts
completed: 2026-03-18T02:10:00+09:00
---

# Phase 1 Plan 02 Summary

The backend now compares two live DB targets without introducing a second compare engine.

## Accomplishments

- Refactored the file-vs-DB diff core into reusable helpers so `DB vs DB` compare and directional preview share the same table/column diff pipeline.
- Added live source/target resolution, directional SQL preview routes, and graph derivation routes under the existing `db-management` namespace.
- Kept live-to-live apply blocked while enabling live-to-live compare and graph flows.

## Verification

- `node --test --import tsx test/server/db-db-phase1.test.ts`: **passed**
- `npm run check`: **passed**

## Self-Check: PASS
