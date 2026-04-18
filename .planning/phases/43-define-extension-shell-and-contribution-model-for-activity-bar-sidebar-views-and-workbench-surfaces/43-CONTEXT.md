# Phase 43: Define Extension Shell And Contribution Model For Activity Bar, Sidebar Views, And Workbench Surfaces - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the current extension contract, which still assumes one nav item maps to one panel, with a typed shell model that can describe:
- a host activity bar entry
- one or more extension-owned sidebar views
- one or more extension-owned workbench surfaces

This phase delivers:
- a shared contribution schema that names activity bar items, sidebar views, and workbench views explicitly
- Rust and TypeScript manifest parity for builtin and external extensions
- frontend resolver and route types that can carry the new shell model before the shell UI itself is rebuilt

Out of scope in this phase:
- rebuilding the visual shell chrome in `Dashboard.tsx` and `Sidebar.tsx` (Phase 44)
- loading remote frontend bundles at runtime (Phase 45)
- extracting DB Workbench into a separate installable package (Phase 46)
- install, activation, update, or uninstall UX (Phase 47)

</domain>

<decisions>
## Implementation Decisions

### Shell Model Boundary
- The extension shell is modeled as three separate concepts: `activityBar`, `sidebarViews`, and `workbenchViews`.
- An activity item is not a panel. It selects an extension space and provides stable default sidebar and workbench view ids.
- Sidebar views and workbench views are resolved independently so one extension can expose multiple tabs without overloading the current `navigation -> first panel` inference.

### Migration Discipline
- `navigation` and `workspacePanels` remain parseable during the migration window, but they become compatibility inputs rather than the canonical model.
- The host keeps the internal extension id `db-connector`; Phase 43 does not rename or split it.
- Builtin and external extension manifests must share one contribution shape so later installable bundles do not need a separate frontend-only schema.

### Host Boundary
- Core Excel and DDL flows remain host-native surfaces in this phase.
- The extension shell contract must support the future DB Workbench plugin direction without forcing the host to load remote UI bundles yet.
- Main-surface routing needs to identify `activityItemId`, `sidebarViewId`, and `workbenchViewId` separately before the UI host chrome can be implemented.

### Extension Exposure Boundary
- Product-facing navigation should stop reflecting internal implementation terms such as `panelId` once the new model is in place.
- `ExtensionWorkspaceHost` may keep a compatibility path for legacy panel registration, but new workbench routing should target `workbenchViewId`.
- Resolver output should expose normalized activity, sidebar, and workbench collections instead of only navigation items and workspace panels.

### Claude's Discretion
- Small compatibility helpers are allowed if they reduce migration risk and let Phase 44 ship without rewriting every existing builtin contribution at once.
- Static tests that guard schema and resolver behavior are encouraged because this phase changes host contracts rather than one isolated feature.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning and product anchors
- `.planning/ROADMAP.md` - Phase 43 goal, dependencies, and success criteria
- `.planning/PROJECT.md` - v2.0 is intentionally separate from the release-grade DB baseline
- `.planning/STATE.md` - current milestone status and v2.0 backlog placement
- `AGENTS.md` - source-of-truth order, DB Workbench boundary rules, and shared-contract discipline

### Current extension contract and host wiring
- `shared/extension-schema.ts` - current manifest and contribution schema
- `src-tauri/src/builtin_extensions/mod.rs` - builtin contribution structs and builtin manifest definitions
- `src-tauri/src/extensions/manifest.rs` - external manifest parsing and validation
- `src-tauri/src/extensions/commands.rs` - `ext_list_all` serialization contract
- `client/src/extensions/contribution-resolver.ts` - current `navigation -> workspacePanels[0]` assumption
- `client/src/extensions/host-context.tsx` - frontend host state exposed to the shell
- `client/src/extensions/host-api.ts` - current `MainSurface` route shape
- `client/src/extensions/ExtensionWorkspaceHost.tsx` - current single-panel extension mounting path
- `client/src/extensions/panel-registry.ts` - local panel registration model

### Current shell behavior that motivates the change
- `client/src/pages/Dashboard.tsx` - current top-level surface routing
- `client/src/components/Sidebar.tsx` - extension nav still rendered as footer shortcuts in the core sidebar
- `client/src/components/extensions/DbConnectorWorkspace.tsx` - DB workbench still acts like one monolithic panel surface
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx` - workbench already contains internal subviews that should later map into the extension shell

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `shared/extension-schema.ts`
  - already centralizes manifest validation and frontend types, so it is the correct starting point for the new contribution model.
- `src-tauri/src/builtin_extensions/mod.rs`
  - already mirrors TypeScript contribution structs, which makes schema parity feasible without inventing a second backend contract.
- `client/src/extensions/host-context.tsx`
  - already fetches `ext_list_all` and memoizes resolved contributions; it can evolve from nav/panel outputs to activity/sidebar/workbench outputs.
- `client/src/extensions/ExtensionWorkspaceHost.tsx`
  - already provides a scoped host API and component-key resolution path that can be reused for workbench views during the transition.

### Current Workflow Gaps
- `client/src/extensions/contribution-resolver.ts`
  - still derives `panelId` from `workspacePanels[0]`, which prevents an extension from owning multiple sidebar tabs or multiple workbench surfaces.
- `client/src/components/Sidebar.tsx`
  - still treats extension navigation as footer buttons hanging off the core Excel file sidebar.
- `client/src/extensions/panel-registry.ts`
  - only models panel components, which leaks the older one-surface assumption into the frontend host.
- `src-tauri/src/extensions/manifest.rs`
  - can parse `contributes`, but only for the older `navigation` and `workspacePanels` shape.

### Integration Points
- Shared contract and backend parity:
  - `shared/extension-schema.ts`
  - `src-tauri/src/builtin_extensions/mod.rs`
  - `src-tauri/src/extensions/manifest.rs`
  - `src-tauri/src/extensions/commands.rs`
- Frontend route and resolver normalization:
  - `client/src/extensions/contribution-resolver.ts`
  - `client/src/extensions/host-context.tsx`
  - `client/src/extensions/host-api.ts`
  - `client/src/extensions/ExtensionWorkspaceHost.tsx`

</code_context>

<specifics>
## Specific Ideas

- Add `activityBarItemSchema`, `sidebarViewSchema`, and `workbenchViewSchema` to `shared/extension-schema.ts`.
- Give activity items explicit `defaultSidebarViewId` and `defaultWorkbenchViewId` fields so Phase 44 does not have to guess from array order.
- Add normalized resolver outputs such as `resolveActivityBarItems`, `resolveSidebarViews`, and `resolveWorkbenchViews`.
- Keep a compatibility bridge that can still turn legacy `navigation` and `workspacePanels` data into a normalized activity/workbench shape while builtin definitions are migrated.
- Update `MainSurface` so extension shell navigation can track extension activity and workbench identity separately from legacy `panelId`.

</specifics>

<deferred>
## Deferred Ideas

- Runtime UI bundle loading and sandboxing remain Phase 45.
- DB Workbench package extraction remains Phase 46.
- Install, activation, update, and enablement UX remain Phase 47.
- Final host cleanup and leakage retirement remain Phase 48.

</deferred>

---

*Phase: 43-define-extension-shell-and-contribution-model-for-activity-bar-sidebar-views-and-workbench-surfaces*
*Context gathered: 2026-04-17*
