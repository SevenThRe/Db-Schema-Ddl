# Phase 46: Extract DB Workbench Into An On-Demand Installable Extension Package - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 46 moves `db-connector` from a host-bundled builtin workbench into a real installable extension package that can be absent from the base app.

This phase delivers:
- a UI-only external extension path so `db-connector` can install without a required sidecar binary
- a runtime message bridge so iframe-mounted extension UI can use capability-scoped host APIs and shell navigation
- a separate DB workbench frontend bundle and installable package scaffold
- host-shell cleanup so the base app no longer hardcodes `db-connector` as an always-present surface

Out of scope in this phase:
- polished install/update/enable UX beyond the minimum needed to install and surface `db-connector` (Phase 47)
- retiring all remaining DB-specific host leakage outside the main `db-connector` extraction path (Phase 48)
- adding new DB workbench features unrelated to extraction

</domain>

<decisions>
## Implementation Decisions

### Package Identity And Surface Contract
- The installable DB workbench package keeps the canonical extension id `db-connector`; Phase 46 does not revive `db-management` as a product identifier.
- The external package contributes the same shell surfaces already normalized in Phases 43-45: one activity item, two sidebar views, and one main workbench view.
- The package may keep legacy `navigation` and `workspacePanels` only as compatibility fallback metadata, but the host should route through `activityBar`, `sidebarViews`, and `workbenchViews`.

### UI-Only Extension Runtime
- External manifests must allow `entry` to be absent when `uiBundle` is present, because the first extracted DB workbench package reuses host DB APIs instead of shipping its own sidecar process.
- Install, registry, and list flows must preserve whether an installed extension actually has a spawnable sidecar so the UI does not offer meaningless start/stop controls.
- `ext_start` and related process paths should fail explicitly for UI-only packages instead of pretending the package is broken.

### Host Bridge Boundary
- The iframe runtime path introduced in Phase 45 now gains a narrow RPC bridge for capability-scoped `HostApi` calls plus shell navigation actions.
- External runtime bundles still must not import `desktopBridge` directly; the host remains the only owner of DB command access and capability enforcement.
- The bridge should support the DB workbench's current needs first: connection CRUD, introspection, query/explain/export/edit/sync calls, notifications, and open-workbench/sidebar navigation.

### Packaging And Build Split
- The main host build must stop importing or registering `DbConnectorWorkspace` and DB sidebar components so the base app build is no longer the carrier of the DB workbench UI bundle.
- The extracted DB workbench frontend bundle builds through a dedicated Vite mode/output path with relative asset URLs suitable for installation under an extension directory.
- Phase 46 should leave behind a concrete package scaffold and repeatable build command so release packaging can publish `db-connector` as its own extension artifact.

### Host Shell Cleanup
- `Dashboard.tsx` must stop hardcoding fallback navigation to `db-connector` when no extension is installed.
- The extension marketplace should expose `db-connector` as an official installable extension instead of assuming the workbench already exists.
- The host should only render DB workbench shell chrome after `ext_list_all` resolves an installed and enabled `db-connector`.

### Claude's Discretion
- Lightweight host-context refactors are allowed if they make extracted runtime bundles reuse existing `DbConnectorWorkspace` and sidebar components without rewriting their business logic.
- Runtime bridge helpers may live under `client/src/extensions/runtime/` as long as protocol boundaries stay explicit and testable.
- Static regression tests are required because this phase changes install contracts, build outputs, and host-shell visibility at once.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning anchors
- `.planning/ROADMAP.md` - Phase 46 goal, dependency chain, and success criteria
- `.planning/STATE.md` - current focus and the runtime anchor after Phase 45
- `.planning/phases/43-define-extension-shell-and-contribution-model-for-activity-bar-sidebar-views-and-workbench-surfaces/43-CONTEXT.md`
- `.planning/phases/44-build-vs-code-style-extension-activity-bar-and-secondary-sidebar-host/44-CONTEXT.md`
- `.planning/phases/45-support-installable-frontend-extension-bundles-and-runtime-ui-mounting/45-CONTEXT.md`
- `AGENTS.md` - source-of-truth order, DB workbench boundaries, and shared-contract rules

