# Architecture Patterns: DB 工作台 Integration

**Domain:** DB workbench features added to existing Tauri + React extension architecture
**Researched:** 2026-03-24
**Confidence:** HIGH — based on direct inspection of all existing source files

---

## Existing Architecture Baseline

Before designing integration points, these are the confirmed existing structures:

### Rust side (src-tauri/src/)

```
lib.rs                        ← invoke_handler registration, plugin wiring
db_connector/
  mod.rs                      ← shared types (DbConnectionConfig, DbSchemaSnapshot, etc.)
                                 + compute_schema_diff logic
  commands.rs                 ← thin Tauri command wrappers only; no business logic
  introspect.rs               ← introspect_schema(), test_connection() implementation
```

**Key observation:** `commands.rs` is already thin (command dispatch only, zero business logic). This pattern must be maintained for all new commands. `mod.rs` owns type definitions and pure computation. New modules mirror `introspect.rs`.

### TypeScript IPC layer

```
client/src/lib/desktop-bridge.ts      ← desktopBridge object with db.* namespace
client/src/extensions/host-api.ts     ← HostApi / ConnectionsApi interfaces
client/src/extensions/host-api-runtime.ts ← createHostApi() factory, capability gating
```

**Key observation:** The call chain is always:
`Extension component → ConnectionsApi method → desktopBridge.db.* → invoke() → Rust command`

Any new workbench method follows this exact chain. No shortcuts.

### Capability model

Current capabilities in `host-api-runtime.ts` `ALL_CAPABILITIES`:
- `db.connect`
- `db.query`
- `db.schema.read`
- `db.schema.apply`

### Shared types

`shared/schema.ts` owns all TypeScript types that mirror Rust structs. The existing DB types are:
`DbConnectionConfig`, `DbColumnSchema`, `DbTableSchema`, `DbSchemaSnapshot`,
`DbColumnDiff`, `DbTableDiff`, `DbSchemaDiffResult`.

`DbConnectionConfig` currently has no `environment`, `readonly`, or `colorTag` fields — these must be added.

---

## Recommended Architecture

### Component Boundaries

| Layer | Component | Responsibility | Communicates With |
|-------|-----------|----------------|-------------------|
| Frontend — Shell | `DbConnectorWorkspace.tsx` (refactored) | Layout shell, tab routing, connection header band | `db-workbench/` sub-components via props/context |
| Frontend — Panes | `db-workbench/SqlEditorPane.tsx` | Monaco editor, statement detection, keyboard bindings | `ConnectionsApi.query()` |
| Frontend — Panes | `db-workbench/ResultGridPane.tsx` | Virtual-scroll grid (react-window), sort/filter, export | `ConnectionsApi.exportResult()` |
| Frontend — Panes | `db-workbench/ExplainPlanPane.tsx` | xyflow + elkjs plan tree, highlight rules | `ConnectionsApi.explain()` |
| Frontend — Panes | `db-workbench/ObjectExplorerPane.tsx` | DB object tree, right-click actions | `ConnectionsApi.introspect()`, `introspectRelations()` |
| Frontend — Panes | `db-workbench/ErDiagramPane.tsx` | xyflow ER diagram with auto-layout | `ConnectionsApi.introspectRelations()` |
| Frontend — Dialogs | `db-workbench/DangerousSqlDialog.tsx` | Env-aware confirmation, prod name-entry gate | `ConnectionsApi.previewDangerousSql()` |
| Frontend — Dialogs | `db-workbench/GridCommitDialog.tsx` | Pending patches display, SQL preview, commit/rollback | `ConnectionsApi.commitGridChanges()` |
| Frontend — Tabs | `db-workbench/QueryTabs.tsx` | Multi-tab query state management | Internal state + `SqlEditorPane` |
| IPC Interface | `host-api.ts` — `ConnectionsApi` | Extended interface declaration | (interface only) |
| IPC Runtime | `host-api-runtime.ts` — `createConnectionsApi()` | Capability-gated bridge calls | `desktopBridge.db.*` |
| IPC Bridge | `desktop-bridge.ts` — `db.*` namespace | Raw invoke() calls with typed responses | Tauri IPC |
| Rust — Commands | `db_connector/commands.rs` | Thin dispatch only | New Rust modules |
| Rust — Query | `db_connector/query.rs` | Execute SQL, paginated result sets, cancel jobs | sqlx |
| Rust — Explain | `db_connector/explain.rs` | EXPLAIN FORMAT=JSON parsing, normalize to PlanNode | sqlx |
| Rust — Grid Edit | `db_connector/grid_edit.rs` | Parameterized UPDATE/INSERT/DELETE in transaction | sqlx |
| Rust — Relations | `db_connector/relations.rs` | FK + index introspection beyond current tables/columns | sqlx |
| Rust — Types | `db_connector/mod.rs` | New type structs (QueryResult, PlanNode, etc.) | Serde |

