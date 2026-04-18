---
phase: 43-define-extension-shell-and-contribution-model-for-activity-bar-sidebar-views-and-workbench-surfaces
plan: 01
subsystem: extension-platform-contracts
tags: [extensions, manifest, schema, zod, tauri]
requires: []
provides:
  - Canonical activity bar, sidebar view, and workbench view contribution fields
  - Explicit default shell targets for future host routing
  - Rust and TypeScript manifest parity for builtin and external extensions
affects: [phase-44-shell-host, phase-45-runtime-ui-mounting, extension-manifests]
tech-stack:
  added: []
  patterns: [canonical extension shell contract, legacy contribution compatibility, explicit shell defaults]
key-files:
  created: []
  modified:
    - shared/extension-schema.ts
    - src-tauri/src/builtin_extensions/mod.rs
    - src-tauri/src/extensions/manifest.rs
    - src-tauri/src/extensions/commands.rs
key-decisions:
  - "Made activityBar/sidebarViews/workbenchViews the canonical contract while keeping navigation/workspacePanels parseable during migration."
  - "Added defaultSidebarViewId and defaultWorkbenchViewId on activity items so Phase 44 can avoid array-order inference."
patterns-established:
  - "Extension shell manifests define shell identity separately from view mounting."
  - "Builtin and external manifests share one contribution schema across TypeScript and Rust."
requirements-completed: []
duration: 8min
completed: 2026-04-17T10:47:13+08:00
---

# Phase 43 Plan 01 Summary

Canonical extension-shell manifest fields now exist across the shared TypeScript schema and Rust manifest layers.

## Accomplishments

- Added `activityBarItemSchema`, `sidebarViewSchema`, and `workbenchViewSchema` to [shared/extension-schema.ts](/E:/work/Db-Schema-Ddl/shared/extension-schema.ts).
- Extended `extensionContributesSchema` with canonical `activityBar`, `sidebarViews`, and `workbenchViews` fields while preserving legacy `navigation` and `workspacePanels` parsing.
- Mirrored the new shell contract in [src-tauri/src/builtin_extensions/mod.rs](/E:/work/Db-Schema-Ddl/src-tauri/src/builtin_extensions/mod.rs) with `ActivityBarItem`, `SidebarView`, and `WorkbenchView`.
- Kept external manifest parsing and serialized extension state on one shared contribution shape via [src-tauri/src/extensions/manifest.rs](/E:/work/Db-Schema-Ddl/src-tauri/src/extensions/manifest.rs) and [src-tauri/src/extensions/commands.rs](/E:/work/Db-Schema-Ddl/src-tauri/src/extensions/commands.rs).

## Verification

- `npm run check`: passed
- `cargo check --manifest-path src-tauri/Cargo.toml -j 1`: passed

## Notes

- `cargo check` still reports pre-existing warnings in unrelated DB connector/storage code; no new Phase 43 manifest blocker was introduced.
- No atomic commit was created because the workspace already contained unrelated in-flight changes.

## Self-Check: PASS
