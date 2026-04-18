---
phase: 46-extract-db-workbench-into-an-on-demand-installable-extension-package
plan: 03
subsystem: host-cleanup-and-package-build
tags: [extensions, packaging, vite, host-shell, regression]
requires:
  - phase: 46
    plan: 01
    provides: UI-only external install contract
  - phase: 46
    plan: 02
    provides: Runtime bridge and extracted db-connector entry
provides:
  - Host-shell removal of builtin db-connector assumptions
  - Dedicated db-connector extension build/package pipeline
  - Regression evidence and roadmap/state handoff
affects: [phase-46-runtime-extraction, phase-47-install-ux, phase-48-host-leakage-cleanup]
tech-stack:
  added: []
  patterns: [separate extension build mode, host cleanup, package scaffold regression guard]
key-files:
  created:
    - extension-packages/db-connector/manifest.json
    - script/build-db-connector-extension.ts
    - test/client/extension-runtime-extraction-phase46.test.ts
  modified:
    - client/src/extensions/builtin/register-all.tsx
    - src-tauri/src/builtin_extensions/mod.rs
    - client/src/pages/Dashboard.tsx
    - client/src/components/extension-management/ExtensionManagementPage.tsx
    - vite.config.ts
    - package.json
    - .planning/ROADMAP.md
    - .planning/STATE.md
key-decisions:
  - "The main host build no longer carries DB workbench UI registration; db-connector now belongs to the installable package path only."
  - "The repository now emits a concrete db-connector package artifact through a dedicated Vite mode and assembly script."
patterns-established:
  - "Phase-level regression coverage now guards both host cleanup and extension-package scaffold assumptions together."
requirements-completed: []
duration: 19min
completed: 2026-04-18T17:53:02+08:00
---

# Phase 46 Plan 03 Summary

Phase 46 finishes the extraction by removing the host-bundled DB workbench assumptions and replacing them with a separate package build path plus regression evidence.

## Accomplishments

- Removed host-local DB workbench registration from [register-all.tsx](/E:/work/Db-Schema-Ddl/client/src/extensions/builtin/register-all.tsx) and stopped exporting builtin `db-connector` manifests from [mod.rs](/E:/work/Db-Schema-Ddl/src-tauri/src/builtin_extensions/mod.rs).
- Cleaned [Dashboard.tsx](/E:/work/Db-Schema-Ddl/client/src/pages/Dashboard.tsx) and [ExtensionManagementPage.tsx](/E:/work/Db-Schema-Ddl/client/src/components/extension-management/ExtensionManagementPage.tsx) so the shell only surfaces DB workbench routes when an external `db-connector` install is actually present.
- Added a dedicated extension build path in [vite.config.ts](/E:/work/Db-Schema-Ddl/vite.config.ts), [package.json](/E:/work/Db-Schema-Ddl/package.json), [extension-packages/db-connector/manifest.json](/E:/work/Db-Schema-Ddl/extension-packages/db-connector/manifest.json), and [build-db-connector-extension.ts](/E:/work/Db-Schema-Ddl/script/build-db-connector-extension.ts).
- Added static regression coverage in [extension-runtime-extraction-phase46.test.ts](/E:/work/Db-Schema-Ddl/test/client/extension-runtime-extraction-phase46.test.ts) and advanced [ROADMAP.md](/E:/work/Db-Schema-Ddl/.planning/ROADMAP.md) plus [STATE.md](/E:/work/Db-Schema-Ddl/.planning/STATE.md) toward Phase 47.

## Verification

- npm run check: passed
- cargo check --manifest-path src-tauri/Cargo.toml -j 1: passed
- npm run build:extension:db-connector: passed
- NODE_OPTIONS=--import=tsx node --test --experimental-strip-types test/client/extension-runtime-extraction-phase46.test.ts: passed

## Self-Check: PASS
