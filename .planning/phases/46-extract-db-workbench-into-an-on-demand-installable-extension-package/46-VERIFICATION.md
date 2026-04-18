---
status: passed
phase: 46-extract-db-workbench-into-an-on-demand-installable-extension-package
verified_at: 2026-04-18
---

# Phase 46 Verification

## Scope

Verified that the host no longer preloads DB workbench UI, that `db-connector` can now exist as a UI-only installable extension package, and that the extracted runtime bundle can mount through the extension shell with a host message bridge.

## Verification Commands

- `npm run check`
- `npm run check:i18n`
- `cargo check --manifest-path src-tauri/Cargo.toml -j 1`
- `npm run build:extension:db-connector`
- `NODE_OPTIONS=--import=tsx node --test --experimental-strip-types test/client/extension-runtime-extraction-phase46.test.ts`

All commands passed.

## Evidence

- [extension-schema.ts](/E:/work/Db-Schema-Ddl/shared/extension-schema.ts), [manifest.rs](/E:/work/Db-Schema-Ddl/src-tauri/src/extensions/manifest.rs), [lifecycle.rs](/E:/work/Db-Schema-Ddl/src-tauri/src/extensions/lifecycle.rs), [registry.rs](/E:/work/Db-Schema-Ddl/src-tauri/src/extensions/registry.rs), and [process.rs](/E:/work/Db-Schema-Ddl/src-tauri/src/extensions/process.rs) now support UI-only external extensions without mandatory sidecar binaries.
- [host-context.tsx](/E:/work/Db-Schema-Ddl/client/src/extensions/host-context.tsx), [ExtensionRuntimeFrame.tsx](/E:/work/Db-Schema-Ddl/client/src/extensions/ExtensionRuntimeFrame.tsx), and the runtime bridge files under [client/src/extensions/runtime](/E:/work/Db-Schema-Ddl/client/src/extensions/runtime) now provide the capability-scoped iframe RPC and shell navigation path required for extracted extension UI.
- [register-all.tsx](/E:/work/Db-Schema-Ddl/client/src/extensions/builtin/register-all.tsx), [mod.rs](/E:/work/Db-Schema-Ddl/src-tauri/src/builtin_extensions/mod.rs), and [Dashboard.tsx](/E:/work/Db-Schema-Ddl/client/src/pages/Dashboard.tsx) no longer hardwire `db-connector` as a host-bundled default surface.
- [extension-packages/db-connector/manifest.json](/E:/work/Db-Schema-Ddl/extension-packages/db-connector/manifest.json) and [build-db-connector-extension.ts](/E:/work/Db-Schema-Ddl/script/build-db-connector-extension.ts) now produce a concrete installable package artifact at [dist/extensions/db-connector/package](/E:/work/Db-Schema-Ddl/dist/extensions/db-connector/package).
- [extension-runtime-extraction-phase46.test.ts](/E:/work/Db-Schema-Ddl/test/client/extension-runtime-extraction-phase46.test.ts) now guards the host cleanup, package scaffold, and runtime bridge assumptions for Phase 46.

## Goal Assessment

Phase 46 satisfies the scoped goals:

- the base app can ship Excel/DDL core without preloading DB workbench UI surfaces
- installing the `db-connector` package provides activity/sidebar/workbench shell contributions through the extension runtime path
- existing host DB APIs remain the trusted execution boundary during extraction, preserving operator-facing behavior while moving the UI out of the host bundle
