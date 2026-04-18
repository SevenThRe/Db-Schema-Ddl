---
status: passed
phase: 43-define-extension-shell-and-contribution-model-for-activity-bar-sidebar-views-and-workbench-surfaces
verified_at: 2026-04-17
---

# Phase 43 Verification

## Scope

Verified that the extension platform now has one canonical shell contribution contract across shared schema, Rust manifests, and frontend host routing, while legacy manifests still normalize into a usable compatibility shape.

## Verification Commands

- `npm run check`
- `NODE_OPTIONS=--import=tsx node --test --experimental-strip-types test/client/extension-contribution-model-phase43.test.ts`
- `cargo check --manifest-path src-tauri/Cargo.toml -j 1`

All commands passed.

## Evidence

- [shared/extension-schema.ts](/E:/work/Db-Schema-Ddl/shared/extension-schema.ts) now defines `activityBar`, `sidebarViews`, and `workbenchViews` as canonical contribution fields with explicit default shell targets.
- [src-tauri/src/builtin_extensions/mod.rs](/E:/work/Db-Schema-Ddl/src-tauri/src/builtin_extensions/mod.rs), [src-tauri/src/extensions/manifest.rs](/E:/work/Db-Schema-Ddl/src-tauri/src/extensions/manifest.rs), and [src-tauri/src/extensions/commands.rs](/E:/work/Db-Schema-Ddl/src-tauri/src/extensions/commands.rs) now mirror and serialize the expanded contribution model without splitting builtin and external schemas.
- [client/src/extensions/contribution-resolver.ts](/E:/work/Db-Schema-Ddl/client/src/extensions/contribution-resolver.ts), [client/src/extensions/host-context.tsx](/E:/work/Db-Schema-Ddl/client/src/extensions/host-context.tsx), [client/src/extensions/host-api.ts](/E:/work/Db-Schema-Ddl/client/src/extensions/host-api.ts), and [client/src/extensions/ExtensionWorkspaceHost.tsx](/E:/work/Db-Schema-Ddl/client/src/extensions/ExtensionWorkspaceHost.tsx) now carry canonical activity/sidebar/workbench identities while keeping a `panelId` fallback.
- [test/client/extension-contribution-model-phase43.test.ts](/E:/work/Db-Schema-Ddl/test/client/extension-contribution-model-phase43.test.ts) guards the new contract and migration path against regression.

## Goal Assessment

Phase 43 satisfies the scoped plans:

- manifests express `activityBar`, `sidebarViews`, and `workbenchViews` explicitly
- Rust and TypeScript contribution contracts stay aligned
- frontend routing can identify activity, sidebar, and workbench targets separately before the visual shell host is rebuilt
