# Phase 4: DDL 导入 & 扩展功能管理 - Research

**Researched:** 2026-03-25
**Domain:** Tauri desktop app — sidebar navigation refactor, DDL import entry-point migration, extension management page, enable/disable persistence
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Extension Conceptual Model:**
- D-01: "Internal/builtin extensions" concept is ELIMINATED. App has two categories: built-in features and external extensions.
- D-02: Built-in features (DDL 生成器, DDL 导入, Schema Diff) are NOT extensions. No enable/disable management.
- D-03: DB 工作台 (`db-connector`) is the first external extension. Treated by the extension system like any user-installed extension.
- D-04: DDL→Excel and Enum 生成 are future extensions — NOT in Phase 4.
- D-05: File package model — each extension is an independent directory + manifest.
- D-06: Extensions are fully independent. No shared runtime.

**Sidebar Cleanup (EXTUI-01):**
- D-07: Remove ALL extension-registered nav items from primary sidebar. Remove: 数据库, DDL→Excel, Enum生成.
- D-08: Schema Diff stays as built-in nav item. Unchanged.
- D-09: DB 工作台 sidebar presence controlled by extension system: enabled → appears; disabled → disappears completely.
- D-10: DDL 导入 gets its own dedicated sidebar nav entry as a first-class built-in feature.

**DDL 导入 Placement:**
- D-11: DDL 导入 is a standalone built-in workspace with its own sidebar nav entry (not a modal, not a header button).
- D-12: Existing `DdlImportWorkspace.tsx` is the foundation. Change is entry point only (header button → sidebar nav entry).
- D-13: Existing `DangerousSqlDialog` from Phase 1 is reused. No new dialog component needed.
- D-14: Requires active database connection. If none active, show "connect first" empty state.

**Extension Management Page:**
- D-15: "扩展功能" routes to a full-screen page replacing main content area (not modal, not drawer).
- D-16: Lists all installed extensions as cards. Phase 4: only DB 工作台 appears.
- D-17: Each card shows: icon, name, version, description, author/source, install date, capabilities/badges, 打开 (Launch) button, 配置 (Config) entry if settings exist.
- D-18: Two distinct action buttons: 禁用 (Disable — reversible, hides from all nav) and 卸载 (Uninstall — removes package).
- D-19: Disabled extensions: sidebar entry, workspace panel, toolbar buttons completely disappear. Written to disk.
- D-20: Uninstall removes the package. Logical removal acceptable for Phase 4 for db-connector.
- D-21: Disable is reversible from management page. Uninstall requires reinstall to recover.

**Enable/Disable Persistence:**
- D-25: Extension enabled/disabled state persisted to disk. Survives app restart.
- D-26: When DB 工作台 is disabled and app relaunches, DB 工作台 nav entry does not appear.

### Claude's Discretion
- Exact extension directory path and format of extension.json manifest
- Whether DB 工作台's "uninstall" is a logical flag or actual file removal in Phase 4
- Extension card visual layout (card grid vs table rows)
- Whether disabled extensions are shown in management page as dimmed vs filtered
- Exact sidebar ordering of DDL 导入 relative to DDL 生成器
- Whether DDL 导入 sidebar entry is always visible or only when a DB connection is active

