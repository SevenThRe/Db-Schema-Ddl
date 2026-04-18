# Phase 44: Build VS Code-Style Extension Activity Bar And Secondary Sidebar Host - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Turn the new extension contribution model into visible shell behavior. The app should stop treating extensions as footer shortcuts and start rendering them through:
- a primary activity bar
- a contextual secondary sidebar owned by the selected extension
- a main workbench area

This phase delivers:
- extension shell chrome in the app shell
- routing and persistence for selected activity and sidebar view state
- first-adopter integration for `db-connector` so it can own secondary sidebar tabs

Out of scope in this phase:
- runtime bundle loading for external extension UI (Phase 45)
- packaging DB Workbench as an on-demand installable extension (Phase 46)
- install, enablement, update, or uninstall flows (Phase 47)
- final host de-hardcoding of every non-core DB surface (Phase 48)

</domain>

<decisions>
## Implementation Decisions

### Shell Layout
- The host shell for extension surfaces is a three-region layout: activity bar, secondary sidebar, and main workbench area.
- The existing core workspace sidebar for Excel and DDL stays host-native and should remain available when the user is in the core workspace surface.
- Docs, settings, and language controls may move into stable host chrome, but extension selection should no longer live in the core file sidebar footer.

### Extension Navigation Semantics
- Selecting an activity item changes the active extension shell context, not just one panel.
- Sidebar tabs are extension-owned views and should persist per extension so returning to an activity restores the last selected sidebar view where practical.
- Workbench rendering should follow the selected extension workbench view and avoid duplicating a second left sidebar inside the workbench content.

### DB Connector Adoption
- `db-connector` is the first adopter of the new shell and should expose its own secondary sidebar tabs instead of only one monolithic footer entry.
- This phase may bridge into existing `DbConnectorWorkspace` and `WorkbenchLayout` rather than fully decomposing every internal DB pane into separate extension surfaces.
- If `WorkbenchLayout` keeps legacy internal sidebar behavior for compatibility, it must also support a host-managed mode so the new shell does not render two sidebars for the same extension.

### Product Boundary
- Core Excel and DDL work remains available even if no extension activity is selected.
- The new shell should preserve current DB workbench operator trust while changing navigation architecture; this phase is not a visual reinvention.
- Product-facing navigation should describe capabilities and views, not internal registry names such as `panelId`.

### Claude's Discretion
- Transitional wrappers around existing DB components are allowed if they let the shell host land before deeper extension extraction work.
- Static tests are valuable here because the phase changes top-level routing and UI structure rather than one isolated widget.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning and shell-contract anchors
- `.planning/ROADMAP.md` - Phase 44 goal, dependencies, and success criteria
- `.planning/PROJECT.md` - extension platform is a later milestone, not part of the release-grade bar
- `.planning/STATE.md` - current v2.0 backlog position
- `.planning/phases/43-define-extension-shell-and-contribution-model-for-activity-bar-sidebar-views-and-workbench-surfaces/43-CONTEXT.md` - shell contract decisions that Phase 44 must consume
- `AGENTS.md` - desktop shell, DB Workbench, and capability-accuracy boundaries

### Current shell implementation
- `client/src/pages/Dashboard.tsx` - top-level surface routing and persistence
- `client/src/components/Sidebar.tsx` - current core sidebar that still renders extension shortcuts in the footer
- `client/src/extensions/host-api.ts` - main surface route contract
- `client/src/extensions/host-context.tsx` - resolved extension host state
- `client/src/extensions/ExtensionWorkspaceHost.tsx` - workbench surface mounting path
- `client/src/lib/desktop-capabilities.ts` - runtime feature gate for extension shell availability

### DB connector surfaces that need adoption
- `src-tauri/src/builtin_extensions/mod.rs` - builtin manifest definitions
- `client/src/extensions/builtin/register-all.tsx` - builtin workbench component registration
- `client/src/components/extensions/DbConnectorWorkspace.tsx` - current DB connector shell
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx` - canonical DB workbench layout with its own sidebar
- `client/src/components/extensions/db-workbench/ConnectionSidebar.tsx` - current DB internal sidebar content that can seed the new secondary sidebar

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `client/src/pages/Dashboard.tsx`
  - already owns top-level surface persistence and is the correct place to switch between core workspace and extension shell layouts.
- `client/src/extensions/host-context.tsx`
  - already exposes extension-derived state from `ext_list_all`, so the new shell can consume resolved activity/sidebar/workbench collections there.
- `client/src/extensions/ExtensionWorkspaceHost.tsx`
  - already handles scoped host APIs and component mounting for extension content.
- `client/src/components/extensions/db-workbench/ConnectionSidebar.tsx`
  - already packages much of the DB-specific sidebar content that should move into the host-managed secondary sidebar.

### Current Workflow Gaps
- `client/src/components/Sidebar.tsx`
  - still mixes file management, extension entrypoints, docs, settings, and language controls into one host sidebar.
- `client/src/pages/Dashboard.tsx`
  - only understands `workspace`, `extensions`, `ddl-import`, and legacy `extension/panelId` routing.
- `client/src/components/extensions/DbConnectorWorkspace.tsx`
  - still behaves like one large panel with internal route modes rather than an extension that owns sidebar tabs.
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
  - still renders an internal left sidebar, which will conflict with a new host-managed secondary sidebar unless a host mode is added.

### Integration Points
- Host shell layout:
  - `client/src/pages/Dashboard.tsx`
  - `client/src/components/Sidebar.tsx`
  - `client/src/extensions/host-api.ts`
  - `client/src/extensions/host-context.tsx`
  - `client/src/extensions/ExtensionWorkspaceHost.tsx`
- DB connector adoption:
  - `src-tauri/src/builtin_extensions/mod.rs`
  - `client/src/extensions/builtin/register-all.tsx`
  - `client/src/components/extensions/DbConnectorWorkspace.tsx`
  - `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
  - `client/src/components/extensions/db-workbench/ConnectionSidebar.tsx`

</code_context>

<specifics>
## Specific Ideas

- Add host shell components such as `ExtensionActivityBar` and `ExtensionSecondarySidebar`.
- Persist the last selected extension activity and last selected sidebar view per extension in `Dashboard.tsx`.
- Move extension launch buttons out of the `Sidebar.tsx` footer and into a real activity bar.
- Add explicit `db-connector` contribution ids for the host shell, such as:
  - `db-connector-activity`
  - `db-connector-sidebar-connections`
  - `db-connector-sidebar-explorer`
  - `db-connector-workbench`
- Give `WorkbenchLayout` a host-managed sidebar mode so the new shell can own secondary sidebar tabs without rendering duplicate left panes.

</specifics>

<deferred>
## Deferred Ideas

- External bundle loading remains Phase 45.
- DB Workbench packaging extraction remains Phase 46.
- Install, activation, and persisted enablement UX remain Phase 47.
- Full host leakage cleanup remains Phase 48.

</deferred>

---

*Phase: 44-build-vs-code-style-extension-activity-bar-and-secondary-sidebar-host*
*Context gathered: 2026-04-17*
