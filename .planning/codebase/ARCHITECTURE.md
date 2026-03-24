# Architecture

**Analysis Date:** 2026-03-24

## Pattern Overview

**Overall:** Tauri desktop application — React frontend (WebView) communicating with a Rust backend via Tauri `invoke` IPC. No HTTP server in production; all data operations happen in-process within the Rust binary.

**Key Characteristics:**
- All backend logic lives in Rust (`src-tauri/src/`); the React frontend is a static WebView loaded by Tauri
- Frontend calls Rust commands through `@tauri-apps/api/core` `invoke()` — there is no fetch/REST layer in the desktop build
- Shared TypeScript types in `shared/` are consumed by the frontend only; Rust has its own parallel model types in `src-tauri/src/models.rs`
- An extension plugin system (V2) supports both builtin (in-process React + Rust) and external (sidecar subprocess) extensions
- A `desktopBridge` abstraction in `client/src/lib/desktop-bridge.ts` wraps all Tauri invocations, allowing the same component code to run in a web-only dev mode

## Layers

**Frontend UI Layer:**
- Purpose: React components rendering the workspace, routing, and extension panels
- Location: `client/src/`
- Contains: Pages, feature components, extension host, status bar, i18n, hooks
- Depends on: `@tauri-apps/api/core` via `desktop-bridge.ts`, `@shared/schema` for types
- Used by: End user

**Desktop Bridge:**
- Purpose: Single abstraction that wraps every `invoke()` call to Rust; detects Tauri vs. web runtime at init
- Location: `client/src/lib/desktop-bridge.ts`
- Contains: Typed wrappers for every Tauri command category (files, ddl, settings, diff, db connector)
- Depends on: `@tauri-apps/api/core`
- Used by: All feature components and hooks

**Tauri Command Layer:**
- Purpose: Rust functions decorated with `#[tauri::command]` — entry points from frontend `invoke()` calls
- Location: `src-tauri/src/commands.rs`, `src-tauri/src/extensions/commands.rs`, `src-tauri/src/db_connector/commands.rs`
- Contains: Request deserialization, argument validation, delegation to domain modules
- Depends on: All Rust domain modules
- Used by: Tauri `invoke_handler` registered in `src-tauri/src/lib.rs`

**Rust Domain Modules:**
- Purpose: Core business logic — Excel parsing, DDL generation, schema diff, import/export, name fix, storage
- Location: `src-tauri/src/`
- Contains: `excel.rs`, `ddl.rs`, `ddl_import.rs`, `ddl_import_export.rs`, `schema_diff.rs`, `name_fix.rs`, `name_fix_apply.rs`, `workbook_templates.rs`, `storage.rs`
- Depends on: SQLite (via `rusqlite`) for metadata persistence, `calamine` for Excel reading, `xlsxwriter` for Excel writing
- Used by: Command layer

**Extension System:**
- Purpose: Plugin architecture supporting builtin (compiled-in) and external (sidecar process) extensions
- Location: `src-tauri/src/extensions/` (Rust), `client/src/extensions/` (frontend)
- Contains: Manifest parsing, registry, lifecycle state machine, process manager, HTTP proxy to sidecar
- Depends on: `src-tauri/src/builtin_extensions/` for builtin extension logic; `ProcessManager` managed as Tauri app state
- Used by: Command layer (ext_* commands), frontend `ExtensionHostProvider`

**Shared Types:**
- Purpose: TypeScript Zod schemas and type definitions shared between frontend and any future web-compatible layer
- Location: `shared/`
- Contains: `schema.ts` (core data models), `extension-schema.ts` (extension manifest V2), `config.ts` (app defaults), `physical-name.ts`, `desktop-runtime.ts`, `error-codes.ts`
- Depends on: `zod`
- Used by: Frontend exclusively in the desktop build

## Data Flow

**Excel Import and Parse Flow:**

