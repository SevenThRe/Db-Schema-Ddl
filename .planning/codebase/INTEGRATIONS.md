# External Integrations

**Analysis Date:** 2026-03-24

## Tauri IPC — Frontend to Rust Backend

All communication between the React WebView and the Rust backend uses the Tauri invoke mechanism. There is no HTTP server or REST API; every operation is a named Tauri command.

**Invoke utility (`client/src/lib/desktop-bridge.ts`):**
```typescript
async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import("@tauri-apps/api/core");
  return await mod.invoke<T>(command, args);
}
```

**Bridge detection:**
- `window.__DB_SCHEMA_DDL_TAURI_BRIDGE_READY__` and `globalThis.isTauri` are injected on page load via `lib.rs` `on_page_load` hook
- `client/src/lib/desktop-capabilities.ts` reads these flags to determine the active runtime

**Binary payloads:**
- Binary data (file uploads, ZIP exports) is encoded as base64 strings for IPC transfer
- Helpers `bytesToBase64` and `base64ToBlob` live in `client/src/lib/desktop-bridge.ts`

**Registered Tauri commands (registered in `src-tauri/src/lib.rs`):**

| Category | Commands |
|---|---|
| Core | `core_get_app_version`, `core_get_runtime_diagnostics`, `core_get_process_metrics`, `core_write_binary_file` |
| Files | `files_list`, `files_list_templates`, `files_create_from_template`, `files_import_excel`, `files_remove`, `files_get_sheets`, `files_get_search_index`, `files_get_table_info`, `files_get_sheet_data`, `files_parse_region` |
| DDL | `ddl_generate`, `ddl_generate_by_reference`, `ddl_export_zip`, `ddl_export_zip_by_reference` |
| DDL Import | `ddl_import_preview`, `ddl_import_export_workbook` |
| Settings | `settings_get`, `settings_update` |
| Name Fix | `name_fix_preview`, `name_fix_apply` |
| Schema Diff | `diff_preview`, `diff_confirm`, `diff_alter_preview` |
| DB Connector | `db_conn_list`, `db_conn_save`, `db_conn_delete`, `db_conn_test`, `db_introspect`, `db_diff` |
| Extensions | `ext_list`, `ext_get`, `ext_fetch_catalog`, `ext_install`, `ext_uninstall`, `ext_start`, `ext_stop`, `ext_health`, `ext_call`, `ext_list_all`, `ext_set_enabled`, `ext_get_disabled`, `ext_list_builtin` |
| Enum Gen | `enum_gen_preview`, `enum_gen_export` |
| Updater | `update_check`, `update_download_and_install` |

**Tauri plugins loaded at startup (`src-tauri/src/lib.rs`):**
- `tauri_plugin_updater` — auto-update lifecycle
- `tauri_plugin_dialog` — file open/save dialogs
- `tauri_plugin_opener` — OS-level URL/file opener
- `tauri_plugin_log` — structured log output (debug builds only)

**Frontend plugin wrappers in `client/src/lib/desktop-bridge.ts`:**
- `@tauri-apps/plugin-dialog` — `open()` for directory/Excel file selection, `save()` for file save dialog
- `@tauri-apps/plugin-opener` — `openUrl()`, `revealItemInDir()`

---

## GitHub — Auto-Updater

**Purpose:** Application self-update distribution.

**Mechanism:**
- `tauri-plugin-updater` polls a GitHub Releases JSON endpoint
- Update manifest URL: `https://github.com/SevenThRe/Db-Schema-Ddl/releases/latest/download/update.json`
- Configured in `src-tauri/tauri.conf.json` under `plugins.updater`
- Signature verification uses a minisign public key embedded in `tauri.conf.json`

**Frontend surface (`client/src/lib/desktop-bridge.ts` — `updater` namespace):**
- `desktopBridge.updater.check()` — invokes `update_check` command
- `desktopBridge.updater.downloadAndInstall()` — invokes `update_download_and_install` command
- UI component: `client/src/components/UpdateNotifier.tsx`

**Rust implementation:**
- `src-tauri/src/commands.rs` — `update_check`, `update_download_and_install` handlers

---

## GitHub — Extension Catalog

**Purpose:** Fetch and install external extensions from a separate repository.

**Repository:** `SevenThRe/Db-Schema-Ddl-Extensions`

**API base:** `https://api.github.com`

**Mechanism (`src-tauri/src/extensions/github.rs`):**
1. `GET /repos/SevenThRe/Db-Schema-Ddl-Extensions/releases/latest` — fetch latest release metadata
2. Asset naming convention: `{extension-id}-{version}-{platform}.zip`
3. SHA-256 checksum asset: `{extension-id}-{version}-{platform}.zip.sha256`
4. Download with streaming progress via `reqwest` byte stream
5. Verify SHA-256 before writing to disk

**Authentication:** No auth token — public GitHub API with `User-Agent: Db-Schema-DDL` header

**Rate limits:** Subject to GitHub unauthenticated API rate limits (60 req/hour)

**Frontend commands:** `ext_fetch_catalog`, `ext_install` (invoke via `desktopBridge`)

---

## External Database Connectivity (DB Connector)

**Purpose:** Connect to user-configured MySQL or PostgreSQL instances to introspect live schemas and perform diffs.

**Rust implementation:** `src-tauri/src/db_connector.rs`

**Library:** sqlx 0.8 with `mysql` and `postgres` features, async runtime via tokio

