---
phase: 04-ddl-import-and-extension-management-v1_4
plan: "03"
subsystem: ddl-import
tags: [ddl-import, live-execution, dangerous-sql, host-api, tabs]
dependency_graph:
  requires: ["04-01"]
  provides: ["live-db-execution-tab"]
  affects: ["DdlImportWorkspace"]
tech_stack:
  added: []
  patterns:
    - "Promise-bridged async dialog confirmation via useRef"
    - "Tabs wrapper over existing component body without altering existing logic"
    - "hostApi.connections.previewDangerousSql + executeQuery per-statement loop"
key_files:
  created: []
  modified:
    - client/src/components/ddl-import/DdlImportWorkspace.tsx
decisions:
  - "DangerousSqlDialog requires explicit 'open' prop (separate from preview null check) — matched actual component interface"
  - "QueryExecutionResponse uses batches[] not results[] — adapted per-statement error extraction to use firstBatch.error"
  - "Tab controls placed in the existing header bar (not as a separate TabsList strip) to preserve header layout"
metrics:
  duration_minutes: 15
  completed_date: "2026-03-25"
  tasks_completed: 1
  tasks_total: 1
  files_modified: 1
  files_created: 0
requirements: [IMP-01, IMP-02, IMP-03]
---

# Phase 04 Plan 03: DDL Import Live-DB Execution Tab Summary

**One-liner:** Live-DB execution tab added to DdlImportWorkspace — connection selector, SQL file loader, per-statement execution loop with DangerousSqlDialog safety gate and per-statement success/error/skipped status display.

## What Was Built

Added a two-tab layout to `DdlImportWorkspace`:

- **Tab 1 "导出到 Excel"**: Existing DDL→Excel export flow. No logic changes — entire existing body moved verbatim into this tab.
- **Tab 2 "导入到数据库"**: New live-DB execution tab with:
  - Connection selector (loads via `hostApi.connections.list()` on tab activation)
  - Empty state "未连接数据库" when no connections are configured
  - SQL file picker (hidden `<input>` + button trigger) loading `.sql`/`.ddl` files
  - `splitSqlStatements()` — semicolon-based SQL splitter with line number tracking (skips comments/blank lines)
  - Per-statement preview list (line number, status icon, SQL preview, elapsed time)
  - `executeLiveImport()` loop: `previewDangerousSql` → `DangerousSqlDialog` gate (Promise-bridged via `dangerResolveRef`) → `executeQuery`
  - Per-statement status: `pending` / `running` / `success` / `error` / `skipped`
  - Error details shown below each failed statement (line number reference)
  - Footer strip: "选择 SQL 文件" button + statement count summary + "导入到数据库" execute button

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add live-DB execution tab to DdlImportWorkspace | 3a33c39 | client/src/components/ddl-import/DdlImportWorkspace.tsx |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] DangerousSqlDialog requires explicit `open` prop**
- **Found during:** Task 1 (reading actual DangerousSqlDialog.tsx)
- **Issue:** Plan described props as `{ preview, onConfirm, onCancel }` (no `open`), but the actual component signature requires `{ preview, open, onConfirm, onCancel }`. Without `open`, the dialog would never show.
- **Fix:** Added `dangerDialogOpen` state and passed it as `open` prop; set/clear it alongside `dangerPreview`.
- **Files modified:** `client/src/components/ddl-import/DdlImportWorkspace.tsx`
- **Commit:** 3a33c39

**2. [Rule 1 - Bug] QueryExecutionResponse uses `batches[]` not `results[]`**
- **Found during:** Task 1 (reading actual shared/schema.ts)
- **Issue:** Plan used `result.error` and `result.elapsedMs` as top-level fields, but the actual response type is `{ batches: DbQueryBatchResult[] }` where each batch has its own `error` and `elapsedMs`.
- **Fix:** Adapted per-statement result handling to use `result.batches[0]?.error` and `result.batches[0]?.elapsedMs`.
- **Files modified:** `client/src/components/ddl-import/DdlImportWorkspace.tsx`
- **Commit:** 3a33c39

## Known Stubs

None — connections are loaded from the real `hostApi.connections.list()` call at runtime. The empty state correctly handles the case where no connections exist.

## Verification

- `npm run build` exits 0 (25.13s, 2490 modules transformed)
- All 11 acceptance criteria patterns verified present in the file

## Self-Check: PASSED

- File exists: `/c/Users/ISI202502/Downloads/Db-Schema-Ddl/client/src/components/ddl-import/DdlImportWorkspace.tsx` — FOUND
- Commit 3a33c39 — FOUND
