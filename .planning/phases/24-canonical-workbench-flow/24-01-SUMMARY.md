---
phase: 24-canonical-workbench-flow
plan: 01
subsystem: canonical-shell-and-primary-route
tags: [db-workbench, workflow, navigation, canonical-route, ui]
requires: []
provides:
  - One primary `Database Workspace` route for DB work
  - Secondary `Legacy tools` access instead of peer legacy navigation
  - In-workbench path back to connection management without hidden route loss
affects: [client]
tech-stack:
  added: []
  patterns: [primary-vs-secondary shell navigation, persistent operator context, focused static flow tests]
key-files:
  created:
    - test/client/db-workbench-flow-phase24.test.ts
  modified:
    - client/src/components/extensions/DbConnectorWorkspace.tsx
    - client/src/components/extensions/db-workbench/WorkbenchLayout.tsx
completed: 2026-04-12T15:30:00+08:00
---

# Phase 24 Plan 01 Summary

The DB shell now teaches one primary operator route.

## Accomplishments

- Reframed `DbConnectorWorkspace` so `Database Workspace` is the primary DB route, while legacy DB `Schema` and `Diff` are only reachable behind a secondary `Legacy tools` affordance.
- Tightened shell copy to describe connection management as a supporting surface rather than a peer product mode.
- Added a canonical in-workbench `Connection Center` action in `WorkbenchLayout` so operators can reopen connection management without the shell implying a different product path.
- Expanded visible active-context metadata in the DB shell and workbench header so connection/environment/readonly/schema cues stay visible and stable.

## Verification

- `npm run check`: **passed**
- `$env:NODE_OPTIONS='--import=tsx'; node --test --experimental-strip-types test/client/db-workbench-flow-phase24.test.ts`: **passed**

## Self-Check: PASS