**Commands:**
- `db_conn_list` — list saved connection configs from SQLite
- `db_conn_save` — persist a connection config (credentials stored locally in SQLite)
- `db_conn_delete` — remove a saved connection
- `db_conn_test` — test connectivity by opening and closing a connection
- `db_introspect` — introspect live schema, returns `DbSchemaSnapshot`
- `db_diff` — diff two live connections, returns `DbSchemaDiffResult`

**TypeScript types (`shared/schema.ts`):**
- `DbConnectionConfig` — connection parameters
- `DbSchemaSnapshot` — introspected schema representation
- `DbSchemaDiffResult` — diff result between two schemas

**Frontend surface (`client/src/lib/desktop-bridge.ts` — `db` namespace):**
```typescript
desktopBridge.db.listConnections()
desktopBridge.db.saveConnection(config)
desktopBridge.db.deleteConnection(id)
desktopBridge.db.testConnection(config)
desktopBridge.db.introspect(connectionId)
desktopBridge.db.diff(sourceConnectionId, targetConnectionId)
```

---

## Extension Plugin System — Sidecar IPC

**Purpose:** Launch and communicate with external extension processes (sidecar architecture).

**Process lifecycle (`src-tauri/src/extensions/process.rs`):**
1. Extension binary is spawned as a child process via `tokio::process::Command`
2. Host reads stdout waiting for `READY port=<N>` (15-second timeout)
3. Health checks poll `GET http://127.0.0.1:{port}/health` (3-second timeout)
4. Stop: `child.kill()` via tokio

**Communication:** HTTP on loopback (`127.0.0.1:{dynamic-port}`) — not WebSocket, not shared memory

**Proxy:** Extension API calls are proxied through `src-tauri/src/extensions/proxy.rs` using reqwest

**State:** `Arc<ProcessManager>` registered as Tauri managed state at startup (`src-tauri/src/lib.rs`)

**Registry:** `src-tauri/src/extensions/registry.rs` — tracks installed extensions under `app_data_dir`

**Manifest:** `src-tauri/src/extensions/manifest.rs` — extension manifest schema and platform detection

**Frontend Host API (`client/src/extensions/host-api.ts`):**

The `HostApi` interface exposes three namespaces to builtin extensions:
- `notifications` — show toast messages (no capability required)
- `connections` — DB connection CRUD and introspect (requires `db.connect` / `db.schema.read` capabilities)
- `statusBar` — status bar item management (no capability required)

**Host API runtime (`client/src/extensions/host-api-runtime.ts`):**
- `createHostApi(toastFn, grantedCapabilities, statusBarController)` — instantiates a scoped HostApi
- Each method call validates the required capability before delegating to `desktopBridge`
- Capability constants: `db.connect`, `db.query`, `db.schema.read`, `db.schema.apply`

**Host context (`client/src/extensions/host-context.tsx`):**
- `<ExtensionHostProvider>` — React context provider at Dashboard root
- `useExtensionHost()` — access resolved extensions and contributions
- `useHostApiFor(extensionId)` — obtain a capability-scoped `HostApi` for a specific extension

**Builtin extensions:**
- Registered via `src-tauri/src/builtin_extensions.rs`
- Listed by `ext_list_builtin` / `commands::ext_list_builtin` command
- Run in-process (no sidecar); UI panels mounted directly in the React component tree

---

## Local Data Storage

**Engine:** SQLite via rusqlite 0.31 (statically bundled)

**Database file:** `{app_data_dir}/db-schema-ddl.sqlite3`

**Implementation:** `src-tauri/src/storage.rs`

**Tables:**
- `uploaded_files` — file metadata (id, file_path, original_name, original_modified_at, file_hash, file_size, uploaded_at)
- `settings` — serialized `DdlSettings` JSON rows
- Extension install state managed by `src-tauri/src/extensions/registry.rs`

**File storage:**
- Uploaded Excel files stored on disk at `{app_data_dir}/uploads/`
- Deduplication via SHA-256 hash stored in `uploaded_files.file_hash`

---

## Monitoring & Observability

**Error Tracking:** None (no external service)

**Logging:**
- `tauri-plugin-log` enabled in debug builds only (`src-tauri/src/lib.rs` cfg(debug_assertions) block)
- Log level: `Info` in debug mode
- Frontend: standard browser console

**Process Metrics:**
- `sysinfo` crate provides PID, memory bytes, virtual memory bytes
- Exposed via `core_get_process_metrics` Tauri command
- Consumed by status bar items configured in `shared/config.ts` (`statusBarItems: ["activity", "memory"]`)

---

## CI/CD & Deployment

**Hosting:** GitHub Releases (`https://github.com/SevenThRe/Db-Schema-Ddl`)

**CI Pipeline:** Not detected in repository (no `.github/workflows/` files observed)

**Release artifacts:**
- NSIS Windows installer built by `npm run tauri:build`
- `update.json` manifest uploaded alongside installer for the auto-updater endpoint
- Extension packages distributed from `SevenThRe/Db-Schema-Ddl-Extensions` repository

---

## Environment Configuration

**Required env vars:** None for desktop runtime — all paths are OS-derived

**Updater public key:** Embedded as minisign base64 in `src-tauri/tauri.conf.json` `plugins.updater.pubkey`

**Secrets management:** No secrets files; no cloud credentials; DB connection credentials are stored in the local SQLite database by the user at runtime

---

*Integration audit: 2026-03-24*