---

## Integration Points: What Changes vs What Is New

### MODIFIED files (existing files that need changes)

**`src-tauri/src/db_connector/mod.rs`**
- Add new structs: `DbEnvironment`, `DbQueryColumn`, `DbQueryRow`, `DbQueryResult`,
  `DbQueryMessage`, `DbExecutionStats`, `DbExplainPlan`, `DbPlanNode`, `DbRelation`,
  `DbForeignKey`, `DbIndex`, `DbGridPatch`, `DbDangerousSqlPreview`
- Extend `DbConnectionConfig` with: `environment: DbEnvironment`, `readonly: bool`,
  `color_tag: Option<String>`, `default_schema: Option<String>`
- Extend `DbSchemaSnapshot` with: `foreign_keys: Vec<DbForeignKey>`, `indexes: Vec<DbIndex>`
- Add `pub mod query; pub mod explain; pub mod grid_edit; pub mod relations;` declarations
- Re-export new public functions from new modules

**`src-tauri/src/db_connector/commands.rs`**
- Add 6 new thin command functions (see Tauri command list below)
- No logic in this file — all business logic stays in the new modules

**`src-tauri/src/lib.rs`**
- Register 6 new commands in `tauri::generate_handler![]`
- Add `CancellationRegistry` as managed state (see below)

**`client/src/lib/desktop-bridge.ts`**
- Extend `desktopBridge.db` with 6 new async methods

**`client/src/extensions/host-api.ts`**
- Add new methods to `ConnectionsApi` interface
- Add new request/response types (or import from `@shared/schema`)

**`client/src/extensions/host-api-runtime.ts`**
- Add new capability constants: `db.plan.read`, `db.data.edit`, `db.result.export`
- Extend `ALL_CAPABILITIES` array
- Wire new methods in `createConnectionsApi()` with appropriate capability guards

**`shared/schema.ts`**
- Add all new TypeScript types that mirror new Rust structs
- Extend `DbConnectionConfig` with `environment`, `readonly`, `colorTag`, `defaultSchema`
- Extend `DbSchemaSnapshot` with `foreignKeys`, `indexes`

**`client/src/components/extensions/DbConnectorWorkspace.tsx`**
- Refactor from monolithic workspace to layout shell
- Delegate content to `db-workbench/` sub-components
- Add environment color band rendering at top of workspace header
- Add tab routing for: Connection | SQL Editor | Object Explorer | ER Diagram

### NEW files

**Rust modules:**
- `src-tauri/src/db_connector/query.rs`
- `src-tauri/src/db_connector/explain.rs`
- `src-tauri/src/db_connector/grid_edit.rs`
- `src-tauri/src/db_connector/relations.rs`

**React components:**
- `client/src/components/extensions/db-workbench/SqlEditorPane.tsx`
- `client/src/components/extensions/db-workbench/ResultGridPane.tsx`
- `client/src/components/extensions/db-workbench/ExplainPlanPane.tsx`
- `client/src/components/extensions/db-workbench/ObjectExplorerPane.tsx`
- `client/src/components/extensions/db-workbench/ErDiagramPane.tsx`
- `client/src/components/extensions/db-workbench/DangerousSqlDialog.tsx`
- `client/src/components/extensions/db-workbench/GridCommitDialog.tsx`
- `client/src/components/extensions/db-workbench/QueryTabs.tsx`
- `client/src/components/extensions/db-workbench/ConnectionBand.tsx`

