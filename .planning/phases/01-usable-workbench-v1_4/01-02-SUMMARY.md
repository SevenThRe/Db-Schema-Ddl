---
phase: 01-usable-workbench-v1_4
plan: "02"
subsystem: frontend-ipc
tags:
  - ipc-bridge
  - host-api
  - capabilities
  - workbench-layout
  - css-variables
dependency_graph:
  requires:
    - 01-01 (shared/schema.ts Phase 1 types)
  provides:
    - IPC bridge methods: executeQuery, explainQuery, cancelQuery, previewDangerousSql, exportRows, fetchMore
    - ConnectionsApi interface extended with 6 Phase 1 methods
    - Capability model: db.plan.read, db.result.export
    - WorkbenchLayout shell component
    - Phase 1 CSS custom properties
  affects:
    - client/src/extensions/host-context.tsx (noopHostApi updated)
    - src-tauri/src/builtin_extensions/mod.rs (db-connector manifest name + capabilities)
tech_stack:
  added:
    - sql-formatter (SQL formatting library, EDIT-04)
  patterns:
    - Capability-gated IPC: requireCap(granted, cap) guard before desktopBridge call
    - Routing shell pattern: workbenchMode state routes between WorkbenchLayout and legacy view
    - react-resizable-panels for editor/results vertical split
key_files:
  created:
    - client/src/components/extensions/db-workbench/WorkbenchLayout.tsx
    - test/client/sql-formatter.test.ts
  modified:
    - client/src/lib/desktop-bridge.ts
    - client/src/extensions/host-api.ts
    - client/src/extensions/host-api-runtime.ts
    - client/src/extensions/host-context.tsx
    - client/src/components/extensions/DbConnectorWorkspace.tsx
    - src-tauri/src/builtin_extensions/mod.rs
    - client/src/index.css
decisions:
  - WorkbenchLayout receives onSwitchToLegacy callback to preserve legacy view access without a separate URL state
  - workbenchMode defaults to "workbench" so new connections auto-route to the workbench
  - noopHostApi extended with Phase 1 methods (all returning reject) to satisfy ConnectionsApi interface
  - keywordCase: "upper" added to sql-formatter tests to match app usage pattern (default is lowercase)
metrics:
  duration: "7 minutes"
  completed_date: "2026-03-24"
  tasks_completed: 3
  files_modified: 8
  files_created: 2
---

# Phase 1 Plan 02: IPC Bridge, HostApi Extension, and Workbench Layout Shell Summary

**One-liner:** IPC bridge with 6 query methods, capability-gated HostApi, WorkbenchLayout 3-pane shell with env bands, and Phase 1 CSS variables.

## What Was Built

### Task 0: sql-formatter Wave 0 Test

Installed `sql-formatter` package and created `test/client/sql-formatter.test.ts` with 4 test cases covering MySQL/PG dialect formatting, comment preservation, and multi-statement SQL. All 4 tests pass.

### Task 1: IPC Bridge + HostApi + Capabilities

**desktop-bridge.ts:** Added 6 new async methods to the `db` block:
- `executeQuery` → `db_query_execute`
- `explainQuery` → `db_query_explain`
- `cancelQuery` → `db_query_cancel`
- `previewDangerousSql` → `db_preview_dangerous_sql`
- `exportRows` → `db_export_rows`
- `fetchMore` → `db_query_fetch_more`

**host-api.ts:** Extended `ConnectionsApi` interface with the same 6 methods.

**host-api-runtime.ts:** Added `"db.plan.read"` and `"db.result.export"` to `ALL_CAPABILITIES`. Implemented capability-gated methods in `createConnectionsApi`:
- `executeQuery`, `cancelQuery`, `previewDangerousSql`, `fetchMore` → require `db.query`
- `explainQuery` → requires `db.plan.read`
- `exportRows` → requires `db.result.export`

**builtin_extensions/mod.rs:** Updated db-connector manifest — name changed to `"DB 工作台"`, description updated, added `"db.plan.read"` and `"db.result.export"` to capabilities array.

**host-context.tsx:** Added noop stubs for all 6 new methods in `noopHostApi` to satisfy the TypeScript interface.

### Task 2: Workspace Refactor + Layout Shell + CSS Variables

**index.css:** Added Phase 1 CSS custom properties in both `:root` and `.dark` blocks:
- Environment colors: `--env-prod`, `--env-test`, `--env-dev` (and `-fg` variants)
- EXPLAIN risk colors: `--explain-risk-high`, `--explain-risk-med`, `--explain-safe`, `--explain-node-bg`, `--explain-node-border`

**WorkbenchLayout.tsx:** Created new file at `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`:
- Environment band (28px, conditional on `connection.environment`)
- Left sidebar (200px fixed) with connection name, env dot, readonly lock icon, switch link
- Main area with tab bar placeholder (36px), toolbar placeholder (36px)
- Editor/results split using `react-resizable-panels` (60/40 default, vertical)

**DbConnectorWorkspace.tsx:** Refactored to routing shell:
- Added `workbenchMode` state ("workbench" default, "legacy" fallback)
- Clicking connection name routes to `WorkbenchLayout`
- `onSwitchToLegacy` callback returns to legacy view
- All existing functionality preserved (connection form, Schema tab, Diff tab)
- Added `レガシービュー回帰保護` comment block at top of component

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] sql-formatter tests used wrong assertion (no keywordCase option)**
- **Found during:** Task 0
- **Issue:** The plan-specified tests asserted `result.includes("SELECT")` (uppercase) but sql-formatter outputs lowercase by default
- **Fix:** Added `keywordCase: "upper"` option constant matching intended app usage pattern
- **Files modified:** `test/client/sql-formatter.test.ts`
- **Commit:** 13c8ab8

**2. [Rule 2 - Missing critical functionality] noopHostApi missing new interface methods**
- **Found during:** Task 1
- **Issue:** `host-context.tsx` noopHostApi did not implement the 6 new ConnectionsApi methods, causing TypeScript error TS2740
- **Fix:** Added 6 noop stubs (all returning `Promise.reject`) to satisfy the interface
- **Files modified:** `client/src/extensions/host-context.tsx`
- **Commit:** 6710b86

## Known Stubs

- `WorkbenchLayout.tsx` editor area: "最初のクエリを書いてください" placeholder — Monaco editor to be wired in Plan 03/04
- `WorkbenchLayout.tsx` results area: "クエリを実行すると結果がここに表示されます" placeholder — result grid to be wired in Plan 03/04
- Toolbar buttons (Run/Explain/Format/Stop) are rendered disabled — will be enabled when Monaco + IPC wired
- These stubs are intentional scaffolding; the plan goal (layout shell) is fully achieved

## Verification Results

- `npx tsc --noEmit` → exit 0 (no type errors)
- `node --test sql-formatter.test.ts` → 4/4 pass
- `node --test extension-boundaries.test.ts` → 16/16 pass (regression clean)

## Self-Check: PASSED

Files created/exist:
- FOUND: client/src/components/extensions/db-workbench/WorkbenchLayout.tsx
- FOUND: test/client/sql-formatter.test.ts

Commits exist:
- 13c8ab8 — Task 0: sql-formatter
- 6710b86 — Task 1: IPC bridge + HostApi + capabilities
- cefa038 — Task 2: workspace refactor + layout shell + CSS variables
