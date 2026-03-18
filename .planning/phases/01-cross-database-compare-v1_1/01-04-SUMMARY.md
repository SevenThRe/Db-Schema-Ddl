---
phase: 01-cross-database-compare-v1_1
plan: 04
subsystem: db-compare-policy-settings
tags: [db-management, db-vs-db, settings, policy, storage]
requires: [01-01, 01-02, 01-03]
provides:
  - Persistent low-complexity DB compare policy storage
  - Settings UI for table/column rename auto-accept thresholds
  - Policy-aware compare sessions with conservative defaults
affects: [shared, server, client, test]
tech-stack:
  added: []
  patterns: [single-row policy persistence, threshold-based auto-accept, conservative defaults]
key-files:
  created:
    - client/src/components/settings/DbComparePolicySection.tsx
  modified:
    - shared/schema.ts
    - server/storage.ts
    - server/routes/db-management-routes.ts
    - server/lib/extensions/db-management/history-service.ts
    - client/src/pages/Settings.tsx
    - test/server/db-db-phase1.test.ts
    - test/client/db-vs-db-ui-phase1.test.tsx
completed: 2026-03-18T02:30:00+09:00
---

# Phase 1 Plan 04 Summary

Rename/equivalence handling is now configurable without turning into a rules engine.

## Accomplishments

- Added persistent DB compare policy storage with two optional thresholds: table rename and column rename auto-accept.
- Exposed the policy in Settings through a dedicated `DbComparePolicySection`.
- Wired compare sessions to auto-accept only high-confidence rename suggestions when the configured threshold allows it; default remains fully manual.

## Verification

- `node --test --import tsx test/server/db-db-phase1.test.ts`: **passed**
- `node --test --import tsx test/client/db-vs-db-ui-phase1.test.tsx`: **passed**
- `npm run check`: **passed**

## Self-Check: PASS