---

## Tauri Command Surface (New Commands)

All new commands follow the thin-dispatch pattern already established in `commands.rs`.

| Tauri Command | Rust Module | Async | Managed State |
|---------------|-------------|-------|---------------|
| `db_query_execute` | `query.rs` | yes | `CancellationRegistry` |
| `db_query_cancel` | `query.rs` | yes | `CancellationRegistry` |
| `db_query_explain` | `explain.rs` | yes | — |
| `db_grid_commit` | `grid_edit.rs` | yes | — |
| `db_export_rows` | `query.rs` | yes | — |
| `db_introspect_relations` | `relations.rs` | yes | — |

### requestId-based Query Cancellation Pattern

The cancellation mechanism requires shared mutable state accessible from both `db_query_execute` and `db_query_cancel`. The correct Tauri pattern is managed state:

```
// In lib.rs setup:
let cancel_registry = Arc::new(CancellationRegistry::default());
app.manage(cancel_registry);

// In commands.rs:
pub async fn db_query_execute(
  app: AppHandle,
  state: tauri::State<'_, Arc<CancellationRegistry>>,
  connection_id: String,
  sql: String,
  request_id: String,
  limit: Option<u32>,
  offset: Option<u32>,
) -> Result<DbQueryResult, String>

pub async fn db_query_cancel(
  state: tauri::State<'_, Arc<CancellationRegistry>>,
  request_id: String,
) -> Result<(), String>
```

`CancellationRegistry` in `query.rs` holds a `HashMap<String, tokio::sync::CancellationToken>`.
The execute command inserts a token before running the query; the cancel command triggers it.
The execute command removes its token on completion (success, error, or cancellation).

**Frontend contract:** The caller generates a UUID `requestId` before calling `query()`, stores it
in component state, and passes it to `cancel()` if the user clicks Cancel.

---

## New Shared Types (shared/schema.ts additions)

These types must be added to `shared/schema.ts` and must exactly mirror the corresponding Rust structs in `db_connector/mod.rs` (camelCase ↔ snake_case via serde `rename_all = "camelCase"`).

```typescript
// Connection environment model
export type DbEnvironment = "dev" | "test" | "prod";

// DbConnectionConfig additions (extend existing interface):
// environment: DbEnvironment
// readonly: boolean
// colorTag?: string
// defaultSchema?: string

// Query execution
export interface DbQueryColumn {
  name: string;
  dataType: string;
  nullable: boolean;
}

export interface DbQueryRow {
  values: (string | null)[];
}

export interface DbQueryResult {
  columns: DbQueryColumn[];
  rows: DbQueryRow[];
  rowCount: number;
  hasMore: boolean;
  elapsedMs: number;
}

export interface DbQueryMessage {
  kind: "info" | "error" | "warning";
  message: string;
  elapsedMs?: number;
}

export interface DbExecutionStats {
  totalElapsedMs: number;
  statementCount: number;
  successCount: number;
  errorCount: number;
}

// Execution plan
export interface DbPlanNode {
  id: string;
  label: string;
  nodeType: string;
  relationName?: string;
  cost?: number;
  rows?: number;
  children: DbPlanNode[];
  warnings: string[];
  rawDetail?: Record<string, unknown>;
}

export interface DbExplainPlan {
  root: DbPlanNode;
  dialect: DbDriver;
}

// Relations introspection
export interface DbForeignKey {
  constraintName: string;
  fromTable: string;
  fromColumns: string[];
  toTable: string;
  toColumns: string[];
  onDelete?: string;
  onUpdate?: string;
}

export interface DbIndex {
  name: string;
  tableName: string;
  columns: string[];
  unique: boolean;
  indexType?: string;
}

// DbSchemaSnapshot additions (extend existing interface):
// foreignKeys: DbForeignKey[]
// indexes: DbIndex[]

// Grid editing
export interface DbGridPatch {
  tableName: string;
  primaryKeyValues: Record<string, string | null>;
  columnName: string;
  newValue: string | null;
  operation: "update" | "delete" | "insert";
}

// Dangerous SQL preview
export interface DbDangerousSqlPreview {
  isDangerous: boolean;
  reasons: string[];
  statementTypes: string[];
}
```

