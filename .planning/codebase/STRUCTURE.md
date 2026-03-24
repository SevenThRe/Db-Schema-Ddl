# Codebase Structure

**Analysis Date:** 2026-03-24

## Directory Layout

```
Db-Schema-Ddl/
├── client/                  # React frontend (Tauri WebView)
│   ├── public/              # Static assets served directly
│   └── src/
│       ├── components/      # UI components organized by feature
│       │   ├── ddl/         # DDL generation sub-components
│       │   ├── ddl-import/  # DDL reverse-import workspace
│       │   ├── diff-viewer/ # Schema diff display components
│       │   ├── extensions/  # Builtin extension workspace UIs
│       │   ├── settings/    # Settings panel sections
│       │   ├── templates/   # Workbook template UI
│       │   └── ui/          # shadcn/ui primitive components
│       ├── extensions/      # Extension host system
│       │   └── builtin/     # Builtin panel registration
│       ├── hooks/           # Custom React hooks (use-ddl.ts, etc.)
│       ├── i18n/
│       │   └── locales/     # ja.json, zh.json translation files
│       ├── lib/             # Utilities and bridge layer
│       ├── pages/           # Top-level route components
│       ├── status-bar/      # StatusBar context and types
│       └── types/           # Ambient TypeScript declarations
├── shared/                  # TypeScript types shared by frontend (and legacy server)
├── src-tauri/               # Rust Tauri backend
│   ├── capabilities/        # Tauri capability JSON files (IPC permission sets)
│   ├── gen/schemas/         # Auto-generated Tauri schema JSONs
│   ├── icons/               # App icon assets
│   └── src/
│       ├── builtin_extensions/  # Rust logic for builtin extensions (enum_gen)
│       ├── db_connector/        # MySQL/PostgreSQL connector and introspection
│       ├── extensions/          # External extension system (sidecar)
│       │   ├── commands.rs      # Tauri commands: ext_list, ext_install, ext_call, etc.
│       │   ├── github.rs        # GitHub release catalog fetching
│       │   ├── lifecycle.rs     # Install/uninstall state machine
│       │   ├── manifest.rs      # manifest.json parsing and validation
│       │   ├── mod.rs           # Module exports, ExtensionError type
│       │   ├── process.rs       # Sidecar child process management
│       │   ├── proxy.rs         # HTTP proxy: ext_call → sidecar HTTP
│       │   └── registry.rs      # Installed extension persistent registry
│       ├── commands.rs          # All core Tauri command handlers
│       ├── constants.rs         # App-wide Rust constants
│       ├── ddl.rs               # DDL generation (MySQL + Oracle dialects)
│       ├── ddl_import.rs        # SQL DDL text parsing → table catalog
│       ├── ddl_import_export.rs # Catalog → Excel workbook export
│       ├── excel.rs             # Excel file parsing (calamine, generator pattern)
│       ├── lib.rs               # Tauri app setup, plugin registration, invoke_handler
│       ├── main.rs              # Binary entry point (delegates to lib::run)
│       ├── models.rs            # Core Rust data types (TableInfo, DdlSettings, etc.)
│       ├── name_fix.rs          # Physical name fix plan computation
│       ├── name_fix_apply.rs    # Physical name fix plan application → xlsx
│       ├── schema_diff.rs       # Excel-to-Excel schema diff engine
│       ├── storage.rs           # SQLite persistence (rusqlite), file storage
│       └── workbook_templates.rs # Seed workbook template generation
├── docs/                    # Architecture and design documents
├── docs-site/               # Docusaurus documentation site (separate build)
├── test/                    # Test suites
│   ├── client/              # Frontend tests
│   ├── electron/            # Electron smoke tests (legacy)
│   ├── server/              # Server-side unit tests
│   └── shared/              # Shared logic tests
├── script/                  # Developer utility scripts (e.g., inspect_excel.ts)
├── .planning/               # GSD planning documents
│   ├── codebase/            # Codebase analysis docs (ARCHITECTURE.md, etc.)
│   └── phases/              # Phase implementation plans
├── .github/workflows/       # CI/CD GitHub Actions
├── artifacts/               # Build smoke test artifacts
├── attached_assets/         # Test Excel files for development
├── claudedocs/              # Claude analysis reports
├── data/                    # SQLite database backups
├── dist/                    # Vite frontend build output (dist/public/)
├── dist-electron/           # Legacy Electron build output
├── mcp/                     # MCP server integration
├── output/                  # Playwright test output
├── release/                 # Tauri release build artifacts
├── uploads/                 # User-uploaded Excel files (not in git)
│   └── name-fix-reports/    # Generated name fix report files
├── CLAUDE.md                # Project-specific Claude Code instructions
├── package.json             # Node dependencies and npm scripts
├── tsconfig.json            # TypeScript config with path aliases
└── vite.config.ts           # Vite build config with @/ and @shared/ aliases
```

