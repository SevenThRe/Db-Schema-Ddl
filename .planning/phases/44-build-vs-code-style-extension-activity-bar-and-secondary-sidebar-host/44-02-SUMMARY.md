---
phase: 44-build-vs-code-style-extension-activity-bar-and-secondary-sidebar-host
plan: 02
subsystem: db-connector-shell-adoption
tags: [db-workbench, extensions, sidebar, registry, tauri]
requires:
  - phase: 44-01
    provides: Host shell chrome and extension route persistence
provides:
  - Explicit DB connector activity, sidebar, and workbench contribution ids
  - Sidebar view registry and first DB connector secondary sidebar tabs
  - Host-managed DB workbench mode that suppresses duplicate internal sidebar chrome
affects: [phase-45-runtime-ui-mounting, db-workbench-shell, extension-registry]
tech-stack:
  added: []
  patterns: [sidebar-view registry, host-managed sidebar mode, extension-to-shell event bridge]
key-files:
  created:
    - client/src/extensions/sidebar-view-registry.ts
    - client/src/components/extensions/db-workbench/sidebar/DbConnectionsSidebarView.tsx
    - client/src/components/extensions/db-workbench/sidebar/DbExplorerSidebarView.tsx
    - client/src/components/extensions/db-workbench/sidebar/db-connector-sidebar-events.ts
  modified:
    - src-tauri/src/builtin_extensions/mod.rs
    - client/src/extensions/builtin/register-all.tsx
    - client/src/components/extensions/DbConnectorWorkspace.tsx
    - client/src/components/extensions/db-workbench/WorkbenchLayout.tsx
key-decisions:
  - "db-connector adopts explicit shell ids instead of relying on legacy navigation/workspace panel inference."
  - "WorkbenchLayout can run in `sidebarMode=\"host\"` so the new shell does not render a second left sidebar."
patterns-established:
  - "Sidebar views mount through an explicit registry parallel to the panel registry."
  - "DB shell sidebar state uses a small event bridge instead of a broad new shared runtime."
requirements-completed: []
duration: 12min
completed: 2026-04-17T11:01:16+08:00
---

# Phase 44 Plan 02 Summary

The `db-connector` extension is now the first adopter of the host-managed extension shell.

## Accomplishments

- Added canonical DB connector shell ids and defaults in [src-tauri/src/builtin_extensions/mod.rs](/E:/work/Db-Schema-Ddl/src-tauri/src/builtin_extensions/mod.rs): `db-connector-activity`, `db-connector-sidebar-connections`, `db-connector-sidebar-explorer`, and `db-connector-workbench`.
- Added [sidebar-view-registry.ts](/E:/work/Db-Schema-Ddl/client/src/extensions/sidebar-view-registry.ts) and registered DB connector sidebar views from [register-all.tsx](/E:/work/Db-Schema-Ddl/client/src/extensions/builtin/register-all.tsx).
- Created [DbConnectionsSidebarView.tsx](/E:/work/Db-Schema-Ddl/client/src/components/extensions/db-workbench/sidebar/DbConnectionsSidebarView.tsx) and [DbExplorerSidebarView.tsx](/E:/work/Db-Schema-Ddl/client/src/components/extensions/db-workbench/sidebar/DbExplorerSidebarView.tsx) as the first host-mounted secondary sidebar tabs.
- Updated [DbConnectorWorkspace.tsx](/E:/work/Db-Schema-Ddl/client/src/components/extensions/DbConnectorWorkspace.tsx) and [WorkbenchLayout.tsx](/E:/work/Db-Schema-Ddl/client/src/components/extensions/db-workbench/WorkbenchLayout.tsx) so the workbench can run with `sidebarMode="host"` and avoid duplicate left chrome.

## Verification

- npm run check: passed
- cargo check --manifest-path src-tauri/Cargo.toml -j 1: passed

## Notes

- Verification also required a minimal syntax repair in [sql-autocomplete.ts](/E:/work/Db-Schema-Ddl/client/src/components/extensions/db-workbench/sql-autocomplete.ts) because the worktree already contained a broken regex literal that prevented TypeScript from parsing the file.

## Self-Check: PASS
