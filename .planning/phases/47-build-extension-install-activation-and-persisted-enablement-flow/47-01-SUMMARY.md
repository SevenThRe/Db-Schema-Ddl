---
phase: 47-build-extension-install-activation-and-persisted-enablement-flow
plan: 01
subsystem: lifecycle-truth-and-enablement-state
tags: [extensions, lifecycle, persistence, tauri]
completed: 2026-04-18T19:10:00+08:00
---

# Phase 47 Plan 01 Summary

Phase 47 starts by fixing lifecycle truth under the extension platform so install and uninstall no longer strand stale enablement state.

## Accomplishments

- Added a shared enablement-state helper in [commands.rs](/E:/work/Db-Schema-Ddl/src-tauri/src/extensions/commands.rs) so install, uninstall, and explicit enable/disable now mutate the same persisted disabled-extension list.
- Updated `ext_install` to clear prior disabled residue and return newly installed extensions as enabled by default.
- Updated `ext_uninstall` to scrub persisted disabled markers after removal so reinstall does not silently come back hidden.
- Extended [use-extensions.ts](/E:/work/Db-Schema-Ddl/client/src/hooks/use-extensions.ts) with a canonical `setEnabled()` mutation and consistent invalidation of both installed-list and resolved-shell queries.

## Verification

- `npm run check`
- `cargo check --manifest-path src-tauri/Cargo.toml -j 1`

## Self-Check

PASS
