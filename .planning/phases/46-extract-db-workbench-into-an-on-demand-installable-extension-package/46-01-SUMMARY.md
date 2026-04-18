---
phase: 46-extract-db-workbench-into-an-on-demand-installable-extension-package
plan: 01
subsystem: extension-install-contract
tags: [extensions, manifest, registry, ui-only, marketplace]
requires:
  - phase: 45
    provides: Runtime iframe mount path and explicit uiBundle contract
provides:
  - UI-only external extension manifest support
  - Nullable sidecar metadata through install/registry/process flows
  - Official marketplace exposure for installable db-connector
affects: [phase-46-runtime-extraction, phase-47-install-ux]
tech-stack:
  added: []
  patterns: [ui-only extension contract, nullable sidecar entry, truthful install controls]
key-files:
  created: []
  modified:
    - shared/extension-schema.ts
    - src-tauri/src/extensions/manifest.rs
    - src-tauri/src/extensions/lifecycle.rs
    - src-tauri/src/extensions/registry.rs
    - src-tauri/src/extensions/process.rs
    - client/src/hooks/use-extensions.ts
    - client/src/components/ExtensionPanel.tsx
key-decisions:
  - "External packages may omit `entry` when `uiBundle` exists, which lets db-connector ship as a UI-only extension first."
  - "Installed extension metadata now carries nullable sidecar state so the host stops pretending every package can be started."
patterns-established:
  - "Install/uninstall now invalidates both extension-management and shell-resolution queries so installed external surfaces appear immediately."
requirements-completed: []
duration: 18min
completed: 2026-04-18T17:53:02+08:00
---

# Phase 46 Plan 01 Summary

Phase 46 now supports the first real UI-only external package instead of forcing every installable extension to pretend it ships a sidecar binary.

## Accomplishments

- Extended [extension-schema.ts](/E:/work/Db-Schema-Ddl/shared/extension-schema.ts) so external manifests can omit `entry` when `uiBundle` exists, while also aligning the capability enum with the DB workbench runtime surface.
- Updated [manifest.rs](/E:/work/Db-Schema-Ddl/src-tauri/src/extensions/manifest.rs), [lifecycle.rs](/E:/work/Db-Schema-Ddl/src-tauri/src/extensions/lifecycle.rs), [registry.rs](/E:/work/Db-Schema-Ddl/src-tauri/src/extensions/registry.rs), and [process.rs](/E:/work/Db-Schema-Ddl/src-tauri/src/extensions/process.rs) so UI-only packages install cleanly and sidecar start attempts fail explicitly.
- Updated [use-extensions.ts](/E:/work/Db-Schema-Ddl/client/src/hooks/use-extensions.ts) and [ExtensionPanel.tsx](/E:/work/Db-Schema-Ddl/client/src/components/ExtensionPanel.tsx) so `db-connector` shows up as an official installable extension and no longer renders fake start/stop controls when no sidecar exists.

## Verification

- npm run check: passed
- npm run check:i18n: passed
- cargo check --manifest-path src-tauri/Cargo.toml -j 1: passed

## Self-Check: PASS
