# Phase 4: DDL 导入 & 扩展功能管理 - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 4 delivers two independent workstreams that share a single phase:

**Workstream A — DDL 导入 (built-in feature)**
DDL 导入 becomes a proper standalone workspace in the main app — not a floating header button. Users can select a `.sql` file, preview the parsed statements, and execute them against an active database connection with the existing dangerous-SQL confirmation gate.

**Workstream B — Extension Management Page**
The "扩展功能" nav entry now routes to a full-screen extension management page. The page shows all installed extensions (only DB 工作台 in Phase 4). Each extension can be individually disabled (hidden, persistent) or uninstalled (removed). The primary sidebar is cleaned up to remove all extension-type nav items that currently pollute it.

**What is NOT in Phase 4:**
- DDL→Excel extension (deferred to next version)
- Enum 生成 extension (deferred to next version)
- Schema Diff reorganization (built-in, unchanged)
- Extension package download/install from remote (management UI only; DB workbench is the test case)

</domain>

<decisions>
## Implementation Decisions

### Extension Conceptual Model (D — fundamental redefinition)
- **D-01:** "Internal/builtin extensions" is a concept that is ELIMINATED. The app has only two categories: **built-in features** and **external extensions**.
- **D-02:** Built-in features (DDL 生成器, DDL 导入, Schema Diff) are NOT extensions. They are first-class app capabilities with no enable/disable management.
- **D-03:** DB 工作台 (`db-connector`) is the first **external extension**. Conceptually it is "external" even though it ships bundled for now. The extension system treats it like any user-installed extension.
- **D-04:** DDL→Excel and Enum 生成 are future external extensions — deferred to next version. They do NOT appear in the Phase 4 extension management page.
- **D-05:** Extensions use a **file package model** — each extension is an independent, self-contained package (directory + manifest). This is the conceptual model Phase 4 should establish in the management UI, even if packaging/install from remote is not yet implemented.
- **D-06:** Each extension is fully independent. No shared runtime or capability contracts between extensions (beyond what the host API provides).

### Sidebar Cleanup (EXTUI-01)
- **D-07:** Remove ALL extension-registered nav items from the primary sidebar. Specifically: 数据库, DDL→Excel, Enum生成 nav entries are removed.
- **D-08:** Schema Diff stays as a built-in nav item (it is a core feature, not an extension). Its sidebar behavior is unchanged.
- **D-09:** DB 工作台's sidebar presence is controlled by the extension system: if enabled, its nav entry appears; if disabled or uninstalled, it disappears from the sidebar entirely.
- **D-10:** DDL 导入 gets its own dedicated sidebar nav entry as a first-class built-in feature (alongside DDL 生成器).

### DDL 导入 Placement (A3)
- **D-11:** DDL 导入 is a **standalone built-in workspace** — it has its own sidebar nav entry and opens in the main content area (not a modal, not a header button).
- **D-12:** The existing `DdlImportWorkspace.tsx` component (3-panel layout: file select / statement preview / results) is the implementation foundation. The change is the entry point: sidebar nav instead of header button.
- **D-13:** The existing `DangerousSqlDialog` from Phase 1 is reused for DDL import's dangerous statement gate (DROP/TRUNCATE/ALTER trigger confirmation; prod requires typing DB name). No new dialog component needed.
- **D-14:** DDL 导入 requires an active database connection. If no connection is active, the workspace shows a "connect first" empty state (not an error).