1. User drops/selects `.xlsx` file in `Sidebar` component
2. Frontend reads file bytes, base64-encodes, calls `desktopBridge.importExcelFile()`
3. `desktop-bridge.ts` invokes Rust command `files_import_excel`
4. `commands.rs`: decodes base64 → validates Excel via temp file in app cache dir → calls `storage::import_excel_file()` → stores file on disk under app data dir and records metadata in SQLite
5. Frontend TanStack Query invalidates `files` query key → Sidebar re-renders with new file
6. User selects file → `files_get_sheets` invoked → `excel::list_sheet_summaries()` scans sheets
7. User selects sheet → `files_get_table_info` invoked → `excel::list_table_info()` runs generator pattern to detect table boundaries
8. `TablePreview` component renders parsed `TableInfo[]`

**DDL Generation Flow:**

1. User clicks generate in `DdlGenerator` component
2. `desktopBridge.generateDdlByReference()` invokes `ddl_generate_by_reference`
3. `commands.rs`: resolves selected tables from Excel via `resolve_tables_by_reference()` → calls `ddl::generate_ddl_response()`
4. `ddl.rs`: dispatches to `generateMySQL()` or `generateOracle()` based on `dialect` field → returns `DdlGenerationResponse` with SQL string
5. Frontend displays result; user can export ZIP via `ddl_export_zip_by_reference`

**Schema Diff Flow:**

1. User selects two files in `SchemaDiffPanel`
2. `diff_preview` command invoked with `new_file_id`, `old_file_id`, `mode`, `scope`
3. `schema_diff::compute_diff()` parses both Excel files, compares table/column structures, detects renames via similarity scoring
4. Returns `DiffPreviewResponse` with added/removed/modified/renamed sets plus a `diff_id` stored in SQLite
5. User confirms rename decisions via `diff_confirm` → decisions stored
6. `diff_alter_preview` generates `ALTER TABLE` SQL from confirmed diff

**DDL Import Flow:**

1. User pastes SQL DDL text in `DdlImportWorkspace`
2. `ddl_import_preview` command: `ddl_import::preview_ddl_import()` parses SQL → returns `DdlImportPreviewResponse` with table catalog and issue list
3. User confirms → `ddl_import_export_workbook` re-parses SQL, calls `ddl_import_export::export_workbook_from_ddl()` → generates `.xlsx` and imports it into storage
4. New file appears in Sidebar

**Extension Contribution Flow:**

1. App boot: `registerBuiltinPanels()` populates in-memory `panel-registry.ts` with React component references keyed by panel ID string
2. `ExtensionHostProvider` invokes `ext_list_all` Rust command → receives `ResolvedExtension[]` (builtin + external, with enabled state)
3. `contribution-resolver.ts` filters enabled extensions and extracts navigation items, workspace panels, settings sections, context actions
4. `Dashboard` renders dynamic navigation entries from `useExtensionHost().navigation`
5. Clicking a nav entry sets `MainSurface` state to `{ kind: "extension", extensionId, panelId }`
6. `ExtensionWorkspaceHost` looks up `panelId` in `panel-registry` and renders matching React component

**DB Connector / Live DB Flow:**

1. `DbConnectorWorkspace` (builtin extension panel) manages `DbConnectionConfig` records
2. `db_conn_save` / `db_conn_list` / `db_conn_test` commands persist configs in SQLite via `db_connector` module
3. `db_introspect` connects to MySQL/PostgreSQL, reads information schema → returns `DbSchemaSnapshot`
4. `db_diff` compares two snapshots → returns `DbSchemaDiffResult`
5. Results shown in `SchemaDiffPanel` with same diff viewer used for file-to-file diffs

**State Management:**
- Server/backend state: TanStack React Query — all Tauri invocations that return lists are cached under stable query keys (`staleTime: 60_000` for extension list)
- UI state: React `useState` in `Dashboard` — selected file ID, selected sheet name, current `MainSurface`, panel collapse flags
- Persistent UI preferences: `localStorage` — last selected file/sheet (keyed by file hash), sidebar collapse state
- Extension state: `ExtensionHostContext` (React Context wrapping TanStack Query result)
- Status bar state: `StatusBarProvider` React Context with scoped entries; entries expire by TTL

## Key Abstractions

**`desktopBridge` (`client/src/lib/desktop-bridge.ts`):**
- Purpose: Typed facade over all Tauri `invoke()` calls; provides runtime capability detection
- Pattern: Singleton object with async methods; detects `window.__DB_SCHEMA_DDL_TAURI_BRIDGE_READY__` at init

