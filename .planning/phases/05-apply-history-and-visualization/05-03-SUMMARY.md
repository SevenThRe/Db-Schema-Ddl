---
phase: 05-apply-history-and-visualization
plan: 03
subsystem: workspace-history-apply
tags: [db-management, history, apply, client]
requires: [05-01, 05-02]
provides:
  - DB history panel with live/snapshot/file compare switching
  - Safe-apply panel with blocked-table explanations and summary-first job drilldown
  - Unified DB 管理 workspace state shared across diff, history, and apply
affects: [client, test]
tech-stack:
  added: []
  patterns: [three-panel operational workspace, remembered local view state, summary-first execution feedback]
key-files:
  created:
    - client/src/components/db-management/DbHistoryPanel.tsx
    - client/src/components/db-management/DbApplyPanel.tsx
  modified:
    - client/src/components/db-management/DbDiffWorkspace.tsx
    - client/src/components/db-management/DbManagementWorkspace.tsx
    - test/client/db-management-phase5-ui.test.tsx
completed: 2026-03-18T00:05:34.9558219+09:00
---

# Phase 5 Plan 03: History and Safe Apply Workspace Summary

**Plan 05-03 turned DB 管理 into a real operations workspace with DB history, safe apply selection, and job drilldown tied to the current file and DB context.**

## Accomplishments

- Added `DbHistoryPanel.tsx` with default `live vs previous snapshot` comparison, alternate `live vs chosen snapshot`, `snapshot vs snapshot`, and `file vs live DB` compare modes.
- Added `DbApplyPanel.tsx` that derives executable tables from current diff blockers, disables unsafe tables with visible reasons, and shows apply results as summary-first job records with SQL-level drilldown.
- Extended `DbDiffWorkspace.tsx` so the parent workspace can observe compare state, rename decisions, SQL preview, and dry-run results without duplicating logic.
- Updated `DbManagementWorkspace.tsx` so diff, history, and apply views share the same selected connection, database, file, and sheet context.

## Verification

- `npm run check`: **passed**
- `node --test --import tsx test/client/db-management-phase5-ui.test.tsx`: **passed**

## Deviations from Plan

- Rather than hiding history inside the existing diff panel, the workspace now exposes explicit view tabs so history/apply/graph remain discoverable while still defaulting to the operational diff view.

## Self-Check: PASS
