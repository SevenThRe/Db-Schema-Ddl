---
status: passed
phase: 45-support-installable-frontend-extension-bundles-and-runtime-ui-mounting
verified_at: 2026-04-18
---

# Phase 45 Verification

## Scope

Verified that external extensions can declare runtime UI bundles, that the backend exposes explicit bundle readiness, and that the shell can mount bundle-backed sidebar/workbench surfaces through a sandboxed iframe fallback without breaking builtin registry rendering.

## Verification Commands

- `npm run check`
- `cargo check --manifest-path src-tauri/Cargo.toml -j 1`
- `NODE_OPTIONS=--import=tsx node --test --experimental-strip-types test/client/extension-runtime-mount-phase45.test.ts`

All commands passed.

## Evidence

- [extension-schema.ts](/E:/work/Db-Schema-Ddl/shared/extension-schema.ts) now defines `uiBundle`, `runtimeViewId`, and `uiMount`.
- [manifest.rs](/E:/work/Db-Schema-Ddl/src-tauri/src/extensions/manifest.rs), [lifecycle.rs](/E:/work/Db-Schema-Ddl/src-tauri/src/extensions/lifecycle.rs), and [commands.rs](/E:/work/Db-Schema-Ddl/src-tauri/src/extensions/commands.rs) now validate declared UI bundle entries and expose explicit runtime bundle state from `ext_list_all`.
- [tauri.conf.json](/E:/work/Db-Schema-Ddl/src-tauri/tauri.conf.json) and [Cargo.toml](/E:/work/Db-Schema-Ddl/src-tauri/Cargo.toml) now enable Tauri asset-protocol loading for installed extension bundle assets.
- [ExtensionRuntimeFrame.tsx](/E:/work/Db-Schema-Ddl/client/src/extensions/ExtensionRuntimeFrame.tsx), [ExtensionWorkspaceHost.tsx](/E:/work/Db-Schema-Ddl/client/src/extensions/ExtensionWorkspaceHost.tsx), and [ExtensionSecondarySidebar.tsx](/E:/work/Db-Schema-Ddl/client/src/extensions/shell/ExtensionSecondarySidebar.tsx) now provide the runtime iframe mount path and explicit non-ready bundle placeholders.
- [extension-runtime-mount-phase45.test.ts](/E:/work/Db-Schema-Ddl/test/client/extension-runtime-mount-phase45.test.ts) guards the new contract and shell fallback wiring.

## Goal Assessment

Phase 45 satisfies the scoped plans:

- external extensions can declare a frontend UI bundle entry that the host validates and surfaces explicitly
- the shell can mount extension-provided sidebar and workbench UI at runtime without recompiling the app
- missing, invalid, and incompatible bundle states are now visible instead of degenerating into blank panels