### Deferred Ideas (OUT OF SCOPE)
- DDL→Excel extension (UIUX not ready, deferred to next version)
- Enum 生成 extension (deferred)
- Extension install from remote / marketplace
- Extension sandbox / permission model
- Schema Diff reorganization
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| IMP-01 | DDL 导入 dialog opens from workbench toolbar (not stray header button); user selects `.sql` file, sees parsed statement list, executes, sees per-statement success/error with line number reference | DdlImportWorkspace.tsx already exists; entry point change only; activeSurface pattern handles routing |
| IMP-02 | Prod connections require typing database name before DDL import proceeds; dangerous statements trigger standard confirmation dialog | DangerousSqlDialog already implemented; previewDangerousSql IPC call already wired |
| IMP-03 | DDL import calls `executeQuery` per statement with `confirmed=true` after user approves in dialog | Existing `executeQuery` IPC + `QueryExecutionRequest.confirmed` field already established |
| EXTUI-01 | Primary sidebar contains no extension-type direct entries (数据库, Schema Diff, DDL→Excel, Enum生成 absent) | Sidebar currently renders `extNavItems` from `useExtensionHost()` but does NOT render them inline — only the 扩展功能 button exists; builtin_extensions/mod.rs contributes nav items for db-connector, schema-diff, ddl-to-excel, etc. |
| EXTUI-02 | Clicking 扩展功能 routes to full-page Extension Management view | Dashboard.tsx already handles `activeSurface` state; new `{ kind: "extensions" }` surface type needed |
| EXTUI-03 | Extension Management lists all extensions as cards with name, description, version, enabled toggle, Open/Launch button | ExtensionPanel.tsx already has data model; convert from Dialog to full-page surface |
| EXTUI-04 | DB 工作台 appears in Extension Management as enabled by default | `ext_list_all` Tauri command already returns db-connector with `enabled: true` when not in disabled list |
| EXTUI-05 | Toggling DB 工作台 off hides workbench entry from all navigation surfaces | `ext_set_enabled` IPC already persists to `extensions_state.json`; `resolveNavigation()` already filters by `enabled`; sidebar needs to render the resolved nav items |
</phase_requirements>

---

## Summary

Phase 4 is a **UI refactor and feature promotion phase** — it has almost no new Rust backend code. The infrastructure needed already exists. The phase work is surgical changes to three areas:

**Area 1 — Sidebar cleanup + DDL 导入 promotion:** The `Sidebar.tsx` already calls `useExtensionHost()` and reads `navigation: extNavItems` but does NOT render them inline — the extension nav items go to `ExtensionPanel` (a dialog). The sidebar currently has a hardcoded 扩展功能 button. The change is: render resolved nav items for enabled extensions in the sidebar, remove the inline DDL import header button, add a DDL 导入 sidebar entry, and ensure the contribution-resolver flow controls what appears. The Rust side must be updated to remove `schema-diff`, `ddl-to-excel`, and `excel-to-java-enum` from contributing nav items — they are built-in features, not extensions.

**Area 2 — Extension Management as full-page surface:** `ExtensionPanel.tsx` is a Dialog today. It uses `useExtensions()` hook and calls `ext_list` Tauri command. The new version reads from `ext_list_all` (which already returns builtin + external with enabled state) and renders as a full-page surface inside `Dashboard.tsx`. `ext_set_enabled` Tauri command already exists and writes `extensions_state.json`. The toggle-and-persist path is fully wired on the Rust side.

**Area 3 — DDL 导入 + dangerous-SQL gate:** `DdlImportWorkspace.tsx` already exists. The missing piece is wiring per-statement execution through the existing `executeQuery` IPC with the `DangerousSqlDialog` guard. The current `DdlImportWorkspace` only does DDL→Excel export (Excel import preview), NOT live database execution. Phase 4 adds the "import against live DB" flow by calling `previewDangerousSql` + `DangerousSqlDialog` + `executeQuery` for each statement.

**Primary recommendation:** Follow the build order: (1) Rust builtin_extensions cleanup — remove extension-type nav items from built-in feature manifests, add db-connector as the only nav-contributing extension; (2) Sidebar renders extension nav items; (3) DDL 导入 sidebar entry + workspace activation; (4) Extension Management full-page surface; (5) DDL import live-DB execution flow.

---

## Standard Stack

### Core (all already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React + wouter | 5.x / existing | Routing, component tree | Already in use; `activeSurface` state pattern established |
| @tanstack/react-query | existing | Server state for `ext_list_all` / `ext_set_enabled` | Already used for all IPC state |
| @tauri-apps/api | v2.x | IPC invoke for extension commands | Existing bridge pattern |
| lucide-react | existing | Icons for extension cards | Already used throughout |
| shadcn/ui (Dialog, Card, Badge, Switch, Button) | existing | UI components for extension page | Already installed, in `components.json` |
| zod | existing | Validates `ResolvedExtension` from `ext_list_all` | Already used in `extension-schema.ts` |

