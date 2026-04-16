---
phase: 24-canonical-workbench-flow
plan: 02
subsystem: restore-and-recovery-semantics
tags: [db-workbench, session, recovery, restore, local-storage]
requires: [01]
provides:
  - Extended per-connection workbench session restore
  - Explicit recovery notice when the remembered connection cannot be restored
  - Guard tests for restore and recovery semantics
affects: [client, test]
tech-stack:
  added: []
  patterns: [local-first session restoration, explicit fallback messaging, connection-scoped state persistence]
key-files:
  created:
    - test/client/db-workbench-session-phase24.test.ts
  modified:
    - client/src/components/extensions/DbConnectorWorkspace.tsx
    - client/src/components/extensions/db-workbench/workbench-session.ts
    - client/src/components/extensions/db-workbench/WorkbenchLayout.tsx
completed: 2026-04-12T15:40:00+08:00
---

# Phase 24 Plan 02 Summary

Reopen and recovery behavior is now explicit instead of silent.

## Accomplishments

- Extended `WorkbenchSessionState` to persist active schema, last pane, inspection target, schema diff target, and sync source/target ids per connection.
- Updated `WorkbenchLayout` to hydrate and normalize the expanded session state, including restoring inspection targets and connection-scoped compare/sync context.
- Added a shell-level recovery notice in `DbConnectorWorkspace` so missing remembered connections fall back to `Connection Center` with explicit operator messaging instead of silent state loss.
- Added focused session tests that lock the new restore contract and the inspect-tab fallback behavior.

## Verification

- `npm run check`: **passed**
- `$env:NODE_OPTIONS='--import=tsx'; node --test --experimental-strip-types test/client/db-workbench-session-phase24.test.ts`: **passed**

## Self-Check: PASS
