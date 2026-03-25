---
phase: 04-ddl-import-and-extension-management-v1_4
plan: 01
subsystem: ui
tags: [react, sidebar, extensions, rust, tauri, navigation]

# Dependency graph
requires:
  - phase: 01-usable-workbench-v1_4
    provides: ExtensionWorkspaceHost, ExtensionPanel, host-api.ts MainSurface type
provides:
  - Phase 4 navigation model: static built-in nav entries (DDL 导入, Schema Diff) + dynamic extension nav items
  - MainSurface union extended with { kind: "extensions" } variant
  - builtin_extensions manifest cleaned (only db-connector contributes navigation)
affects:
  - 04-02: Extension management page (consumes extensions surface placeholder)
  - 04-03: DDL import live execution (sidebar DDL 导入 entry already wired)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Phase 4 nav model: built-in features are static sidebar entries; only enabled external extensions contribute dynamic nav via resolveNavigation
    - extensions surface: placeholder rendered in Dashboard until Plan 02 implements management UI

key-files:
  created: []
  modified:
    - src-tauri/src/builtin_extensions/mod.rs
    - client/src/extensions/host-api.ts
    - client/src/components/Sidebar.tsx
    - client/src/pages/Dashboard.tsx

key-decisions:
  - "ddl-to-excel, excel-to-java-enum, schema-diff navigation set to vec![] — built-in features use static sidebar entries, not extension contributions"
  - "extensions surface placeholder added in Dashboard.tsx render switch — Plan 02 will replace with real ExtensionManagement component"
  - "DDL import button removed from header toolbar — entry point moved exclusively to sidebar"

patterns-established:
  - "Static nav pattern: built-in feature nav is hard-coded JSX in Sidebar; extension nav is dynamic via extNavItems.map"
  - "extensions surface routing: onNavigate?.({ kind: 'extensions' }) from 扩展功能 button"

requirements-completed: [EXTUI-01, EXTUI-05, IMP-01]

# Metrics
duration: 20min
completed: 2026-03-25
---

# Phase 04 Plan 01: Nav Foundation Summary

**Sidebar refactored to Phase 4 nav model: DDL 导入 and Schema Diff as static built-in entries, db-connector via extNavItems, and 扩展功能 routes to new extensions surface**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-03-25T05:10:00Z
- **Completed:** 2026-03-25T05:30:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Rust builtin_extensions cleaned: ddl-to-excel, excel-to-java-enum, schema-diff navigation set to `vec![]`
- MainSurface type extended with `{ kind: "extensions" }` for Plan 02 Extension Management page
- Sidebar now shows DDL 导入 and Schema Diff as static built-in nav entries in both collapsed and expanded layouts
- 扩展功能 button routes to extensions surface (placeholder for Plan 02) instead of opening ExtensionPanel dialog
- ExtensionPanel dialog state and component removed from Sidebar entirely
- DDL import button removed from Dashboard header (entry point moved to sidebar)

## Task Commits

1. **Task 1: Rust builtin_extensions cleanup + MainSurface type extension** - `caa13e0` (feat)
2. **Task 2: Sidebar refactor + Dashboard extensions surface** - `1676bf6` (feat)

## Files Created/Modified
- `src-tauri/src/builtin_extensions/mod.rs` - Cleared navigation vecs for ddl-to-excel, excel-to-java-enum, schema-diff; added Phase 4 comment
- `client/src/extensions/host-api.ts` - Added `{ kind: "extensions" }` variant to MainSurface union
- `client/src/components/Sidebar.tsx` - Added DDL 导入 and Schema Diff static entries; fixed 扩展功能 onClick; removed ExtensionPanel
- `client/src/pages/Dashboard.tsx` - Added extensions surface placeholder; removed header DDL import button

## Decisions Made
- ddl-to-excel, excel-to-java-enum, schema-diff navigation cleared from Rust manifests — these features are app-native, not user-installed extensions
- Extensions surface placeholder is a simple div with descriptive text; Plan 02 will replace it with ExtensionManagement component
- DDL import header button removed because sidebar is now the canonical entry point per Plan spec D-11

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused FileCode2 import from Dashboard.tsx**
- **Found during:** Task 2 (Dashboard header button removal)
- **Issue:** After removing the DDL import button from the header, FileCode2 was left as an unused import
- **Fix:** Removed FileCode2 from the lucide-react import line in Dashboard.tsx
- **Files modified:** client/src/pages/Dashboard.tsx
- **Verification:** npm run check exits 0
- **Committed in:** 1676bf6 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - unused import cleanup)
**Impact on plan:** Minor cleanup. No scope creep.

## Issues Encountered
None - plan executed cleanly. Type check and build both passed without issues.

## Next Phase Readiness
- Plan 02 (Extension Management page) can now use `activeSurface.kind === "extensions"` to render its UI
- DDL 导入 sidebar entry is wired and activates the DdlImportWorkspace
- Schema Diff sidebar entry activates the schema-diff extension workspace panel
- db-connector navigation still contributes via extNavItems (enabled extension path)

## Self-Check: PASSED

- src-tauri/src/builtin_extensions/mod.rs: FOUND
- client/src/extensions/host-api.ts: FOUND
- client/src/components/Sidebar.tsx: FOUND
- client/src/pages/Dashboard.tsx: FOUND
- Commit caa13e0: FOUND
- Commit 1676bf6: FOUND

---
*Phase: 04-ddl-import-and-extension-management-v1_4*
*Completed: 2026-03-25*
