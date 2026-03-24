---
phase: 01-usable-workbench-v1_4
plan: "03"
subsystem: frontend-editor
tags:
  - monaco
  - sql-editor
  - query-tabs
  - localStorage
  - keyboard-shortcuts
  - connection-sidebar
dependency_graph:
  requires:
    - 01-01 (shared/schema.ts Phase 1 types: DbConnectionConfig, ExplainRequest)
    - 01-02 (IPC bridge: executeQuery, explainQuery, cancelQuery; WorkbenchLayout shell)
  provides:
    - ConnectionSidebar with env color dot, readonly lock, driver badge, switch dropdown
    - QueryTabs with versioned localStorage persistence and corruption recovery
    - SqlEditorPane with Monaco Editor + 4 keyboard shortcuts + sql-formatter integration
    - WorkbenchLayout wired with all components and full state management
  affects:
    - client/src/components/extensions/db-workbench/WorkbenchLayout.tsx (fully wired)
    - 01-04 result grid (depends on this layout shell and SQL execution flow)
tech_stack:
  added: []
  patterns:
    - "Backend-delegated statement targeting: frontend sends fullSql + cursorOffset, backend resolves target statement"
    - "EXPLAIN auto-detection: strip leading comments/whitespace before EXPLAIN keyword check"
    - "Versioned localStorage with migration: QUERY_TABS_STORAGE_VERSION = v1"
    - "Monaco addAction() scope: keybindings limited to editor widget, no browser/Tauri conflict"
    - "executeEdits() for SQL formatting to preserve undo stack"
key_files:
  created:
    - client/src/components/extensions/db-workbench/ConnectionSidebar.tsx
    - client/src/components/extensions/db-workbench/QueryTabs.tsx
    - client/src/components/extensions/db-workbench/SqlEditorPane.tsx
  modified:
    - client/src/components/extensions/db-workbench/WorkbenchLayout.tsx
decisions:
  - "ExplainRequest does not have requestId field — removed from explainQuery call, matches shared/schema.ts interface"
  - "EXPLAIN auto-detection uses iterative LEADING_JUNK_PATTERN strip loop to handle nested comment/whitespace combinations"
  - "KeyMod.CtrlCmd used (not KeyMod.Ctrl) for Ctrl/Cmd cross-platform support"
  - "Connection switch in sidebar delegates to onSwitchToLegacy (connection form flow) rather than direct connection swap"
metrics:
  duration: "6 min"
  completed_date: "2026-03-24"
  tasks_completed: 2
  files_modified: 1
  files_created: 3
---

# Phase 01 Plan 03: SQL Editor + QueryTabs + ConnectionSidebar Summary

**One-liner:** Monaco SQL editor with 4 keyboard shortcuts (Ctrl+Enter/Shift+Ctrl+Enter/Alt+Shift+F/Ctrl+W), versioned localStorage tab persistence, connection sidebar with env indicators, and backend-delegated statement targeting (cursor offset, no frontend splitting).

## What Was Built

### Task 1: ConnectionSidebar + QueryTabs

**ConnectionSidebar.tsx** — Left sidebar showing active connection info with:
- 8px env color dot using CSS variables `--env-prod` / `--env-test` / `--env-dev`
- Connection name (truncated, text-xs font-semibold)
- Lock icon for `connection.readonly` connections
- Environment label text (uppercase, same color as dot, text-[10px])
- Database name (text-xs text-muted-foreground)
- Driver badge ("MySQL" / "PostgreSQL", text-[10px])
- Switch connection dropdown with ScrollArea showing all connections

**QueryTabs.tsx** — Multi-tab bar with:
- `QUERY_TABS_STORAGE_VERSION = "v1"` constant
- `QUERY_TABS_STORAGE_KEY = "db-workbench:query-tabs:v1"` versioned key
- `loadTabs()` — reads from versioned key, falls back to legacy key migration, resets on corruption
- `saveTabs()` — writes to localStorage with silent error handling
- `defaultTab()` — creates tab with `crypto.randomUUID()` id
- Inline rename via double-click (Input component, text-xs)
- Close button (X icon, size 12) on hover — disabled when only 1 tab
- "+" button for new tabs with auto-incrementing label
- Active tab underline: `border-b-2 border-primary` per UI-SPEC
- Tab bar height: 36px per UI-SPEC

### Task 2: SqlEditorPane + WorkbenchLayout wiring

**SqlEditorPane.tsx** — Monaco Editor integration:
- `Editor` from `@monaco-editor/react` with `language="sql"`
- Font: `JetBrains Mono` at 13px per UI-SPEC
- 4 keyboard actions via `addAction()`:
  - `db-execute-selection` — `KeyMod.CtrlCmd | KeyCode.Enter`
  - `db-execute-script` — `KeyMod.Shift | KeyMod.CtrlCmd | KeyCode.Enter`
  - `db-format-sql` — `KeyMod.Alt | KeyMod.Shift | KeyCode.KeyF`
  - `db-close-tab` — `KeyMod.CtrlCmd | KeyCode.KeyW`