**`HostApi` (`client/src/extensions/host-api.ts`):**
- Purpose: Interface that extensions use to reach host capabilities (notifications, DB connections, status bar)
- Interfaces: `NotificationsApi`, `ConnectionsApi`, `StatusBarApi`
- Pattern: Created per-extension via `createHostApi()` in `host-api-runtime.ts`; scoped to declared `capabilities[]` from manifest; methods for undeclared capabilities return noop or rejected Promise — fail-closed
- Usage: `useHostApi()` for internal host use; `useHostApiFor(extensionId)` for capability-scoped access

**`ExtensionManifestV2` (`shared/extension-schema.ts`):**
- Purpose: Unified manifest schema for both builtin and external extensions
- Key fields: `id` (kebab-case), `kind` (builtin|external), `capabilities[]` (db.connect, db.query, db.schema.read, db.schema.apply), `contributes` (navigation, workspacePanels, settingsSections, contextActions)
- Rust parallel: `src-tauri/src/extensions/manifest.rs`

**`ResolvedExtension` (`shared/extension-schema.ts`):**
- Purpose: Runtime extension state sent from Rust to frontend — manifest + `enabled` flag + lifecycle stage + pid + port + error
- Used by: `ExtensionHostProvider` to populate context consumed by contribution resolver

**`TableInfo` (Rust: `src-tauri/src/models.rs`, TypeScript: `shared/schema.ts`):**
- Purpose: Central data structure representing a parsed database table (logical name, physical name, columns with types/constraints/PK markers)
- Flows: Excel parse → DDL generation, schema diff, import/export, name fix

**Panel Registry (`client/src/extensions/panel-registry.ts`):**
- Purpose: In-memory map from panel ID string to React component constructor
- Pattern: `registerPanel(id, Component)` called once at boot in `registerBuiltinPanels()`; `lookupPanel(id)` used by `ExtensionWorkspaceHost` to dynamically render correct workspace

## Entry Points

**Tauri Application Entry:**
- Location: `src-tauri/src/main.rs` → delegates to `src-tauri/src/lib.rs::run()`
- Triggers: Application launch
- Responsibilities: Plugin registration (updater, dialog, opener, log), `ProcessManager` initialization as managed state, full `invoke_handler` binding for all commands

**React Application Entry:**
- Location: `client/src/main.tsx` (Vite entry point)
- Responsibilities: Mount React tree, initialize i18n

**`App.tsx` (`client/src/App.tsx`):**
- Responsibilities: Provider tree setup (ThemeProvider → QueryClientProvider → TooltipProvider → StatusBarProvider → ExtensionHostProvider), runtime probe via `desktopBridge`, routing via wouter (`/` → Dashboard, `/settings` → Settings)

**`Dashboard.tsx` (`client/src/pages/Dashboard.tsx`):**
- Responsibilities: Main workspace layout with `react-resizable-panels`, surface switching (workspace / ddl-import / extension), file and sheet selection state, `StatusBar` rendering at page bottom

## Error Handling

**Strategy:** Rust commands return `Result<T, String>` — errors serialized as plain strings propagated to frontend via Tauri IPC.

**Patterns:**
- Rust: `command_error(action, error)` helper formats `"Failed to {action}: {error}"` strings
- Frontend: TanStack Query error callbacks call `toast({ variant: "destructive", ... })`
- Extension system: `ExtensionError` enum with `thiserror`; serialized to string for IPC transport
- Capability enforcement: `createHostApi()` returns noop stubs / rejected Promises for undeclared capabilities — fail-closed, no panics

## Cross-Cutting Concerns

**Logging:** `tauri_plugin_log` in debug builds at Info level; `console.info` for frontend runtime diagnostics

**Validation:** Zod schemas in `shared/` for TypeScript type safety; `rusqlite` constraints + manual checks in Rust; Excel files validated by attempting `calamine` parse before import is committed

**Authentication:** Not applicable — local desktop app, no user accounts

**Internationalization:** `react-i18next` with locale JSON files in `client/src/i18n/locales/` (ja.json, zh.json); English strings serve as translation keys (no en.json file)

**Auto-update:** `tauri_plugin_updater` for in-app auto-install; HTTP redirect fallback to GitHub releases page for version comparison when the updater endpoint is unavailable

---

*Architecture analysis: 2026-03-24*