### Extension Management Page (B1 + EXTUI-02~05)
- **D-15:** Clicking "扩展功能" routes to a **full-screen page** (replaces main content area, like routing to a new route/surface) — NOT a modal, NOT a drawer.
- **D-16:** The page lists all installed extensions as **cards** (or table rows — layout TBD by planner/researcher). In Phase 4 this means only DB 工作台 appears.
- **D-17:** Each extension card shows (C3 — detailed): icon, name, version, description, author/source, install date, capabilities/badges, a "打开" (Launch) button, a "配置" (Config) entry if the extension has settings.
- **D-18:** Two distinct action buttons per extension: **禁用** (Disable — hides the extension from all navigation surfaces, persisted across restarts) and **卸载** (Uninstall — removes the extension package entirely).
- **D-19:** Disabled extensions: their sidebar nav entry, workspace panel, and any toolbar buttons completely disappear from the UI. This state is written to disk (survives app restart).
- **D-20:** Uninstalled extensions: the package is removed. On Phase 4, "uninstall" for DB 工作台 means it is removed from the extension registry (but since it ships bundled, the exact file removal is at Claude's discretion — logical removal is acceptable for Phase 4).
- **D-21:** "禁用" vs "卸载" distinction: Disable is reversible from the management page. Uninstall removes the extension and requires re-installation to get it back (in future versions). Phase 4 can show "Reinstall" placeholder if uninstalled.

### Extension Package Model (D-05 detail)
- **D-22:** Each extension is a **directory package** with a manifest file (`extension.json` or `extension.toml` — Claude's discretion on format). The manifest declares: id, name, version, description, author, capabilities, entry point.
- **D-23:** The extension management page reads from a configured **extensions directory** (e.g., `~/AppData/Roaming/ddl-generator/extensions/`). DB 工作台 is pre-registered as a bundled extension in this directory.
- **D-24:** Phase 4 does NOT implement extension install-from-remote or a marketplace. The management page is install-agnostic: it manages whatever is in the extensions directory.

### Enable/Disable Persistence (E2)
- **D-25:** Extension enabled/disabled state is persisted to disk (app config or a dedicated `extensions.json` state file). State survives app restarts.
- **D-26:** When DB 工作台 is disabled and the user relaunches the app, the DB 工作台 nav entry does not appear in the sidebar. The 扩展功能 page is the only place to re-enable it.

### Claude's Discretion
- Exact extension directory path and format of `extension.json` manifest
- Whether DB 工作台's "uninstall" is a logical flag or actual file removal in Phase 4
- Extension card visual layout (card grid vs. table rows)
- Whether "disabled" extensions are shown in the management page as dimmed vs. filtered
- Exact sidebar ordering of DDL 导入 relative to DDL 生成器
- Whether the DDL 导入 sidebar entry is always visible or only when a DB connection is active

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Extension Architecture
- `.planning/phases/01-extension-host-foundation/01-CONTEXT.md` — Extension host foundation decisions (contribution resolver, panel registry, capability model)
- `docs/extension-boundary-spec.md` — Normative extension boundary spec: manifest schema alignment, capability fail-closed model, panel registry safety
- `client/src/extensions/contribution-resolver.ts` — `resolveNavigation()` function: how nav items are resolved from enabled extensions (directly relevant to sidebar cleanup)
- `shared/extension-schema.ts` — Extension manifest TypeScript types (NavigationItem, ResolvedNavItem, ExtensionContributes)
- `src-tauri/src/builtin_extensions/mod.rs` — Current builtin extension definitions (db-connector, schema-diff, ddl-to-excel, excel-to-java-enum) — Phase 4 must restructure this

### DDL 导入 (Existing Implementation)
- `client/src/components/extensions/db-workbench/DangerousSqlDialog.tsx` — Phase 1 dangerous-SQL dialog (reuse for DDL import gate; no new dialog needed)
- `client/src/components/DdlImportWorkspace.tsx` — Existing DDL import 3-panel UI (entry point change only, not a rewrite)

### Extension Management UI (Current)
- `client/src/components/ExtensionPanel.tsx` — Current extension management modal (reference for data model and actions; Phase 4 converts this to a full-page view)

### Phase 1 Context (locked decisions that apply here)
- `.planning/phases/01-usable-workbench-v1_4/01-CONTEXT.md` — Workbench architecture, DangerousSql dialog design decisions
- `.planning/phases/01-usable-workbench-v1_4/01-04-PLAN.md` — How DangerousSqlDialog is invoked (task 2)

### DB Workbench Registration
- `client/src/components/extensions/register-all.tsx` — Panel registry: where db-connector workspace component is registered
- `client/src/extensions/host-context.tsx` — `useExtensionHost()`: extension host React context (sidebar reads nav items from here)
- `client/src/components/Sidebar.tsx` — Current sidebar implementation: line 75 `const { navigation: extNavItems } = useExtensionHost()` — already fetches nav items but does not render them

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `DangerousSqlDialog.tsx` — Already accepts `DangerousSqlPreview | null`, handles dev/test/prod tiers, prod requires DB name input. Import and wire into DDL import execute flow.
- `DdlImportWorkspace.tsx` — 3-panel DDL import UI already exists. Phase 4 change: remove the header button trigger, add a sidebar nav entry that renders this component as a workspace.
- `ExtensionPanel.tsx` — Data model and Tauri command calls for extension management already exist. Phase 4 converts from modal to full-page surface.
- `useExtensionHost()` / `contribution-resolver.ts::resolveNavigation()` — Extension nav item resolution pipeline. Phase 4 must ensure only enabled extensions contribute nav items, and DB workbench disable state flows through this.

### Established Patterns
- `activeSurface` state in `Dashboard.tsx` — Governs what workspace is shown. DDL 导入 is already a surface type (`{ kind: "ddl-import" }`). Phase 4 adds a sidebar nav entry that sets this surface, rather than a header button.
- Extension enable/disable state — Check how `ExtensionPanel.tsx` currently persists this (Tauri store or config). Phase 4 must persist disable state across restarts.
- `panel-registry.ts` — Component name → React component map. DB workbench is registered here. When disabled, the nav entry referencing this panel should not appear.

### Integration Points
- Sidebar → `useExtensionHost()` → `resolveNavigation()` → only enabled extensions → sidebar nav items. Phase 4 makes this the single source of truth for all extension nav items.
- DDL 导入 → `activeSurface: { kind: "ddl-import" }` → `DdlImportWorkspace` → on execute → calls `DangerousSqlDialog` if destructive.
- Extension management page → Tauri commands for extension state → writes enabled/disabled state to disk → `useExtensionHost()` re-reads on next load.

</code_context>

<specifics>
## Specific Ideas

- **"提供一个扩展文件夹"**: User explicitly wants a folder/directory based extension model — each extension is a file package in a dedicated extensions directory. This is the mental model to establish in Phase 4 even if remote install is deferred.
- **Disable vs Uninstall are distinct**: Disable = reversible, keeps package, hides from UI. Uninstall = removes package, requires reinstall. This distinction must be visually clear in the management page (two separate buttons, not a toggle or dropdown).
- **DB 工作台 is the test case**: Phase 4 treats DB 工作台 as the canonical example of an external extension. The extension model built here must generalize to DDL→Excel and Enum生成 in future versions.

</specifics>

<deferred>
## Deferred Ideas

- **DDL→Excel extension** — User confirmed it is a new extension but current UIUX design is not ready. Deferred to next version (v1.5 or separate milestone).
- **Enum 生成 extension** — Same as DDL→Excel: confirmed as extension, deferred. Future: may use main sidebar or be standalone — TBD when UIUX is designed.
- **Extension install from remote / marketplace** — Phase 4 only builds the management UI. Download/install from URL or package registry is a future feature.
- **Extension sandbox / permission model** — Each extension being independent with capability isolation is a future concern. Phase 4 only needs enable/disable/uninstall at the management level.
- **Schema Diff reorganization** — User did not address. Treat as built-in nav item, unchanged in Phase 4.
- **DDL 导入 when no connection active** — Whether to show the workspace greyed out or completely hide it is Claude's discretion for planning.

</deferred>

---

*Phase: 04-ddl-import-and-extension-management-v1_4*
*Context gathered: 2026-03-25*
