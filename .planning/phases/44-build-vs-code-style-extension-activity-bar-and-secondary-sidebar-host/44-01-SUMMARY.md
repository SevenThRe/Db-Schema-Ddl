---
phase: 44-build-vs-code-style-extension-activity-bar-and-secondary-sidebar-host
plan: 01
subsystem: extension-shell-host
tags: [extensions, shell, dashboard, sidebar, react]
requires:
  - phase: 43
    provides: Canonical activity/sidebar/workbench contribution model
provides:
  - Host activity bar and secondary sidebar shell chrome for extension surfaces
  - Dashboard route normalization for activity and sidebar persistence
  - Core file sidebar cleanup so extension navigation no longer leaks through footer buttons
affects: [phase-45-runtime-ui-mounting, phase-46-db-workbench-extraction, shell-routing]
tech-stack:
  added: []
  patterns: [extension shell chrome, persisted activity selection, persisted sidebar selection]
key-files:
  created:
    - client/src/extensions/shell/ExtensionActivityBar.tsx
    - client/src/extensions/shell/ExtensionSecondarySidebar.tsx
  modified:
    - client/src/pages/Dashboard.tsx
    - client/src/components/Sidebar.tsx
    - client/src/extensions/ExtensionWorkspaceHost.tsx
    - client/src/extensions/panel-registry.ts
key-decisions:
  - "Core Excel/DDL navigation stays in Sidebar while extension surfaces render through a separate host shell."
  - "Dashboard persists the last selected extension activity and sidebar view to reopen the shell truthfully."
patterns-established:
  - "Extension shell routing is activity-first instead of panel-first."
  - "Host shell chrome is separate from core file-management chrome."
requirements-completed: []
duration: 11min
completed: 2026-04-17T11:01:16+08:00
---

# Phase 44 Plan 01 Summary

The app shell now renders extension surfaces through a dedicated activity bar and contextual secondary sidebar instead of footer shortcut buttons.

## Accomplishments

- Added [ExtensionActivityBar.tsx](/E:/work/Db-Schema-Ddl/client/src/extensions/shell/ExtensionActivityBar.tsx) and [ExtensionSecondarySidebar.tsx](/E:/work/Db-Schema-Ddl/client/src/extensions/shell/ExtensionSecondarySidebar.tsx) as host-owned shell chrome.
- Refactored [Dashboard.tsx](/E:/work/Db-Schema-Ddl/client/src/pages/Dashboard.tsx) so extension routing carries persisted `dashboard:lastExtensionActivity` and `dashboard:lastSidebarViewByExtension` state.
- Updated [ExtensionWorkspaceHost.tsx](/E:/work/Db-Schema-Ddl/client/src/extensions/ExtensionWorkspaceHost.tsx) and [panel-registry.ts](/E:/work/Db-Schema-Ddl/client/src/extensions/panel-registry.ts) so extension panels receive activity/sidebar/workbench route identity.
- Removed footer extension launch buttons from [Sidebar.tsx](/E:/work/Db-Schema-Ddl/client/src/components/Sidebar.tsx), returning the core sidebar to Excel/DDL/doc/settings concerns.

## Verification

- npm run check: passed
- cargo check --manifest-path src-tauri/Cargo.toml -j 1: passed

## Self-Check: PASS
