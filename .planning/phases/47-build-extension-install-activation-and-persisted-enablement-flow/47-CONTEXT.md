# Phase 47: Build Extension Install, Activation, And Persisted Enablement Flow - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 47 turns the extracted extension platform into operator-usable product behavior. The shell already knows how to mount installed extension UI, but the current reachable management flow still behaves like a developer scaffold.

This phase delivers:
- one reachable extension-management surface that can install, enable, disable, open, and uninstall official external extensions
- persistent enablement behavior that stays truthful across install, reinstall, disable, re-enable, and uninstall cycles
- shell recovery rules so disabling or uninstalling the active extension returns the app to a safe host surface instead of leaving dead extension state behind
- explicit activation outcomes in the UI so operators can tell whether an extension is installed, disabled, ready to open, or unavailable

Out of scope in this phase:
- removing all remaining host navigation leakage and `panelId`-era assumptions from the shell contract (Phase 48)
- adding new third-party extension ecosystems beyond the current official extension catalog
- deepening the DB workbench feature set itself

</domain>

<decisions>
## Implementation Decisions

### Canonical Management Surface
- The routed `ExtensionManagementPage` is now the canonical user-facing extension center; Phase 47 should stop relying on the unused dialog-era `ExtensionPanel` for real install behavior.
- The canonical page must show both installable official extensions and installed external extensions in one place, instead of splitting install and enablement across disconnected surfaces.
- Operator actions should be expressed as product actions: install, open, enable, disable, uninstall, and check for updates.

### Persisted Enablement Truth
- Installing an extension should leave it enabled by default so the shell exposes its activity immediately after install.
- Uninstalling an extension must also clear any persisted disabled marker for that extension so reinstall does not silently come back hidden.
- Disabling an extension should hide its activity and sidebar contributions immediately through the existing `ext_list_all` filtering path, not through client-only gray states.

### Shell Recovery And Reopen Semantics
- If the currently open extension becomes disabled or uninstalled, `Dashboard.tsx` must fall back to the core workspace surface instead of leaving the app on a dead extension route.
- Re-enabling or reinstalling an extension should preserve the remembered activity/sidebar selection where possible so “open again” feels like reopening a tool, not starting from scratch every time.
- Install success should offer a direct open path from the management surface instead of forcing the user to leave and rediscover the tool entry.

### Activation Outcomes
- External extensions need clear UI state badges that distinguish `not installed`, `installed and enabled`, `installed but disabled`, and `runtime bundle problem`.
- UI-only packages should never expose fake process controls. Phase 46 already removed fake start/stop for `db-connector`; Phase 47 keeps product copy aligned with install/open/enable behavior.
- The management page should surface bundle readiness truth from `uiMount` so operators can understand why an installed extension cannot open.

### Claude's Discretion
- Small hook refactors are allowed if they collapse duplicated extension-management mutations into one truthful flow.
- Legacy compatibility fields (`navigation`, `workspacePanels`, `panelId`) may remain internally for now, but Phase 47 should avoid introducing any new caller that depends on them.
- Static regression tests are required because this phase changes persistence, host fallback behavior, and the only reachable extension-management page together.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning anchors
- `.planning/ROADMAP.md` - Phase 47 goal, dependencies, and success criteria
- `.planning/STATE.md` - current runtime anchor after Phase 46
- `.planning/phases/45-support-installable-frontend-extension-bundles-and-runtime-ui-mounting/45-CONTEXT.md`
- `.planning/phases/46-extract-db-workbench-into-an-on-demand-installable-extension-package/46-CONTEXT.md`
- `AGENTS.md` - source-of-truth order, shell rules, and shared-contract guidance

### Current extension install and enablement path
- `src-tauri/src/extensions/commands.rs`
- `src-tauri/src/extensions/lifecycle.rs`
- `src-tauri/src/extensions/registry.rs`
- `shared/extension-schema.ts`
- `extension-packages/db-connector/manifest.json`