---

## Host API Extensions (host-api.ts)

The `ConnectionsApi` interface gains these new methods:

```typescript
interface ConnectionsApi {
  // ... existing methods unchanged ...

  // Phase 1 additions
  query(request: DbQueryExecuteRequest): Promise<DbQueryResult>;
  cancelQuery(requestId: string): Promise<void>;
  explain(request: DbExplainRequest): Promise<DbExplainPlan>;
  previewDangerousSql(sql: string): Promise<DbDangerousSqlPreview>;
  exportResult(request: DbExportRequest): Promise<DbExportResult>;

  // Phase 2 additions
  commitGridChanges(request: DbGridCommitRequest): Promise<DbGridCommitResult>;

  // Phase 3 additions
  introspectRelations(connectionId: string): Promise<DbSchemaSnapshot>;
}

interface DbQueryExecuteRequest {
  connectionId: string;
  sql: string;
  requestId: string;       // caller-generated UUID for cancellation correlation
  limit?: number;          // default 1000
  offset?: number;
}

interface DbExplainRequest {
  connectionId: string;
  sql: string;
}

interface DbExportRequest {
  connectionId: string;
  sql: string;
  format: "json" | "csv" | "markdown" | "sql_insert";
  limit?: number;          // absent = full export with row-count confirmation
}

interface DbExportResult {
  content: string;
  rowCount: number;
  fileName: string;
}

interface DbGridCommitRequest {
  connectionId: string;
  tableName: string;
  patches: DbGridPatch[];
}

interface DbGridCommitResult {
  affectedRows: number;
  sqlPreview: string[];
}
```

### Capability Gating in host-api-runtime.ts

```
query / cancelQuery / previewDangerousSql  → require "db.query"
explain                                     → require "db.plan.read"
exportResult                                → require "db.result.export"
commitGridChanges                           → require "db.data.edit"
introspectRelations                         → require "db.schema.read"
```

New capabilities to add to `ALL_CAPABILITIES`: `db.plan.read`, `db.data.edit`, `db.result.export`

---

## Dangerous SQL Protection Architecture

This is a Phase 1 non-negotiable requirement. The design is:

1. **Frontend pre-check** (client-side, synchronous): Before invoking `query()`, call
   `previewDangerousSql(sql)` which hits `db_query_explain` in safe-parse mode or a dedicated
   lightweight Rust SQL token scanner.
2. If `isDangerous === true`, render `DangerousSqlDialog` with env-appropriate styling.
3. For `prod` connections, dialog requires user to type the database name before enabling Confirm.
4. Only after confirmed does the actual `query()` call proceed.

The Rust-side dangerous-SQL check is a pure token scan (no DB round-trip required). It lives in
`query.rs` as a synchronous helper called by both the preview command and optionally as a guard
inside `db_query_execute`.

---

## Data Flow: SQL Execution

```
SqlEditorPane
  │
  ├── detects selection or current statement boundary
  ├── calls previewDangerousSql(sql)         ← if clean, skip dialog
  │                                          ← if dangerous, show DangerousSqlDialog
  │                                             └── user confirms → continue
  │
  ├── generates requestId = crypto.randomUUID()
  ├── stores requestId in component state     ← enables Cancel button
  │
  ├── calls ConnectionsApi.query({ connectionId, sql, requestId, limit: 1000 })
  │     └── host-api-runtime: requireCap("db.query")
  │         └── desktopBridge.db.queryExecute(...)
  │             └── invoke("db_query_execute", { connectionId, sql, requestId, limit, offset })
  │                 └── query.rs: execute_query()
  │                     ├── insert CancellationToken into registry
  │                     ├── build connection pool from saved config
  │                     ├── run sqlx query with cancellation select!{}
  │                     ├── page results to limit rows
  │                     └── remove token from registry on exit
  │
  └── result arrives → ResultGridPane renders with react-window virtual scroll

Cancel path:
  User clicks Cancel
  → ConnectionsApi.cancelQuery(requestId)
  → invoke("db_query_cancel", { requestId })
  → query.rs: cancel_registry.cancel(requestId)
  → CancellationToken triggers, query aborted
```

