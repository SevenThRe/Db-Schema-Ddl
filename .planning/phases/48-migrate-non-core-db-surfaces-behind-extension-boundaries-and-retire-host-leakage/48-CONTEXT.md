# Phase 48: Migrate Non-Core DB Surfaces Behind Extension Boundaries And Retire Host Leakage - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 48 is the cleanup pass that makes the host truly feel like `DBTools` core plus an extension shell, instead of a host that still leaks extension implementation details and legacy DB assumptions.

This phase delivers:
- host route and shell terminology cleanup so extension navigation stops exposing `panelId`-style implementation detail
- final host-facing copy cleanup where the app shell and DB-adjacent host surfaces stop assuming the DB workbench is a permanently bundled core area
- extension-boundary handoff for residual host DB guidance so users are directed to install/open the DB tool rather than being told to use a hidden builtin surface
- regression and boundary-doc updates that make the canonical shell contract explicit after the cleanup

Out of scope in this phase:
- removing legacy manifest compatibility fields such as `navigation` and `workspacePanels` from external package parsing entirely
- redesigning the DB workbench runtime UI itself
- building a general third-party extension marketplace beyond the official extension catalog already in place

</domain>

<decisions>
## Implementation Decisions

### Host Route Contract
- `MainSurface` for extension routing should identify extension surfaces through `extensionId`, `activityItemId`, `sidebarViewId`, and `workbenchViewId`; `panelId` should stop leaking into host route state.
- Legacy `workspacePanels` compatibility may remain inside contribution normalization, but host callers should consume the normalized workbench-view contract only.
- Error states should refer to missing extension surfaces or workbench views, not missing “panels”.

### Product Copy And Shell Terminology
- The core host should describe itself as Excel/DDL/Diff plus tools, not as if DB Workbench were always bundled into the shell.
- Extension shell chrome should speak in product terms such as tool/workspace rather than foregrounding “extension” as the user-facing concept where it is not necessary.
- Host guidance that depends on DB operations should point users toward the installable DB tool explicitly.

### DB Handoff Boundary
- When a host-owned DDL surface needs a live DB connection path, it should offer a handoff into the DB tool or the tool manager instead of assuming the DB workbench is already present.
- The host may keep core DDL authoring/import/export loops, but non-core DB operations should be discoverable through the extension shell entry that owns them.
- This phase prefers explicit handoff over silent dependency on hidden host DB surfaces.

### Claude's Discretion
- Compatibility helpers may stay in contribution normalization if they are no longer exposed through host route types or copy.
- Small prop additions to host-owned DDL surfaces are allowed if they make extension/tool handoff explicit and testable.
- Static source-level regression tests are required because this phase is mostly architectural cleanup and copy/contract tightening.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning anchors
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `.planning/phases/47-build-extension-install-activation-and-persisted-enablement-flow/47-CONTEXT.md`
- `AGENTS.md`

### Host route and shell files
- `client/src/extensions/host-api.ts`
- `client/src/pages/Dashboard.tsx`
- `client/src/extensions/ExtensionWorkspaceHost.tsx`
- `client/src/extensions/panel-registry.ts`
- `client/src/extensions/contribution-resolver.ts`
- `client/src/extensions/shell/ExtensionSecondarySidebar.tsx`

### Residual host DB handoff surfaces
- `client/src/components/ddl-import/DdlImportWorkspace.tsx`
- `client/src/i18n/locales/zh.json`
- `client/src/i18n/locales/ja.json`

### Boundary and regression references
- `docs/extension-boundary-spec.md`
- `test/client/extension-install-activation-phase47.test.ts`
- `test/client/extension-boundaries.test.ts`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `contribution-resolver.ts`
  - already normalizes legacy `workspacePanels` into workbench-view entries, which means host callers can stop consuming `panelId` directly without breaking legacy manifests.
- `Dashboard.tsx`
  - already routes extension surfaces through normalized activity/sidebar/workbench ids, so removing `panelId` from the host contract is mostly a cleanup instead of a redesign.
- `DdlImportWorkspace.tsx`
  - already centralizes the host-owned DDL import/export flow, making it the right place to add an explicit DB-tool handoff when live connections are unavailable.

### Current Gaps
- `host-api.ts`, `Dashboard.tsx`, `ExtensionWorkspaceHost.tsx`, and `panel-registry.ts`
  - still expose `panelId` even though the canonical shell contract has been `workbenchViewId` since Phase 43.
- `ExtensionWorkspaceHost.tsx`
  - still renders a user-facing “panel not found” message, which exposes an implementation term rather than a product surface term.
- `app.subtitle` and parts of DDL import guidance
  - still imply DB Workbench is a built-in always-present host area rather than an installable tool.
- `ExtensionSecondarySidebar.tsx`
  - still labels its chrome as “Extension”, which leaks implementation language into the product shell.

### Integration Points
- Route and terminology cleanup:
  - `client/src/extensions/host-api.ts`
  - `client/src/pages/Dashboard.tsx`
  - `client/src/extensions/ExtensionWorkspaceHost.tsx`
  - `client/src/extensions/panel-registry.ts`
  - `client/src/extensions/shell/ExtensionSecondarySidebar.tsx`
- DB handoff boundary:
  - `client/src/components/ddl-import/DdlImportWorkspace.tsx`
  - `client/src/pages/Dashboard.tsx`
  - `client/src/i18n/locales/zh.json`
  - `client/src/i18n/locales/ja.json`

</code_context>

<specifics>
## Specific Ideas

- Remove `panelId` from `MainSurface`, `ExtensionWorkspaceProps`, and `ExtensionWorkspaceHost` props, and rely on normalized `workbenchViewId` only.
- Rename `panelNotFound` to `surfaceNotFound` in UI copy and use that wording in the host placeholder.
- Update app subtitle from `Excel / DDL / Diff / DB 工作台` to a tool-neutral summary such as `Excel / DDL / Diff / Tools`.
- Add a DDL-import empty-state handoff that either opens the installed DB tool or sends the user to tool management when no DB connection path is available.
- Change extension secondary sidebar chrome copy from `Extension` to `Tool`.

</specifics>

<deferred>
## Deferred Ideas

- Full removal of legacy manifest compatibility fields can wait until a later platform version once migration pressure is gone.
- Richer DB-tool cross-surface handoff, such as opening a specific DB workbench subview with prepared context, remains future refinement.
- Marketplace-scale third-party extension UX remains separate from this cleanup phase.

</deferred>

---

*Phase: 48-migrate-non-core-db-surfaces-behind-extension-boundaries-and-retire-host-leakage*
*Context gathered: 2026-04-18*