## Directory Purposes

**`client/src/components/`:**
- Purpose: All React UI components, organized by feature domain
- Key files:
  - `Sidebar.tsx` — file list, upload, file management actions
  - `SheetSelector.tsx` — sheet list for selected file
  - `TablePreview.tsx` — parsed column grid display
  - `DdlGenerator.tsx` — dialect selector and DDL output panel
  - `SchemaDiffPanel.tsx` — file-to-file and DB-to-file diff viewer
  - `StatusBar.tsx` — bottom status bar rendering (new, untracked)
  - `UpdateNotifier.tsx` — auto-update notification banner
  - `SpreadsheetViewer.tsx` — raw Excel cell grid view
  - `SearchDialog.tsx` — cross-file table/column search
  - `ddl-import/DdlImportWorkspace.tsx` — SQL DDL reverse import UI
  - `extensions/DbConnectorWorkspace.tsx` — DB connection manager panel
  - `extensions/DdlToExcelWorkspace.tsx` — DDL-to-Excel conversion panel
  - `extensions/EnumGenWorkspace.tsx` — enum definition generator panel

**`client/src/extensions/`:**
- Purpose: Extension host system — manifest resolution, HostApi, panel registry, contribution resolver
- Key files:
  - `host-context.tsx` — `ExtensionHostProvider` and `useExtensionHost()`, `useHostApi()`, `useHostApiFor()` hooks
  - `host-api.ts` — `HostApi` interface definition (notifications, connections, statusBar)
  - `host-api-runtime.ts` — `createHostApi()` factory that enforces capability scoping
  - `contribution-resolver.ts` — filters enabled extensions, extracts nav/panels/settings/actions
  - `panel-registry.ts` — in-memory panel ID → React component map
  - `ExtensionWorkspaceHost.tsx` — renders the active extension workspace panel
  - `builtin/register-all.tsx` — registers all builtin panel components at app boot

**`client/src/status-bar/`:**
- Purpose: Status bar state management (new addition, untracked in git)
- Key files:
  - `context.tsx` — `StatusBarProvider`, `useStatusBarController()`, `useStatusBarScope()` hooks
  - `types.ts` — `StatusBarEntry`, `StatusBarEntryInput`, `StatusBarController` types

**`client/src/lib/`:**
- Purpose: Shared utilities and the Tauri bridge layer
- Key files:
  - `desktop-bridge.ts` — main Tauri IPC facade; all `invoke()` calls go through here
  - `physical-name-utils.ts` — display utilities for physical name fix results
  - `queryClient.ts` — TanStack Query client singleton

**`client/src/pages/`:**
- Purpose: Route-level page components
- Key files:
  - `Dashboard.tsx` — main workspace with resizable panel layout
  - `Settings.tsx` — settings page with extension-contributed sections
  - `not-found.tsx` — 404 fallback

**`shared/`:**
- Purpose: TypeScript type definitions and Zod schemas shared between frontend and any server-side layer
- Key files:
  - `schema.ts` — core model types: `UploadedFile`, `TableInfo`, `DdlSettings`, `DbConnectionConfig`, `DbSchemaSnapshot`, `DbSchemaDiffResult`, request/response schemas for all commands
  - `extension-schema.ts` — `ExtensionManifestV2`, `ResolvedExtension`, `ExtensionContributes`, capability enum
  - `config.ts` — `APP_DEFAULTS` and `DEFAULT_DDL_SETTINGS_VALUES` constants
  - `physical-name.ts` — shared physical name normalization logic
  - `desktop-runtime.ts` — runtime capability detection types
  - `error-codes.ts` — shared error code constants

**`src-tauri/src/extensions/`:**
- Purpose: Full lifecycle management for external (sidecar) extensions
- Contains: Download from GitHub releases, SHA256 verification, registry persistence in SQLite, subprocess start/stop/health, HTTP proxy for `ext_call`

**`src-tauri/src/builtin_extensions/`:**
- Purpose: Rust logic for builtin extensions that run in-process
- Contains: `enum_gen.rs` — parses enum definition sheets, generates Java/TypeScript enum code

**`src-tauri/src/db_connector/`:**
- Purpose: Live database connectivity
- Contains: `mod.rs` — config persistence and routing; `commands.rs` — Tauri commands; `introspect.rs` — MySQL/PostgreSQL information schema queries

**`docs/`:**
- Purpose: Design and specification documents for the project
- Key files:
  - `extension-boundary-spec.md` — normative rules for the extension system (manifest alignment, capability model, onboarding checklist)
  - `db-workbench-extension-design.md` — DB workbench extension design (new, untracked)

**`test/`:**
- Purpose: Test suites organized by layer
- `test/shared/` — unit tests for shared logic (physical-name, etc.)
- `test/server/` — server-side unit tests (Excel parsing, DDL generation)
- `test/client/` — frontend component tests
- `test/electron/` — legacy Electron smoke tests

