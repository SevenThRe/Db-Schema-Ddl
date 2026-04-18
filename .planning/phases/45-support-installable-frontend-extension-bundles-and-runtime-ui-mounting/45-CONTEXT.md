# Phase 45: Support Installable Frontend Extension Bundles And Runtime UI Mounting - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 45 converts the extension shell from "host-local React registry only" into a runtime-capable host that can mount UI shipped inside an installed external extension package.

This phase delivers:
- a manifest contract for external frontend bundles and contributed runtime views
- install/list validation so the host can tell whether an external UI bundle is present and mountable
- a host rendering path that can mount extension-provided sidebar and workbench UI without recompiling the app
- explicit shell error states when a declared external UI bundle is missing, invalid, or incompatible

Out of scope in this phase:
- extracting `db-connector` into an installable package (Phase 46)
- install, activation, update, or uninstall UX changes beyond what is needed to expose bundle state (Phase 47)
- retiring every host-local DB surface and cleaning all leakage (Phase 48)

</domain>

<decisions>
## Implementation Decisions

### Runtime Mount Strategy
- External extension UI should load through Tauri's asset protocol plus `convertFileSrc`, not through same-context dynamic `import()` into the host React app.
- The host should mount external UI inside a sandboxed iframe so third-party code does not execute inside the main shell's React tree.
- Builtin extensions continue to resolve local React components through `panel-registry.ts` and `sidebar-view-registry.ts`; Phase 45 adds an external path instead of replacing the builtin path.

### Manifest Contract Boundary
- External manifests gain one optional top-level frontend bundle declaration that points at an extracted HTML entry file inside the installed extension directory.
- Contributed `sidebarViews` and `workbenchViews` keep optional `component` for builtin/local registration, but they also gain an explicit runtime view identifier for external bundle mounts.
- A contributed surface may resolve through a builtin `component` or through an external runtime view id; the shell must not guess based on extension kind alone.

### Validation And Failure Semantics
- If an extension declares a frontend bundle, install/list flows must validate that the bundle entry exists relative to the installed extension root.
- `ext_list_all` should expose resolved bundle status to the frontend so the shell can distinguish `ready`, `missing`, `invalid`, and `incompatible` states explicitly.
- The shell must never silently render a blank surface for a declared external runtime view. Missing or incompatible bundles should render an operator-readable error placeholder.

### Host API Boundary
- Phase 45 establishes runtime mounting and basic frame metadata flow only; it does not require full parity between iframe-hosted extensions and builtin React extensions yet.
- Any runtime bridge introduced in this phase should stay narrow and capability-scoped so Phase 46 can build on it without re-opening the shell architecture.
- External UI loading must not bypass the host capability model or allow direct imports of `desktopBridge`.

### Packaging Boundary
- Frontend bundle assets live inside the installed extension directory alongside the existing sidecar payload and manifest.
- The host must enable Tauri asset-protocol access for the installed extension asset scope before runtime mounts can work reliably.
- Runtime view loading should use bundle-relative routes or view identifiers rather than forcing one HTML entry per contributed surface.

### Claude's Discretion
- A thin runtime surface component and helper utilities are allowed if they keep iframe mounting, placeholder states, and source URL generation isolated from the rest of the shell.
- Compatibility helpers are acceptable as long as builtin behavior remains unchanged and external runtime loading stays explicit.
- Static tests are required because this phase touches manifest contracts, install/list validation, and top-level shell behavior at once.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning anchors
- `.planning/ROADMAP.md` - Phase 45 goal, dependencies, and success criteria
- `.planning/PROJECT.md` - installable extension platform is separated from the release-grade v1.8 baseline
- `.planning/STATE.md` - current focus and Phase 43/44 shell decisions
- `.planning/phases/43-define-extension-shell-and-contribution-model-for-activity-bar-sidebar-views-and-workbench-surfaces/43-CONTEXT.md` - canonical shell contribution model
- `.planning/phases/44-build-vs-code-style-extension-activity-bar-and-secondary-sidebar-host/44-CONTEXT.md` - visible shell chrome and db-connector adoption decisions
- `AGENTS.md` - source-of-truth order, shared-contract rules, and desktop-shell boundaries

### Current external extension install/runtime path
- `shared/extension-schema.ts` - TypeScript manifest and resolved extension schema
- `src-tauri/src/extensions/manifest.rs` - external manifest loading and validation
- `src-tauri/src/extensions/lifecycle.rs` - install-time unzip and entry verification
- `src-tauri/src/extensions/registry.rs` - installed extension metadata and install directory rules
- `src-tauri/src/extensions/commands.rs` - `ext_list_all` serialized contract
- `src-tauri/tauri.conf.json` - asset-protocol and CSP boundary for local bundle loading