### No New Dependencies
Phase 4 requires **zero new npm or Cargo dependencies**. All needed infrastructure is present:
- `ext_list_all`, `ext_set_enabled`, `ext_get_disabled` Tauri commands: exist in `extensions/commands.rs`
- `DangerousSqlDialog`: exists in `components/extensions/db-workbench/DangerousSqlDialog.tsx`
- `previewDangerousSql`: wired in `host-api-runtime.ts` → `desktopBridge.db.previewDangerousSql`
- `executeQuery`: wired in `host-api-runtime.ts` → `desktopBridge.db.executeQuery`
- `DdlImportWorkspace`: exists in `components/ddl-import/DdlImportWorkspace.tsx`
- `ExtensionPanel`: exists in `components/ExtensionPanel.tsx`
- `useExtensions` hook: exists in `hooks/use-extensions.ts`
- `ext_set_enabled` persists to `extensions_state.json`: fully implemented

**Installation:** No `npm install` or Cargo changes needed.

---

## Architecture Patterns

### Recommended Project Structure (changes only)
```
src-tauri/src/builtin_extensions/
└── mod.rs                    # Remove nav items from schema-diff, ddl-to-excel, enum gen

client/src/
├── components/
│   ├── Sidebar.tsx           # Render extNavItems from useExtensionHost()
│   ├── ddl-import/
│   │   └── DdlImportWorkspace.tsx  # Wire live-DB execution flow
│   └── extension-management/
│       └── ExtensionManagementPage.tsx  # New: full-page view (converted from ExtensionPanel)
├── extensions/
│   └── host-api.ts           # Add MainSurface kind "extensions" if needed
└── pages/
    └── Dashboard.tsx         # Add activeSurface "extensions" case
```

### Pattern 1: activeSurface routing (already established)
**What:** `Dashboard.tsx` maintains `activeSurface: MainSurface` state. Each value maps to a different main content area renderer.
**When to use:** Any new top-level workspace surface.
**Pattern:**
```typescript
// host-api.ts — extend MainSurface union
export type MainSurface =
  | { kind: "workspace" }
  | { kind: "ddl-import" }
  | { kind: "extensions" }                          // NEW in Phase 4
  | { kind: "extension"; extensionId: string; panelId: string };

// Dashboard.tsx — new render case
{activeSurface.kind === "extensions" ? (
  <ExtensionManagementPage onNavigate={setActiveSurface} />
) : ...}
```

### Pattern 2: ext_list_all → resolveNavigation → Sidebar
**What:** The contribution-resolver pipeline already exists. The sidebar already reads from it. The change is to render resolved items inline.
**Current state (CRITICAL observation):** `Sidebar.tsx` line 75 reads `const { navigation: extNavItems } = useExtensionHost()` but does NOT render `extNavItems` in the sidebar body — they are only accessible via `ExtensionPanel`. Phase 4 makes them render inline.
**Pattern:**
```typescript
// Sidebar.tsx — render extNavItems from contribution resolver
{extNavItems.map((navItem) => (
  <Button
    key={navItem.id}
    variant={isActiveExtension(navItem, activeSurface) ? "secondary" : "ghost"}
    className="h-8 w-full justify-start gap-2 rounded-md text-xs"
    onClick={() => onNavigate?.({
      kind: "extension",
      extensionId: navItem.extensionId,
      panelId: navItem.panelId,
    })}
  >
    {/* icon from navItem.icon via getLucideIcon() */}
    {navItem.label}
  </Button>
))}
```

### Pattern 3: builtin_extensions cleanup — remove non-extension nav items
**What:** `builtin_extensions/mod.rs::get_builtin_extensions()` currently declares nav items for `schema-diff`, `ddl-to-excel`, and `excel-to-java-enum`. Under the new model, built-in features do not contribute nav items. Only `db-connector` contributes a nav item (and that only when enabled).
**Change:**
```rust
// src-tauri/src/builtin_extensions/mod.rs
// Remove navigation entries from schema-diff, ddl-to-excel, excel-to-java-enum
// Only db-connector contributes navigation (already does)
// schema-diff, ddl-to-excel, excel-to-java-enum: set navigation: vec![]
```
**Impact:** After this change, `resolveNavigation()` on the frontend returns only `db-connector`'s nav item (when enabled). Schema Diff and DDL→Excel remain accessible via their existing routes or built-in nav entries in the Sidebar header area.