## Key File Locations

**Entry Points:**
- `src-tauri/src/main.rs`: Rust binary entry, delegates to `lib::run()`
- `src-tauri/src/lib.rs`: Tauri app builder, all command registrations
- `client/src/main.tsx`: React app mount
- `client/src/App.tsx`: Provider tree, routing

**Configuration:**
- `tsconfig.json`: TypeScript config with `@/` → `client/src/` and `@shared/` → `shared/` path aliases
- `vite.config.ts`: Vite config with matching resolve aliases
- `src-tauri/Cargo.toml`: Rust dependencies
- `src-tauri/capabilities/`: Tauri IPC permission capability files
- `shared/config.ts`: Application defaults and feature flags

**Core Logic:**
- `src-tauri/src/excel.rs`: Excel file parsing with generator pattern
- `src-tauri/src/ddl.rs`: DDL generation, dual-dialect (MySQL/Oracle)
- `src-tauri/src/schema_diff.rs`: Schema diff engine with rename detection
- `src-tauri/src/ddl_import.rs`: SQL DDL text → table catalog parser
- `src-tauri/src/storage.rs`: SQLite operations for all persistent data
- `src-tauri/src/models.rs`: Core Rust data types (Serde serializable)
- `client/src/lib/desktop-bridge.ts`: All Tauri IPC call wrappers

**Testing:**
- `test/server/` — server/Rust-equivalent tests
- `test/shared/` — shared logic tests

## Naming Conventions

**Files:**
- React components: PascalCase `.tsx` (e.g., `DdlGenerator.tsx`, `SchemaDiffPanel.tsx`)
- Hooks: `use-` prefix, kebab-case `.ts` (e.g., `use-ddl.ts`)
- Utilities/lib: kebab-case `.ts` (e.g., `desktop-bridge.ts`, `physical-name-utils.ts`)
- Rust modules: snake_case `.rs` (e.g., `ddl_import_export.rs`, `name_fix_apply.rs`)

**Directories:**
- Frontend feature directories: kebab-case (e.g., `ddl-import/`, `diff-viewer/`, `status-bar/`)
- Rust module directories: snake_case (e.g., `builtin_extensions/`, `db_connector/`, `extensions/`)

## Where to Add New Code

**New Tauri command (backend operation):**
- Add `#[tauri::command]` function to `src-tauri/src/commands.rs`
- Register in `invoke_handler` in `src-tauri/src/lib.rs`
- Add typed wrapper method to `client/src/lib/desktop-bridge.ts`
- Add TypeScript request/response types to `shared/schema.ts`

**New feature component:**
- Implementation: `client/src/components/{feature-name}/` directory or directly in `client/src/components/` for standalone components
- Tests: `test/client/`

**New builtin extension panel:**
- Rust logic: `src-tauri/src/builtin_extensions/{name}.rs` + register in `src-tauri/src/builtin_extensions/mod.rs`
- React workspace component: `client/src/components/extensions/{Name}Workspace.tsx`
- Register panel: add `registerPanel(...)` call in `client/src/extensions/builtin/register-all.tsx`
- Manifest entry: add to builtin manifests returned by `ext_list_builtin` in `commands.rs`

**New shared type:**
- Add Zod schema + inferred TypeScript type to `shared/schema.ts`
- Add matching Rust struct with `#[derive(serde::Serialize, serde::Deserialize)]` to `src-tauri/src/models.rs`

**New route/page:**
- Implementation: `client/src/pages/{Name}.tsx`
- Register route in `client/src/App.tsx` Router component

**Utilities:**
- Shared frontend helpers: `client/src/lib/`
- Rust helpers that don't fit a domain module: `src-tauri/src/constants.rs` for constants

## Special Directories

**`uploads/`:**
- Purpose: User-uploaded Excel files stored by Tauri app data dir path
- Generated: Yes (at runtime)
- Committed: No (`.gitignore`)

**`dist/`:**
- Purpose: Vite frontend build output (`dist/public/`)
- Generated: Yes (`npm run build`)
- Committed: No

**`dist-electron/` and `release/`:**
- Purpose: Legacy Electron and Tauri release build artifacts
- Generated: Yes
- Committed: No

**`.planning/`:**
- Purpose: GSD planning and codebase analysis documents
- Generated: By GSD commands
- Committed: Yes

**`src-tauri/gen/`:**
- Purpose: Auto-generated Tauri schema files (capability JSON schemas)
- Generated: Yes (by Tauri build toolchain)
- Committed: Yes (checked in for IDE support)

**`data/`:**
- Purpose: SQLite database backups
- Generated: Manually
- Committed: Yes (backup snapshots)

---

*Structure analysis: 2026-03-24*