### Current reachable host shell and management UI
- `client/src/pages/Dashboard.tsx`
- `client/src/extensions/host-context.tsx`
- `client/src/components/extension-management/ExtensionManagementPage.tsx`
- `client/src/hooks/use-extensions.ts`
- `client/src/extensions/ExtensionWorkspaceHost.tsx`
- `client/src/extensions/shell/ExtensionActivityBar.tsx`
- `client/src/extensions/shell/ExtensionSecondarySidebar.tsx`

### Regression and boundary references
- `test/client/extension-boundaries.test.ts`
- `test/client/extension-runtime-extraction-phase46.test.ts`
- `docs/extension-boundary-spec.md`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `client/src/hooks/use-extensions.ts`
  - already centralizes install, uninstall, start, stop, and catalog fetch mutations, and can become the canonical mutation layer for enable/disable actions too.
- `client/src/pages/Dashboard.tsx`
  - already remembers last extension activity and sidebar view selections in local storage, which can be reused for reopen behavior once invalid routes are cleaned up.
- `src-tauri/src/extensions/commands.rs`
  - already owns the persisted disabled-extension file and the combined `ext_list_all` response, which is the right boundary for install/uninstall enablement truth.

### Current Gaps
- `client/src/components/extension-management/ExtensionManagementPage.tsx`
  - only shows already installed external extensions, cannot install from the real route, and still contains a fake local uninstall placeholder from earlier phases.
- `client/src/components/ExtensionPanel.tsx`
  - has marketplace behavior but is not mounted anywhere, so the actual product path cannot install official extensions.
- `src-tauri/src/extensions/commands.rs`
  - installs do not explicitly clear prior disabled state, and uninstalls do not scrub persisted disabled markers, which makes reinstall/enablement behavior fragile.
- `client/src/pages/Dashboard.tsx`
  - persists extension selections, but it does not yet guarantee a fallback when the active extension disappears from `activityBarItems`.

### Integration Points
- Persisted enablement and lifecycle truth:
  - `src-tauri/src/extensions/commands.rs`
  - `src-tauri/src/extensions/lifecycle.rs`
  - `src-tauri/src/extensions/registry.rs`
- Reachable extension-management UX:
  - `client/src/components/extension-management/ExtensionManagementPage.tsx`
  - `client/src/hooks/use-extensions.ts`
  - `client/src/i18n/locales/zh.json`
  - `client/src/i18n/locales/ja.json`
- Shell recovery and reopen:
  - `client/src/pages/Dashboard.tsx`
  - `client/src/extensions/host-context.tsx`
  - `client/src/extensions/ExtensionWorkspaceHost.tsx`

</code_context>

<specifics>
## Specific Ideas

- Add `setEnabled()` to `useExtensions()` and have install/uninstall invalidate both installed-list and resolved-shell queries through one hook.
- Replace the fake uninstall flow in `ExtensionManagementPage` with real `ext_uninstall`, and merge official catalog rows into the same page so the reachable route can install `db-connector`.
- Add a dashboard guard that detects `activeSurface.kind === "extension"` with no resolved activity item and falls back to `{ kind: "workspace" }`.
- Add operator-readable state badges such as:
  - `Not installed`
  - `Installed`
  - `Disabled`
  - `Bundle issue`
- Offer `安装并打开` / `Open` directly after install when the extension contributes a valid activity item.

</specifics>

<deferred>
## Deferred Ideas

- Removing `panelId` from the host route contract and tightening all resolver terminology belongs to Phase 48.
- Broader marketplace/catalog sync, extension updates, and third-party trust policy remain later platform work.
- Product copy cleanup that stops mentioning DB workbench in host-global labels belongs to Phase 48 where host leakage is the direct target.

</deferred>

---

*Phase: 47-build-extension-install-activation-and-persisted-enablement-flow*
*Context gathered: 2026-04-18*