### Pattern 4: ext_set_enabled + cache invalidation
**What:** `ext_set_enabled` already exists. After calling it, the `ext_list_all` TanStack Query cache must be invalidated so the sidebar re-renders.
**Pattern:**
```typescript
// hooks/use-extensions.ts or extension management page
const queryClient = useQueryClient();

async function handleToggleEnabled(id: string, enabled: boolean) {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("ext_set_enabled", { id, enabled });
  // Invalidate so host-context re-fetches and sidebar re-renders
  await queryClient.invalidateQueries({ queryKey: ["extensions", "all"] });
}
```
**Note:** `host-context.tsx` uses `queryKey: ["extensions", "all"]` with `staleTime: 60_000`. Invalidation forces immediate re-fetch.

### Pattern 5: DDL import live-DB execution flow
**What:** `DdlImportWorkspace.tsx` currently handles only DDL→Excel export (parse + export to workbook). Phase 4 adds a parallel flow: execute parsed statements against a live connection. The workspace must detect which mode it is in: "export to Excel" vs "execute against DB".
**Architecture decision for planner:** The simplest approach is a mode toggle or separate tab in `DdlImportWorkspace`. The execution flow:
1. Parse SQL into statements (already done by server-side preview)
2. For each statement: call `previewDangerousSql(connectionId, statement)`
3. If dangerous: show `DangerousSqlDialog`; on confirm set `confirmed=true`
4. Call `executeQuery({ connectionId, sql: statement, confirmed })`
5. Display per-statement result (success/error, row count, elapsed)
**Connection requirement:** Must read from `desktopBridge.db.listConnections()` to pick active connection. If no connections configured, show "connect first" empty state.

### Pattern 6: Extension Management Page as full-screen surface
**What:** Convert `ExtensionPanel.tsx` (a Dialog with limited height) to `ExtensionManagementPage.tsx` (a full-height component rendered in the main content area).
**Structure:**
```
ExtensionManagementPage
├── Header: "扩展功能管理" + subtitle
├── Extension cards (one per ext, Phase 4: only db-connector)
│   ├── Icon + Name + Version badge
│   ├── Description
│   ├── Author / source / install date
│   ├── Capability badges (db.connect, db.query, etc.)
│   ├── Enabled toggle (Switch component — calls ext_set_enabled)
│   ├── 打开 button → sets activeSurface to extension workspace
│   └── 卸载 button → calls ext_uninstall (with confirmation)
└── Empty state for "no extensions" (future-proof)
```

### Anti-Patterns to Avoid
- **Rendering extension nav items OUTSIDE the contribution-resolver pipeline:** Direct hardcoding of nav entries in `Sidebar.tsx` for db-connector must be avoided. All nav items must flow through `resolveNavigation()`.
- **Forgetting cache invalidation after `ext_set_enabled`:** Without invalidating `["extensions", "all"]`, the sidebar does not update until the 60s stale time expires.
- **Creating a new DangerousSqlDialog:** The Phase 1 dialog is already parameterized for DDL import use cases. Do not duplicate it.
- **Treating `schema-diff` as an extension:** It is a built-in feature. Its nav entry in the sidebar is a static entry, not extension-contributed.
- **Blocking `DdlImportWorkspace` DDL execution path behind `confirmed=false`:** The `confirmed` field in `QueryExecutionRequest` is the Rust-layer safety gate. The dangerous-SQL dialog only sets `confirmed=true`. Never pass `confirmed=true` without showing the dialog first for dangerous statements.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Extension enable/disable persistence | Custom config file writer | `ext_set_enabled` + `extensions_state.json` (already in `extensions/commands.rs`) | Already handles file I/O, directory creation, serialization |
| Extension list with enabled state | Custom Rust command | `ext_list_all` (already in `extensions/commands.rs`) | Already merges builtin + external with disabled state |
| Dangerous SQL detection for DDL import | Per-statement regex | `previewDangerousSql(connectionId, sql)` IPC call | sqlparser AST-based detection already handles all 6 danger classes |
| Extension navigation resolution | Direct extNavItems rendering | `resolveNavigation(extensions)` in `contribution-resolver.ts` | Filters disabled, handles order sorting, attaches extensionId |
| Surface routing for Extensions page | React Router setup | Existing `activeSurface` state in `Dashboard.tsx` | Already handles workspace/ddl-import surfaces; extend the union |
| SQL statement splitting | Custom regex splitter | Use the existing server-side preview: `previewDdlImport` returns parsed statements | Already handles semicolons in strings, comments, stored procedure blocks |

