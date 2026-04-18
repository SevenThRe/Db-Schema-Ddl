---
phase: 45-support-installable-frontend-extension-bundles-and-runtime-ui-mounting
plan: 02
subsystem: extension-runtime-loader
tags: [extensions, runtime-ui, iframe, tauri, shell]
requires:
  - phase: 45-01
    provides: Runtime bundle manifest contract and explicit `uiMount` state
provides:
  - Tauri asset-protocol wiring for installed extension bundle assets
  - Shared runtime iframe surface for external sidebar/workbench mounts
  - Shell fallback path from builtin registries to runtime bundle rendering
affects: [phase-46-db-workbench-extraction, extension-shell, external-ui-loader]
tech-stack:
  added: []
  patterns: [asset-protocol mount path, sandboxed iframe surface, builtin-first runtime fallback]
key-files:
  created:
    - client/src/extensions/ExtensionRuntimeFrame.tsx
  modified:
    - src-tauri/tauri.conf.json
    - src-tauri/Cargo.toml
    - client/src/extensions/contribution-resolver.ts
    - client/src/extensions/ExtensionWorkspaceHost.tsx
    - client/src/extensions/shell/ExtensionSecondarySidebar.tsx
key-decisions:
  - "External UI bundles load through Tauri asset protocol plus `convertFileSrc`, not same-context dynamic imports into the host React app."
  - "Builtin registry components keep priority; runtime iframe mounting is an explicit fallback for contributed surfaces with `runtimeViewId`."
patterns-established:
  - "Runtime UI loads through one reusable frame component instead of duplicating iframe/error logic across the shell."
requirements-completed: []
duration: 14min
completed: 2026-04-18T17:20:27+08:00
---

# Phase 45 Plan 02 Summary

The host shell can now mount external extension sidebar and workbench UI at runtime without recompiling the app.

## Accomplishments

- Added [ExtensionRuntimeFrame.tsx](/E:/work/Db-Schema-Ddl/client/src/extensions/ExtensionRuntimeFrame.tsx) to convert validated bundle paths into asset URLs and render sandboxed iframe surfaces with explicit placeholder states.
- Enabled `assetProtocol` in [tauri.conf.json](/E:/work/Db-Schema-Ddl/src-tauri/tauri.conf.json) and added `protocol-asset` to [Cargo.toml](/E:/work/Db-Schema-Ddl/src-tauri/Cargo.toml) so installed extension bundle assets can be loaded from the desktop shell.
- Updated [contribution-resolver.ts](/E:/work/Db-Schema-Ddl/client/src/extensions/contribution-resolver.ts) so resolved sidebar/workbench views carry `runtimeViewId` explicitly.
- Updated [ExtensionWorkspaceHost.tsx](/E:/work/Db-Schema-Ddl/client/src/extensions/ExtensionWorkspaceHost.tsx) and [ExtensionSecondarySidebar.tsx](/E:/work/Db-Schema-Ddl/client/src/extensions/shell/ExtensionSecondarySidebar.tsx) so builtin registry components still render first, but runtime iframe mounting takes over when an external surface is bundle-backed instead of host-local.

## Verification

- npm run check: passed
- cargo check --manifest-path src-tauri/Cargo.toml -j 1: passed

## Self-Check: PASS
