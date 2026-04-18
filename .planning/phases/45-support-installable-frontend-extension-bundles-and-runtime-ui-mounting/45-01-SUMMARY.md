---
phase: 45-support-installable-frontend-extension-bundles-and-runtime-ui-mounting
plan: 01
subsystem: extension-runtime-contract
tags: [extensions, manifest, tauri, runtime-ui, schema]
requires:
  - phase: 44
    provides: Host-managed extension shell chrome and explicit activity/sidebar/workbench routing
provides:
  - Shared manifest contract for external UI bundles and runtime view ids
  - Install-time validation for declared UI bundle entry files
  - Explicit runtime bundle state on `ext_list_all`
affects: [phase-45-runtime-loader, phase-46-db-workbench-extraction, external-extension-contract]
tech-stack:
  added: []
  patterns: [manifest parity, runtime bundle state, install-time asset validation]
key-files:
  created: []
  modified:
    - shared/extension-schema.ts
    - src-tauri/src/builtin_extensions/mod.rs
    - src-tauri/src/extensions/manifest.rs
    - src-tauri/src/extensions/lifecycle.rs
    - src-tauri/src/extensions/commands.rs
key-decisions:
  - "External UI bundles are declared explicitly as `uiBundle` instead of being inferred from host-local component registries."
  - "Contributed sidebar and workbench surfaces use `runtimeViewId` to point into a shipped bundle without pretending to be builtin React component keys."
patterns-established:
  - "Backend install/list flows now surface explicit runtime bundle readiness instead of forcing the frontend to guess from missing components."
requirements-completed: []
duration: 12min
completed: 2026-04-18T17:20:27+08:00
---

# Phase 45 Plan 01 Summary

Phase 45 now has a real contract for installable frontend UI bundles instead of assuming every extension surface must resolve through a host-local registry key.

## Accomplishments

- Extended [extension-schema.ts](/E:/work/Db-Schema-Ddl/shared/extension-schema.ts) with `uiBundle`, `runtimeViewId`, and `uiMount` so manifests and resolved extension state can express runtime-mounted UI safely.
- Mirrored the new fields in [mod.rs](/E:/work/Db-Schema-Ddl/src-tauri/src/builtin_extensions/mod.rs) and [manifest.rs](/E:/work/Db-Schema-Ddl/src-tauri/src/extensions/manifest.rs), keeping builtin and external manifest parsing aligned.
- Updated [lifecycle.rs](/E:/work/Db-Schema-Ddl/src-tauri/src/extensions/lifecycle.rs) so install-time validation now rejects declared UI bundle entries that do not exist under the extracted extension root.
- Updated [commands.rs](/E:/work/Db-Schema-Ddl/src-tauri/src/extensions/commands.rs) so `ext_list_all` returns explicit `uiMount` state with `ready`, `missing`, `invalid`, or `incompatible` status.

## Verification

- npm run check: passed
- cargo check --manifest-path src-tauri/Cargo.toml -j 1: passed

## Self-Check: PASS