**Key insight:** Phase 4 is entirely an integration and wiring phase. Every individual component already exists. The work is connecting them in a new configuration.

---

## Common Pitfalls

### Pitfall 1: Sidebar renders extNavItems but builtin features still contribute nav items
**What goes wrong:** After Phase 4 wires `extNavItems` into the sidebar, `schema-diff`, `ddl-to-excel`, and `enum-gen` nav items appear because they are still declared in `builtin_extensions/mod.rs`.
**Why it happens:** The Rust builtin extension registry declares nav items for these features. The contribution-resolver picks them all up.
**How to avoid:** Remove `navigation` entries from `schema-diff`, `ddl-to-excel`, `excel-to-java-enum` manifests in `mod.rs` FIRST, before wiring the sidebar to render them. Verify with a list of resolved nav items in the browser console.
**Warning signs:** More than one nav item appears in sidebar after Phase 4 (should be only db-connector when enabled).

### Pitfall 2: ext_set_enabled does not immediately update sidebar
**What goes wrong:** User toggles DB 工作台 off in Extension Management. Sidebar still shows 数据库 entry.
**Why it happens:** `useExtensionHost()` caches `ext_list_all` for 60 seconds (`staleTime: 60_000`). Toggle does not invalidate.
**How to avoid:** After calling `ext_set_enabled`, call `queryClient.invalidateQueries({ queryKey: ["extensions", "all"] })` before showing success toast.
**Warning signs:** Sidebar item persists for up to 60 seconds after toggle.

### Pitfall 3: DDL import live execution bypasses dangerous-SQL gate
**What goes wrong:** DROP TABLE or ALTER TABLE in a .sql file executes without confirmation dialog.
**Why it happens:** `executeQuery` with `confirmed=false` throws an error from Rust, but calling with `confirmed=true` without checking is also wrong.
**How to avoid:** For each statement in the batch, call `previewDangerousSql` first. Only set `confirmed=true` after user confirms in `DangerousSqlDialog`. Statements with no dangerous classes are executed with `confirmed=false` (the Rust layer accepts this for non-dangerous SQL).
**Warning signs:** Executing a .sql file with DROP statements silently fails or executes without prompting.