---

## Build Order (Phase Dependencies)

The recommended build sequence ensures each step has complete foundations before the next begins.

### Step 1: Type Foundation (no UI, no commands)
**Purpose:** All layers share a stable contract before any implementation.

1. Extend `DbConnectionConfig` in `shared/schema.ts` with environment/readonly fields
2. Extend `DbSchemaSnapshot` in `shared/schema.ts` with `foreignKeys`, `indexes`
3. Add all new query/explain/grid/relations types to `shared/schema.ts`
4. Mirror all changes in `db_connector/mod.rs` (Rust structs)
5. Confirm TypeScript builds clean (`npm run check`)

**Dependency:** Nothing blocks this. Do it first.

### Step 2: Rust Module Stubs + Command Registration
**Purpose:** Tauri command surface defined so frontend can wire invoke() calls.

1. Create `query.rs`, `explain.rs`, `grid_edit.rs`, `relations.rs` as stub modules
   (functions return `Err("not implemented".to_string())` for now)
2. Add `pub mod` declarations in `mod.rs`
3. Add thin command functions to `commands.rs`
4. Register all 6 new commands in `lib.rs` `generate_handler![]`
5. Add `CancellationRegistry` managed state in `lib.rs`
6. Confirm `cargo build` succeeds

**Dependency:** Requires Step 1 types in Rust.

### Step 3: IPC Bridge Wiring
**Purpose:** Frontend call chain complete end-to-end (even if Rust returns stub errors).

1. Add new methods to `desktopBridge.db` in `desktop-bridge.ts`
2. Add new method signatures to `ConnectionsApi` in `host-api.ts`
3. Add capability constants in `host-api-runtime.ts`
4. Wire new methods in `createConnectionsApi()` with guards
5. Confirm TypeScript builds clean

**Dependency:** Requires Step 2 (command names must exist in Rust).

### Step 4: DbConnectorWorkspace Refactor
**Purpose:** Shell restructure before adding pane content.

1. Move existing connection/schema/diff UI into `db-workbench/` placeholder files
2. Reduce `DbConnectorWorkspace.tsx` to layout shell with tab router
3. Add `ConnectionBand.tsx` for environment color display
4. Confirm existing connection/schema/diff flows still work (regression check)

**Dependency:** Requires Step 3 (new HostApi methods available for panes to use).

### Step 5: Phase 1 — SQL Editor + Read-only Grid + Explain
**Purpose:** Core workbench value delivery.

1. Implement `query.rs` execution with CancellationToken
2. Implement `explain.rs` EXPLAIN parsing + PlanNode normalization for MySQL and PostgreSQL
3. Build `SqlEditorPane.tsx` with Monaco, keyboard bindings, statement detection
4. Build `ResultGridPane.tsx` with react-window virtual scroll
5. Build `ExplainPlanPane.tsx` with xyflow + elkjs
6. Build `DangerousSqlDialog.tsx`

**Dependency:** Requires Steps 1-4 complete.

### Step 6: Phase 1 — Export + Environment Model
**Purpose:** Completes Phase 1 requirements.

1. Implement `db_export_rows` command in `query.rs`
2. Build CSV/JSON/Markdown/SQL Insert serializers
3. Wire environment color band from connection config into `ConnectionBand.tsx`
4. Add readonly connection enforcement (disable SQL execution buttons)

**Dependency:** Requires Step 5.

### Step 7: Phase 2 — Grid Editing
**Purpose:** Single-table in-place edit with transaction.

1. Implement `grid_edit.rs` parameterized UPDATE/INSERT/DELETE in transaction
2. Extend `ResultGridPane.tsx` with edit mode, pending patch tracking
3. Build `GridCommitDialog.tsx`

**Dependency:** Requires Step 5 (grid rendering complete). Do not start until query chain is stable.

### Step 8: Phase 3 — ER Diagram + Object Explorer
**Purpose:** Structural visualization.