### Current host shell and local mount path
- `client/src/extensions/contribution-resolver.ts` - resolved activity/sidebar/workbench surfaces
- `client/src/extensions/host-context.tsx` - extension host state from `ext_list_all`
- `client/src/extensions/ExtensionWorkspaceHost.tsx` - workbench mount path
- `client/src/extensions/shell/ExtensionSecondarySidebar.tsx` - sidebar-view mount path
- `client/src/extensions/panel-registry.ts` - builtin workbench component registry
- `client/src/extensions/sidebar-view-registry.ts` - builtin sidebar component registry
- `client/src/extensions/host-api.ts` - explicit note that external extensions use message passing in V2

### Boundary/spec references
- `docs/extension-boundary-spec.md` - current manifest and capability guardrails that must remain truthful after new bundle fields are added

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src-tauri/src/extensions/lifecycle.rs`
  - already validates extracted sidecar entry files during install, so bundle-entry validation can piggyback on the same install boundary.
- `src-tauri/src/extensions/commands.rs`
  - already merges builtin and external extension states into one frontend contract, which is the correct place to expose resolved bundle availability.
- `client/src/extensions/ExtensionWorkspaceHost.tsx`
  - already chooses between workbench and legacy panel targets and is the right place to add an external runtime workbench fallback.
- `client/src/extensions/shell/ExtensionSecondarySidebar.tsx`
  - already chooses the active sidebar view and can host a runtime sidebar fallback when no local sidebar component is registered.

### Current Workflow Gaps
- `shared/extension-schema.ts`
  - has no way to declare frontend bundle metadata or runtime view identifiers, so external extensions cannot point the shell at shipped UI assets.
- `src-tauri/src/extensions/manifest.rs`
  - validates only the sidecar `entry` map; it does not know anything about frontend bundle assets.
- `src-tauri/src/extensions/commands.rs`
  - returns no install-root-relative bundle status or mount path, so the frontend cannot discover whether an external UI bundle is usable.
- `client/src/extensions/ExtensionWorkspaceHost.tsx` and `client/src/extensions/shell/ExtensionSecondarySidebar.tsx`
  - only resolve host-local registered React components today, which keeps external extension UI unreachable even after install.
- `src-tauri/tauri.conf.json`
  - currently has no explicit asset-protocol scope for installed extension files, which blocks a clean `convertFileSrc` mount path.

### Integration Points
- Shared contract and backend validation:
  - `shared/extension-schema.ts`
  - `src-tauri/src/builtin_extensions/mod.rs`
  - `src-tauri/src/extensions/manifest.rs`
  - `src-tauri/src/extensions/lifecycle.rs`
  - `src-tauri/src/extensions/commands.rs`
- Frontend runtime mount path:
  - `client/src/extensions/contribution-resolver.ts`
  - `client/src/extensions/host-context.tsx`
  - `client/src/extensions/ExtensionWorkspaceHost.tsx`
  - `client/src/extensions/shell/ExtensionSecondarySidebar.tsx`
  - `src-tauri/tauri.conf.json`

</code_context>

<specifics>
## Specific Ideas

- Add an optional top-level manifest block such as `uiBundle` with at least:
  - `entry`
  - `mode` (`iframe` for Phase 45)
  - an optional bundle API version for compatibility checks
- Add an optional runtime-view identifier to `sidebarViews` and `workbenchViews` so external contributions can point into the shipped bundle without pretending to be builtin registry keys.
- Expose a resolved bundle state from `ext_list_all`, including:
  - `status`
  - `entryPath`
  - `error`
- Add a small runtime mount component that:
  - converts an installed bundle entry path into an asset URL
  - appends extension/view metadata to the frame URL
  - renders explicit placeholders for non-ready bundle states
- Keep builtin components on the existing registry path so Phase 45 does not destabilize current DB workbench behavior.

</specifics>

<deferred>
## Deferred Ideas

- Full host API bridging for iframe-hosted extensions can stay narrow in Phase 45 and deepen in Phase 46 when `db-connector` starts moving out of the host bundle.
- Download/install UX expansion, activation policy, and persisted enablement remain Phase 47.
- Broader host cleanup and de-hardcoding of DB surfaces remain Phase 48.

</deferred>

---

*Phase: 45-support-installable-frontend-extension-bundles-and-runtime-ui-mounting*
*Context gathered: 2026-04-18*