### Pitfall 4: DdlImportWorkspace re-rendering breaks on entry point change
**What goes wrong:** Existing `DdlImportWorkspace` props assume `onActivateFile?: (fileId: number) => void`. The component's entry-point-agnostic design may need adjustment if it references `desktopCapabilities.features.ddlImport` internally.
**Why it happens:** The current component is designed for the header-button case and assumes it can always call `setActiveSurface`. When rendered as a sidebar-activated workspace, the parent is different.
**How to avoid:** Verify `DdlImportWorkspace` does not call `setActiveSurface` directly (it doesn't — it uses `onActivateFile` callback). The component is already clean for this use case.
**Warning signs:** TypeScript errors about missing props when mounting `DdlImportWorkspace` from sidebar nav.

### Pitfall 5: DDL 导入 sidebar entry ignores connection state requirement (D-14)
**What goes wrong:** User clicks "DDL 导入" in sidebar with no connections configured. Component crashes or shows a confusing error.
**Why it happens:** `DdlImportWorkspace` for live execution calls `listConnections()` and then tries to use the first connection. Empty array leads to undefined access.
**How to avoid:** `DdlImportWorkspace` should call `listConnections()` on mount. If empty, render a "まず接続を設定してください" (connect first) empty state with a link/button to DB 工作台 or settings. The `DdlImportWorkspace.tsx` component already has a similar empty-state pattern.
**Warning signs:** JavaScript exceptions when no connections are configured and user opens DDL import.

### Pitfall 6: Schema Diff nav entry disappears after sidebar refactor
**What goes wrong:** After removing extension nav items from the sidebar, Schema Diff's nav item also disappears because it was previously in the extension system.
**Why it happens:** If Schema Diff has a nav item in `builtin_extensions/mod.rs` and the sidebar stops rendering extension nav items by default (or the Rust change removes schema-diff's nav item), the user loses access to Schema Diff.
**How to avoid:** Schema Diff must have a STATIC, hardcoded sidebar entry in `Sidebar.tsx` (or a dedicated built-in nav section), NOT via the extension system. Add it explicitly. Verify before committing.
**Warning signs:** Schema Diff nav entry disappears from sidebar after Phase 4 is applied.

---

## Code Examples

### Example 1: MainSurface extension for Extensions page
```typescript
// client/src/extensions/host-api.ts
// Source: existing pattern in Dashboard.tsx + host-api.ts
export type MainSurface =
  | { kind: "workspace" }
  | { kind: "ddl-import" }
  | { kind: "extensions" }           // Phase 4: new surface for Extension Management
  | { kind: "extension"; extensionId: string; panelId: string };
```

### Example 2: ext_set_enabled with cache invalidation
```typescript
// client/src/components/extension-management/ExtensionManagementPage.tsx
import { useQueryClient } from "@tanstack/react-query";

async function handleSetEnabled(id: string, enabled: boolean) {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke<void>("ext_set_enabled", { id, enabled });
  // extensions, all クエリキャッシュを無効化して sidebar を即時更新
  await queryClient.invalidateQueries({ queryKey: ["extensions", "all"] });
}
```

### Example 3: DDL import live execution per-statement with dangerous-SQL gate
```typescript
// Pseudocode for the execution loop in DdlImportWorkspace.tsx
for (const statement of parsedStatements) {
  // 1. 危険な SQL を事前チェック
  const dangerPreview = await hostApi.connections.previewDangerousSql(
    connectionId, statement.sql
  );

  if (dangerPreview.dangers.length > 0) {
    // 2. DangerousSqlDialog を表示して確認を待つ
    const confirmed = await showDangerousDialog(dangerPreview);
    if (!confirmed) {
      setStatementResult(statement.lineNumber, { status: "skipped" });
      continue;
    }
  }

  // 3. confirmed=true で executeQuery を呼び出す
  const result = await hostApi.connections.executeQuery({
    connectionId,
    sql: statement.sql,
    requestId: generateRequestId(),
    confirmed: dangerPreview.dangers.length > 0,
    maxRows: 0,  // DDL は行を返さない
  });

  setStatementResult(statement.lineNumber, {
    status: result.error ? "error" : "success",
    error: result.error,
    elapsed: result.elapsedMs,
  });
}
```

### Example 4: Sidebar rendering resolved extension nav items
```typescript
// client/src/components/Sidebar.tsx (modified section)
const { navigation: extNavItems } = useExtensionHost();

// 拡張が貢献するナビゲーション項目をレンダリング（builtin feature は除外済み）
{extNavItems.map((navItem) => {
  const Icon = getLucideIcon(navItem.icon) ?? Database;
  const isActive = activeSurface?.kind === "extension" &&
    activeSurface.extensionId === navItem.extensionId;
  return (
    <Button
      key={navItem.extensionId + ":" + navItem.id}
      variant={isActive ? "secondary" : "ghost"}
      className="h-8 w-full justify-start gap-2 rounded-md text-xs"
      onClick={() => onNavigate?.({
        kind: "extension",
        extensionId: navItem.extensionId,
        panelId: navItem.panelId,
      })}
    >
      <Icon className="w-3.5 h-3.5" />
      {navItem.label}
    </Button>
  );
})}
```

### Example 5: Rust builtin_extensions cleanup
```rust
// src-tauri/src/builtin_extensions/mod.rs
// schema-diff の navigation を空にして built-in feature として扱う
BuiltinExtensionManifest {
    id: "schema-diff".to_string(),
    // ... other fields unchanged ...
    contributes: ExtensionContributes {
        navigation: vec![],   // Phase 4: nav item removed — Schema Diff is a built-in feature
        workspace_panels: vec![WorkspacePanel { ... }],  // keep panels for routing
        ..Default::default()
    },
},
// Similarly for ddl-to-excel and excel-to-java-enum
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| DDL 导入 as header button | DDL 导入 as sidebar nav entry (first-class built-in) | Phase 4 | Cleaner UX, consistent with workspace model |
| Extension management as Dialog | Extension management as full-screen page | Phase 4 | Supports C3 card layout with details |
| All extension nav items listed via ExtensionPanel drawer | Only enabled external extension nav items in sidebar | Phase 4 | Sidebar is clean; Extension Management is the single source of truth |
| Built-in features modeled as extensions in Rust | Built-in features have no nav contributions; only external extensions contribute nav items | Phase 4 | Conceptual clarity, enables future extension packaging |

**Deprecated/outdated after Phase 4:**
- `activeSurface.kind === "ddl-import"` triggered by header button: replaced by sidebar nav entry
- `ExtensionPanel.tsx` as Dialog: replaced by `ExtensionManagementPage.tsx` as full-screen surface
- Extension nav items appearing in primary sidebar via extNavItems (currently not rendered): replaced by properly filtered rendering

---

## Open Questions

1. **DDL 导入 connection selector placement**
   - What we know: Requires active DB connection; `listConnections()` IPC exists
   - What's unclear: Whether the user picks the connection inside `DdlImportWorkspace` or if it inherits the "active connection" from the workbench global state
   - Recommendation: Add a connection selector dropdown at the top of `DdlImportWorkspace` when in live-execution mode. This is independent per-component and does not need global state.

2. **DdlImportWorkspace mode separation**
   - What we know: Current component does DDL→Excel export. Phase 4 adds live-DB execution.
   - What's unclear: Whether to use a tab switcher inside the component or split into two workspace modes
   - Recommendation: The simplest approach is a tab at the top of the component: "导出到 Excel" (existing) | "导入到数据库" (new). This avoids creating a second workspace component.

3. **Schema Diff static sidebar entry**
   - What we know: Schema Diff is built-in; its nav item must not disappear
   - What's unclear: Whether it currently relies on `extNavItems` or is hardcoded in Sidebar.tsx
   - Verification: Check `Sidebar.tsx` — the current Sidebar does NOT render `extNavItems` inline. Schema Diff has NO static entry in Sidebar either. It is currently ONLY accessible via `ExtensionPanel`. Phase 4 must add a static Schema Diff entry in Sidebar.tsx explicitly.

4. **DB 工作台 "uninstall" in Phase 4**
   - What we know: `ext_uninstall` in Rust removes from `ExtensionRegistry` (JSON file in app data)
   - What's unclear: db-connector is a builtin, not in `ExtensionRegistry`. `ext_uninstall` would fail for it.
   - Recommendation: For Phase 4, "uninstall" for db-connector = add to disabled list + set a `uninstalled` flag in `extensions_state.json`. Show a "reinstall" placeholder. Actual file removal is meaningless for bundled extensions.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 4 is purely code/config changes with no new external dependencies. All required Tauri commands, IPC bridges, and React components are already present in the codebase.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (detected from vite.config.ts) |
| Config file | vite.config.ts (test section) |
| Quick run command | `npm run check` (TypeScript type checking) |
| Full suite command | `npm run build` (full build validates all types + compilation) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| IMP-01 | DDL import workspace activates from sidebar nav | visual/smoke | human visual | manual-only |
| IMP-02 | DangerousSqlDialog fires for DROP/TRUNCATE/ALTER in DDL import | unit (existing dialog) | `npm run check` (type safety) | existing component |
| IMP-03 | Per-statement execution with confirmed flag | integration | human visual (needs live DB) | manual-only |
| EXTUI-01 | Primary sidebar has no extension-type direct entries | visual/smoke | human visual | manual-only |
| EXTUI-02 | 扩展功能 routes to Extension Management page | visual/smoke | human visual | manual-only |
| EXTUI-03 | Extension cards render correctly | visual/smoke | human visual | manual-only |
| EXTUI-04 | DB 工作台 appears enabled by default | unit (ext_list_all contract) | `npm run check` | Rust command exists |
| EXTUI-05 | Toggle-off hides DB 工作台 from all nav | integration | human visual + restart test | manual-only |

### Sampling Rate
- **Per task commit:** `npm run check` (TypeScript type check)
- **Per wave merge:** `npm run build` (full build)
- **Phase gate:** Full build green + human visual verification of all 5 success criteria before `/gsd:verify-work`

### Wave 0 Gaps
None — existing test infrastructure (type checking + build) covers all automated validation for this phase. Human visual verification is required for all 5 success criteria.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `client/src/components/Sidebar.tsx` (lines 64-76, 668-686)
- Direct codebase inspection: `client/src/pages/Dashboard.tsx` (activeSurface state pattern)
- Direct codebase inspection: `client/src/extensions/host-context.tsx` (ext_list_all query, staleTime)
- Direct codebase inspection: `client/src/extensions/contribution-resolver.ts` (resolveNavigation)
- Direct codebase inspection: `src-tauri/src/extensions/commands.rs` (ext_set_enabled, ext_list_all)
- Direct codebase inspection: `src-tauri/src/builtin_extensions/mod.rs` (current extension manifests)
- Direct codebase inspection: `client/src/components/ExtensionPanel.tsx` (current management dialog)
- Direct codebase inspection: `client/src/components/extensions/db-workbench/DangerousSqlDialog.tsx`
- Direct codebase inspection: `client/src/components/ddl-import/DdlImportWorkspace.tsx`
- Direct codebase inspection: `shared/extension-schema.ts` (ResolvedExtension type)
- Direct codebase inspection: `.planning/phases/04-ddl-import-and-extension-management-v1_4/04-CONTEXT.md`

### Secondary (MEDIUM confidence)
- `docs/extension-boundary-spec.md` — Normative extension boundary rules confirmed from codebase

### Tertiary (LOW confidence)
- None

---

## Project Constraints (from CLAUDE.md)

| Directive | Source | Impact on Phase 4 |
|-----------|--------|-------------------|
| Path aliases: `@/` → `client/src/`, `@shared/` → `shared/` | CLAUDE.md | All new imports must use aliases |
| `shared/routes.ts` for API contracts (Zod schemas) | CLAUDE.md | Any new Tauri command parameters must use typed contracts |
| No global state library | CLAUDE.md | Extension toggle state flows through TanStack Query + activeSurface state |
| Zero magic values — constants/enums for business values | global RULES.md | `"extensions"` surface kind must be a typed constant in the MainSurface union |
| Max nesting depth 3 | global RULES.md | Extension management page render logic should use guard clauses |
| Comments explain WHY not WHAT | global RULES.md | Comment the conceptual model shift in builtin_extensions/mod.rs |
| No TODO comments or stub functions | global RULES.md | Extension Management page must be complete (not placeholder) |
| Use feature branches, never main | global RULES.md | Work on `claude/gracious-saha` branch (already active) |
| Commit format: `[type] description` | global RULES.md | Use `feat(04)` prefix for Phase 4 commits |
| No Co-Authored-By trailers | global RULES.md | Clean commit messages only |

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies; all assessed from direct codebase reading
- Architecture: HIGH — all patterns verified from existing code; no speculation
- Pitfalls: HIGH — traced from actual code (staleTime value, missing nav item rendering, etc.)
- DDL execution flow: MEDIUM — `DdlImportWorkspace` live execution is new logic; exact implementation requires task-level design

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable codebase; no fast-moving external dependencies)