1. Implement `relations.rs` FK + index introspection for MySQL and PostgreSQL
2. Build `ObjectExplorerPane.tsx`
3. Build `ErDiagramPane.tsx` with xyflow auto-layout via elkjs

**Dependency:** Requires Step 3 (`introspectRelations` wired). Can be done in parallel with Step 7.

---

## Scalability Considerations

| Concern | Current scale | Workbench scale | Mitigation |
|---------|--------------|-----------------|------------|
| Result set size | Not applicable | Up to 1000 rows per page | Paginated fetch in `query.rs`, react-window rendering |
| Connection pooling | Single connection per command | Multi-query in same session | sqlx connection pool per `connectionId`, stored in Rust managed state or created per-command (simpler initially) |
| Schema snapshot size | Tables + columns only | + FK + indexes | Lazy load: introspectRelations only when ER pane is opened |
| Cancellation overhead | Not applicable | One token per active query | Token cleanup on command exit prevents registry growth |
| Autocomplete cache | Not applicable | Schema snapshot per connection | React Query cache with connection-keyed cache key, invalidate on reconnect |

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Logic in commands.rs
**What goes wrong:** Business logic (query parsing, result mapping, error handling) accumulates in `commands.rs`, making it a god file.
**Why bad:** Breaks the established pattern, makes testing impossible, bloats the file.
**Instead:** `commands.rs` dispatches to module functions. All logic in `query.rs`, `explain.rs`, etc.

### Anti-Pattern 2: Synchronous IPC for large result sets
**What goes wrong:** Fetching all rows before returning to frontend.
**Why bad:** Blocks Tauri's async runtime, serializes large JSON, freezes UI.
**Instead:** Hard limit of 1000 rows per `db_query_execute` call. `hasMore: true` signals pagination.

### Anti-Pattern 3: String-concatenated SQL in grid_edit.rs
**What goes wrong:** `format!("UPDATE {} SET {} = '{}'", table, col, val)` is SQL injection.
**Why bad:** Security vulnerability; violates project constraint.
**Instead:** sqlx `query!` macro with `$1/$2` bind parameters always.

### Anti-Pattern 4: Capability bypass in host-api-runtime.ts
**What goes wrong:** Calling `desktopBridge.db.*` directly from components, skipping the HostApi.
**Why bad:** Breaks the fail-closed capability model; bypasses permission checks.
**Instead:** All extension components receive `HostApi` via context and call `connections.*` methods only.

### Anti-Pattern 5: New extension ID for workbench
**What goes wrong:** Creating `db-workbench` as a separate extension ID alongside `db-connector`.
**Why bad:** Duplicates navigation entries, requires manifest/panel/i18n migration, breaks v1.0–v1.3 user flows.
**Instead:** Upgrade `db-connector` in-place. Internal ID unchanged. Display name changes to `DB 工作台`.

### Anti-Pattern 6: Adding all new HostApi methods at once
**What goes wrong:** Wiring all methods in `host-api.ts` before Rust commands are implemented.
**Why bad:** TypeScript compiles but calling the method returns an unhelpful Tauri "command not found" error with no type-level indication of readiness.
**Instead:** Follow the build order: Rust stubs first, IPC bridge second. All commands exist (even as stubs) before TypeScript wires them.

---

## Sources

All findings are HIGH confidence — derived directly from source files in this repository:

- `src-tauri/src/lib.rs` — confirmed command registration pattern
- `src-tauri/src/db_connector/mod.rs` — confirmed existing type structs and module structure
- `src-tauri/src/db_connector/commands.rs` — confirmed thin-dispatch pattern
- `client/src/lib/desktop-bridge.ts` — confirmed IPC bridge structure and `db.*` namespace
- `client/src/extensions/host-api.ts` — confirmed `ConnectionsApi` interface
- `client/src/extensions/host-api-runtime.ts` — confirmed capability gating pattern and `ALL_CAPABILITIES`
- `shared/schema.ts` — confirmed existing DB types, confirmed no environment/relations fields yet
- `docs/db-workbench-extension-design.md` — authoritative design intent from milestone author
- `.planning/PROJECT.md` — requirements, constraints, and phase ordering rationale