- Backend-delegated statement targeting: selection → send selection; no selection → send fullSql + cursorOffset
- EXPLAIN auto-detection: iterative strip of leading whitespace / single-line comments (`--`) / block comments (`/* */`) before checking for `^explain\b`
- sql-formatter: `format()` with `keywordCase: "upper"`, dialect-aware (mysql/postgresql)
- `executeEdits()` for format to preserve undo stack
- Toolbar: Run (Play icon) / Explain (Lightbulb) / Format SQL (AlignLeft) / Stop (Square, only during execution) with Tooltip labels

**WorkbenchLayout.tsx** — Fully wired layout:
- `tabs` state initialized from `loadTabs()`
- `activeTabId` state
- `isExecuting` + `currentRequestId` state
- `ConnectionSidebar`, `QueryTabs`, `SqlEditorPane` all wired
- SQL changes → `saveTabs()` on every keystroke
- Tab add/close/rename → `saveTabs()`
- `executeQuery` / `explainQuery` / `cancelQuery` via `hostApi.connections`
- `crypto.randomUUID()` for each new requestId
- Results area kept as placeholder (Plan 04 implements ResultGridPane)

## Task Commits

1. **Task 1: ConnectionSidebar + QueryTabs** - `0905be4` (feat)
2. **Task 2: SqlEditorPane + WorkbenchLayout** - `18fc55e` (feat)

## Files Created/Modified

- `client/src/components/extensions/db-workbench/ConnectionSidebar.tsx` — New
- `client/src/components/extensions/db-workbench/QueryTabs.tsx` — New
- `client/src/components/extensions/db-workbench/SqlEditorPane.tsx` — New
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx` — Updated (full wiring)

## Decisions Made

- `ExplainRequest` has no `requestId` field (schema verified) — `requestId` removed from `explainQuery()` call
- Connection switch in sidebar delegates to `onSwitchToLegacy()` — connection management stays in legacy view
- `KeyMod.CtrlCmd` (not `KeyMod.Ctrl`) for cross-platform Ctrl/Cmd compatibility
- EXPLAIN detection uses iterative strip loop (not one-pass regex) to handle deeply nested comments

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed non-existent `requestId` from ExplainRequest**
- **Found during:** Task 2 TypeScript check
- **Issue:** `ExplainRequest` in `shared/schema.ts` only has `connectionId` and `sql` — no `requestId` field. The plan template used `requestId` but it does not match the actual type.
- **Fix:** Removed `requestId` from `explainQuery()` call in WorkbenchLayout.tsx
- **Files modified:** `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
- **Commit:** 18fc55e

**2. [Rule 1 - Bug] Fixed monaco-editor type import causing circular reference error**
- **Found during:** Task 2 TypeScript check (error TS7022)
- **Issue:** Importing `KeyCode` and `KeyMod` as named type imports from `monaco-editor` caused a circular type annotation error. The Monaco instance from `onMount` callback is already typed and contains these references.
- **Fix:** Removed named type imports `KeyCode, KeyMod as KeyModType`; use `monacoInstance.KeyMod` and `monacoInstance.KeyCode` directly from the callback parameter.
- **Files modified:** `client/src/components/extensions/db-workbench/SqlEditorPane.tsx`
- **Commit:** 18fc55e

---

**Total deviations:** 2 auto-fixed (Rule 1 - bugs)
**Impact on plan:** Type fixes required to compile. No scope change.

## Verification Results

- `npx tsc --noEmit` → 1 pre-existing error in `ResultGridPane.tsx` (unrelated to this plan, other agent's file); 0 errors in new/modified files
- `node --test extension-boundaries.test.ts` → 16/16 pass (regression clean)
- `node --test sql-formatter.test.ts` → 4/4 pass (regression clean)

## Known Stubs

- `WorkbenchLayout.tsx` results area: "Run a query to see results" placeholder — `ResultGridPane` to be wired in Plan 04
- `handleExecuteSelection` / `handleExecuteScript` / `handleExplain` catch blocks: errors silently ignored — Plan 04 will display errors in results area

These stubs are intentional scaffolding; this plan's goal (Monaco editor with shortcuts + tab management) is fully achieved.

## Self-Check: PASSED

Files exist:
- FOUND: client/src/components/extensions/db-workbench/ConnectionSidebar.tsx
- FOUND: client/src/components/extensions/db-workbench/QueryTabs.tsx
- FOUND: client/src/components/extensions/db-workbench/SqlEditorPane.tsx
- FOUND: client/src/components/extensions/db-workbench/WorkbenchLayout.tsx (updated)

Commits exist:
- 0905be4 — Task 1: ConnectionSidebar + QueryTabs
- 18fc55e — Task 2: SqlEditorPane + WorkbenchLayout

---

*Phase: 01-usable-workbench-v1_4*
*Completed: 2026-03-24*