### Current install/runtime contract
- `shared/extension-schema.ts`
- `src-tauri/src/extensions/manifest.rs`
- `src-tauri/src/extensions/lifecycle.rs`
- `src-tauri/src/extensions/registry.rs`
- `src-tauri/src/extensions/process.rs`
- `src-tauri/src/extensions/commands.rs`

### Current host shell / DB workbench surfaces
- `client/src/pages/Dashboard.tsx`
- `client/src/extensions/host-context.tsx`
- `client/src/extensions/ExtensionRuntimeFrame.tsx`
- `client/src/extensions/ExtensionWorkspaceHost.tsx`
- `client/src/extensions/shell/ExtensionSecondarySidebar.tsx`
- `client/src/extensions/builtin/register-all.tsx`
- `client/src/components/extensions/DbConnectorWorkspace.tsx`
- `client/src/components/extensions/db-workbench/sidebar/DbConnectionsSidebarView.tsx`
- `client/src/components/extensions/db-workbench/sidebar/DbExplorerSidebarView.tsx`

### Build and packaging anchors
- `vite.config.ts`
- `package.json`
- `docs/extension-boundary-spec.md`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `client/src/components/extensions/DbConnectorWorkspace.tsx`
  - already accepts `extensionId` and gets capability-scoped host access through `useHostApiFor`, which makes it reusable inside an extracted runtime bundle if host context is injectable.
- `client/src/components/extensions/db-workbench/sidebar/DbConnectionsSidebarView.tsx` and `DbExplorerSidebarView.tsx`
  - already behave like extension-owned secondary sidebar tabs and can be rendered by a runtime bundle once host APIs and navigation callbacks are bridged.
- `client/src/extensions/ExtensionRuntimeFrame.tsx`
  - already owns the iframe mount path and is the correct integration point for runtime RPC and navigation message handling.

### Current Gaps
- `shared/extension-schema.ts` and `src-tauri/src/extensions/manifest.rs`
  - still require a platform `entry` for external extensions, which blocks UI-only packages.
- `src-tauri/src/extensions/process.rs`
  - assumes every installed extension has a spawnable sidecar binary.
- `client/src/extensions/builtin/register-all.tsx`
  - still statically imports DB workbench components, which keeps the host build as the carrier for extracted UI.
- `client/src/pages/Dashboard.tsx`
  - still falls back to hardcoded `db-connector` shell ids during release smoke auto-open, even when no installed extension exists.
- `client/src/components/ExtensionPanel.tsx`
  - does not currently expose `db-connector` as an official installable extension and still assumes installed extensions can be started and stopped.

### Integration Points
- Host/runtime contract:
  - `client/src/extensions/host-context.tsx`
  - `client/src/extensions/host-api.ts`
  - `client/src/extensions/host-api-runtime.ts`
  - `client/src/extensions/ExtensionRuntimeFrame.tsx`
- External install/runtime metadata:
  - `shared/extension-schema.ts`
  - `src-tauri/src/extensions/manifest.rs`
  - `src-tauri/src/extensions/lifecycle.rs`
  - `src-tauri/src/extensions/registry.rs`
  - `src-tauri/src/extensions/process.rs`
  - `src-tauri/src/extensions/commands.rs`
- Package build path:
  - `vite.config.ts`
  - `package.json`

</code_context>

<specifics>
## Specific Ideas

- Add a runtime host bridge with request/response RPC for:
  - `connections.*`
  - `notifications.show`
  - minimal `statusBar.*`
  - `openWorkbenchView` / `selectSidebarView`
- Build the extracted UI into `dist/extensions/db-connector/package/ui/...` with relative asset paths and a package manifest at the package root.
- Keep the external manifest id as `db-connector` and point `uiBundle.entry` at the built HTML runtime entry.
- Make local-storage access in extracted runtime-safe so sandboxed iframe mounts do not crash on opaque-origin storage restrictions.

</specifics>

<deferred>
## Deferred Ideas

- Installer polish, activation status copy, update UX, and broader enable/disable behavior remain Phase 47.
- Deeper host leakage cleanup outside the main `db-connector` extraction path remains Phase 48.
- Optional future DB-specific sidecar packaging can return later if the workbench needs extension-owned backend logic beyond host DB APIs.

</deferred>

---

*Phase: 46-extract-db-workbench-into-an-on-demand-installable-extension-package*
*Context gathered: 2026-04-18*
