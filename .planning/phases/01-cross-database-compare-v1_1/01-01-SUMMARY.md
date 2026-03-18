---
phase: 01-cross-database-compare-v1_1
plan: 01
subsystem: shared-contracts-and-hooks
tags: [db-management, db-vs-db, shared, hooks, tests]
requires: []
provides:
  - Typed DB-vs-DB compare and preview contracts
  - Dedicated DB-vs-DB route declarations and hook seams
  - Wave 0 server/client test scaffolds
affects: [shared, client, test]
tech-stack:
  added: []
  patterns: [typed zod contracts, dedicated db-vs-db namespace, focused whitebox tests]
key-files:
  created:
    - test/server/db-db-phase1.test.ts
    - test/client/db-vs-db-ui-phase1.test.tsx
  modified:
    - shared/schema.ts
    - shared/routes.ts
    - client/src/hooks/use-db-management.ts
completed: 2026-03-18T02:00:00+09:00
---

# Phase 1 Plan 01 Summary

Shared `DB vs DB` language now exists before backend and UI fan out.

## Accomplishments

- Added typed `DB vs DB` schemas for live source/target compare, directional preview, graph requests, and low-complexity rename policy.
- Extended `shared/routes.ts` and `use-db-management.ts` with dedicated `db-compare` endpoints and hook seams instead of overloading file-vs-DB contracts.
- Added focused Phase 1 server/client tests to lock the contract: live-vs-live compare is allowed for compare/graph, while live-to-live apply remains blocked.

## Verification

- `node --test --import tsx test/server/db-db-phase1.test.ts`: **passed**
- `node --test --import tsx test/client/db-vs-db-ui-phase1.test.tsx`: **passed**
- `npm run check`: **passed**

## Self-Check: PASS
