# Phase 1: Usable Workbench - Research

**Researched:** 2026-03-24
**Domain:** Tauri desktop app — Rust query execution, Monaco SQL editor, virtual-scroll grid, EXPLAIN plan graph, sqlparser AST safety detection
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Left sidebar present in Phase 1 shows connection selector (active connection name + environment color indicator). Placeholder for Phase 2 object tree — no structural layout change needed in Phase 2.
- **D-02:** Layout: narrow left sidebar | center Monaco editor | bottom results/explain area. Right context panel deferred to Phase 2+.
- **D-03:** Toolbar has a dedicated "Explain" button (next to Run). Clicking runs EXPLAIN on current selection or statement block and renders as node graph.
- **D-04:** If user manually writes `EXPLAIN SELECT ...` and executes with Ctrl+Enter, result is rendered as graph (auto-detection based on leading EXPLAIN keyword).
- **D-05:** Default behavior is stop on error. User can toggle to "continue on error" per execution session.
- **D-06:** When query returns more than 1000 rows, grid shows first 1000 with status line ("1,000 / N rows loaded") and a "Load more" button. No auto-scroll loading.
- **D-07:** Query tabs fully persisted across app restarts — tab list, SQL content, and associated connection. Uses Tauri local store (via existing `desktop-bridge.ts` pattern — see Note below).
- **D-08:** Confirmation dialog shown for all environments (dev, test, prod) for DROP / TRUNCATE / ALTER TABLE / ALTER DATABASE / DELETE without WHERE / UPDATE without WHERE.
- **D-09:** For dev/test connections: dialog shows connection name, environment, database name, exact SQL — user clicks OK.
- **D-10:** For prod connections: user must type the database name to confirm.

### Claude's Discretion

- Exact panel geometry and pixel sizing within the left sidebar.
- Loading skeleton / empty state design for results area.
- Specific error state presentation when a statement fails mid-script.
- Progress indicator style during query execution.

### Deferred Ideas (OUT OF SCOPE)

- Object explorer / schema tree — Phase 2
- Grid cell editing — Phase 2
- Schema-aware autocomplete — Phase 2
- ER diagram — Phase 3
- Drag-to-relate in ER diagram — Phase 4 / v2.0
- Cross-session query history persistence — future
- Saved script library with tagging — future
- Multiple simultaneous connection tabs — future
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CONN-01 | User can assign dev/test/prod environment label and optional color tag to each saved connection | Requires `environment`, `readonly`, `colorTag`, `defaultSchema` added to `DbConnectionConfig` in shared/schema.ts and Rust mod.rs struct |
| CONN-02 | Prominent color band on workbench header for test (blue) or prod (red) connections | Pure frontend: CSS class driven by `connection.environment` field; always visible while workbench open |
| CONN-03 | User can mark a connection as readonly; DML disabled at Rust command layer | `readonly` boolean on DbConnectionConfig; `db_query_execute` command checks before running — not frontend-gated |
| EDIT-01 | Monaco editor with SQL syntax highlighting for MySQL/PostgreSQL dialect | `@monaco-editor/react` 4.7.0 already installed; `language="sql"` prop; dialect label shown but Monaco has one SQL mode |
| EDIT-02 | Ctrl/Cmd+Enter executes selected SQL or current statement block | Monaco `addAction()` API for keybinding; statement-block detection requires semicolon-based parser on frontend |
| EDIT-03 | Shift+Ctrl/Cmd+Enter executes full script | Second Monaco `addAction()` binding; passes full editor value |
| EDIT-04 | Alt+Shift+F formats SQL with sql-formatter | sql-formatter 15.7.2 (latest, not yet installed); Monaco `addAction()` for keybinding |
| EDIT-05 | Multiple query tabs with switching | React state: array of tab objects; tab bar component above editor |
| EXEC-01 | Multi-statement incremental execution with per-segment result + elapsed time; stop-on-error toggle | Rust `db_query_execute` splits on semicolons, runs sequentially, returns `Vec<QueryBatchResult>` |
| EXEC-02 | Cancel running query via Cancel button (requestId CancellationToken) | `tokio-util` not yet in Cargo.toml; `CancellationRegistry` managed state; MySQL KILL QUERY / PG cancel |
| EXEC-03 | Virtual-scroll result grid — 1000 rows per fetch, sticky headers, column-width drag | `react-window` 2.2.6 already installed but zero current usage; `FixedSizeList` for rows; column headers via CSS sticky |
| EXEC-04 | Export result as JSON/CSV/Markdown/SQL Insert; full-export shows row count warning | Frontend-side serialization from loaded rows for current-page export; Rust command for full re-execution export |
| PLAN-01 | EXPLAIN plan for any SELECT — rendered as node graph (xyflow + elkjs) | `@xyflow/react` 12.10.1 + `elkjs` 0.10.2 already installed; Rust normalizes MySQL/PG EXPLAIN to `PlanNode` tree |
| PLAN-02 | Full-table-scan nodes (MySQL type=ALL / PostgreSQL Seq Scan) highlighted red; large-rows flagged | Risk detection in `explain.rs` before serialization; `warnings` field on `PlanNode` |
| SAFE-01 | Confirmation dialog before DROP/TRUNCATE/ALTER/WHERE-less DELETE/UPDATE (sqlparser AST detection) | `sqlparser` 0.53 already in Cargo.toml; `Statement::Drop`, `Statement::Truncate`, `Statement::Delete`, etc. |
| SAFE-02 | Dialog shows connection name, environment, DB name, exact SQL; prod requires typing DB name to confirm | Frontend dialog component; readonly connections rejected at Rust layer before dialog |
</phase_requirements>

---

## Summary

Phase 1 upgrades the existing `db-connector` builtin extension from a connection-management shell into a usable SQL workbench. The technical foundation is largely in place: `sqlx` 0.8 (mysql + postgres features), `sqlparser` 0.53, `@monaco-editor/react` 4.7.0, `react-window` 2.2.6, `@xyflow/react` 12.10.1, and `elkjs` 0.10.2 are all already in the dependency graph. The critical missing pieces are: (1) `tokio-util` for CancellationToken on the Rust side, (2) `sql-formatter` npm package for SQL formatting, (3) new Rust modules `query.rs` and `explain.rs`, (4) ~15 new shared TypeScript types, and (5) the `DbConnectorWorkspace.tsx` refactor into a `db-workbench/` subdirectory.

The build order is strictly sequential within the phase: type foundation (shared/schema.ts additions) must precede Rust command stubs, which must precede the IPC bridge additions to `desktop-bridge.ts`, which must precede the workspace layout refactor. Only after that infrastructure is stable should feature components be layered in. The most technically complex areas are: CancellationToken wiring through Tauri managed state, EXPLAIN JSON normalization between MySQL and PostgreSQL (structurally different formats), and the Monaco keyboard-shortcut registration pattern (which must not conflict with browser/Tauri defaults).

Tab persistence uses `window.localStorage` (the project's established pattern from Dashboard.tsx — `LAST_SELECTED_FILE_STORAGE_KEY` etc.) rather than `tauri-plugin-store` which is not installed in either Cargo.toml or package.json. This is the correct and lowest-risk approach given what already exists.

**Primary recommendation:** Follow the 8-step build order exactly — foundation types → Rust stubs → IPC bridge → workspace refactor → connection environment UI → SQL editor → result grid → EXPLAIN graph + dangerous SQL. Do not implement feature components before the IPC bridge is stable.

---

## Standard Stack

### Core (Already Installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| sqlx | 0.8 | Async DB queries MySQL/PostgreSQL | Already in Cargo.toml; mysql + postgres features enabled |
| sqlparser | 0.53 | Rust SQL AST parsing for danger detection | Already in Cargo.toml; used in ddl_import.rs |
| tokio | 1 | Async runtime | Already in Cargo.toml; needs `sync` feature for CancellationToken |
| @monaco-editor/react | 4.7.0 | SQL editor | Already installed; used in MonacoDdlDiff.tsx |
| react-window | 2.2.6 | Virtual scroll result grid | Already installed; zero current usage — new in Phase 1 |
| @xyflow/react | 12.10.1 | EXPLAIN plan node graph | Already installed; existing graph views exist |
| elkjs | 0.10.2 | Auto-layout for EXPLAIN graph | Already installed |

### New Dependencies Required

| Library | Version | Purpose | Install Command |
|---------|---------|---------|----------------|
| tokio-util | 0.7 | CancellationToken for query cancel | Add to Cargo.toml |
| sql-formatter | 15.7.2 | SQL formatting (Alt+Shift+F) | `npm install sql-formatter` |

**Note:** `tauri-plugin-store` is NOT needed. Tab persistence uses `window.localStorage` — the existing project pattern from Dashboard.tsx (confirmed: `LAST_SELECTED_FILE_STORAGE_KEY`, `LAST_SELECTED_SHEET_STORAGE_KEY`, `WORKSPACE_CHROME_STORAGE_KEY`). This avoids adding a new Tauri plugin.

**Confirmed NOT available / NOT to use:**
- `monaco-sql-languages` — explicitly out of scope per REQUIREMENTS.md (incompatible with monaco-editor 0.55.1)
- `tauri-plugin-store` — not installed; localStorage is sufficient and consistent with project patterns

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| localStorage tab persistence | tauri-plugin-store | tauri-plugin-store adds Rust + TS dep; localStorage is sufficient for tab state and already used throughout the project |
| sql-formatter | prettier/sql-plugin | sql-formatter is simpler, dialect-aware, no peer dep requirements |
| react-window FixedSizeList | TanStack Virtual | react-window already installed; TanStack Virtual would be a new dep with no benefit here |

**Installation for new deps:**
```bash
# Rust side — add to Cargo.toml [dependencies]
tokio-util = { version = "0.7", features = ["rt"] }

# Frontend — add sql-formatter
npm install sql-formatter
```

---

## Architecture Patterns

### Recommended Project Structure

```
src-tauri/src/db_connector/
├── mod.rs             # Existing: DbConnectionConfig struct + schema diff logic
├── commands.rs        # Existing: CRUD + test + introspect + diff commands
├── introspect.rs      # Existing: MySQL/PG INFORMATION_SCHEMA queries
├── query.rs           # NEW: db_query_execute, db_query_cancel
└── explain.rs         # NEW: db_query_explain, PlanNode normalization

client/src/components/extensions/
├── DbConnectorWorkspace.tsx   # REFACTORED: becomes layout shell only
└── db-workbench/
    ├── WorkbenchLayout.tsx        # Left sidebar + center + bottom panes
    ├── ConnectionSidebar.tsx      # Connection selector + env color band
    ├── SqlEditorPane.tsx          # Monaco SQL editor + tab bar
    ├── QueryTabs.tsx              # Tab management + localStorage persistence
    ├── ResultGridPane.tsx         # react-window virtual scroll grid
    ├── ExplainPlanPane.tsx        # @xyflow/react + elkjs node graph
    ├── DangerousSqlDialog.tsx     # Confirmation dialog with prod DB name input
    └── ResultExportMenu.tsx       # JSON/CSV/Markdown/SQL Insert export
```

### Pattern 1: Rust Managed State — DbPoolRegistry + CancellationRegistry

**What:** Two pieces of managed state registered in `lib.rs` via `app.manage()`. The pool registry holds per-connection sqlx pools (keyed by connectionId). The cancellation registry maps requestId → `CancellationToken`.

**When to use:** All new query/explain commands access pools through this registry instead of creating new pools per call.

```rust
// Source: tokio-util 0.7 docs + existing Tauri managed state pattern from lib.rs
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio_util::sync::CancellationToken;
use sqlx::{MySqlPool, PgPool};

pub enum AnyPool {
    Mysql(MySqlPool),
    Postgres(PgPool),
}

pub struct DbPoolRegistry {
    pub pools: Mutex<HashMap<String, Arc<AnyPool>>>,
}

pub struct CancellationRegistry {
    pub tokens: Mutex<HashMap<String, CancellationToken>>,
}

// In lib.rs setup():
app.manage(Arc::new(DbPoolRegistry { pools: Mutex::new(HashMap::new()) }));
app.manage(Arc::new(CancellationRegistry { tokens: Mutex::new(HashMap::new()) }));
```

### Pattern 2: Tauri Command Signature with Managed State

**What:** Commands access managed state via `tauri::State<Arc<T>>`. The existing pattern from `lib.rs` uses `app.manage(Arc::new(...))`.

```rust
// Source: existing commands.rs + Tauri 2.x docs pattern
#[tauri::command]
pub async fn db_query_execute(
    app: AppHandle,
    pool_registry: State<'_, Arc<DbPoolRegistry>>,
    cancel_registry: State<'_, Arc<CancellationRegistry>>,
    request: QueryExecutionRequest,
) -> Result<QueryExecutionResponse, String> {
    // lookup or create pool from registry
    // create CancellationToken, store in cancel_registry
    // execute with tokio::select! { result = query, _ = token.cancelled() => ... }
}
```

### Pattern 3: Monaco Editor — SQL Editor with Keyboard Actions

**What:** Use `@monaco-editor/react` `Editor` component (not `DiffEditor` as in MonacoDdlDiff.tsx). Register keyboard shortcuts via `editor.addAction()` in the `onMount` callback. The Monaco instance ref pattern is already established in `MonacoDdlDiff.tsx`.

```typescript
// Source: @monaco-editor/react 4.7.0 + Monaco addAction API
import Editor, { type OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";

const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

const handleMount: OnMount = useCallback((editorInstance) => {
  editorRef.current = editorInstance;

  // Ctrl/Cmd+Enter — execute selection or current statement
  editorInstance.addAction({
    id: "db-execute-selection",
    label: "Execute Selection / Statement",
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
    run: () => onExecuteSelection(),
  });

  // Shift+Ctrl/Cmd+Enter — execute full script
  editorInstance.addAction({
    id: "db-execute-script",
    label: "Execute Full Script",
    keybindings: [
      monaco.KeyMod.Shift | monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
    ],
    run: () => onExecuteScript(),
  });

  // Alt+Shift+F — format SQL
  editorInstance.addAction({
    id: "db-format-sql",
    label: "Format SQL",
    keybindings: [
      monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.KeyF,
    ],
    run: () => {
      const sql = editorInstance.getValue();
      const formatted = format(sql, { language: "sql" }); // sql-formatter
      editorInstance.setValue(formatted);
    },
  });
}, []);
```

**Statement block detection (EDIT-02):** Without selection, use a lightweight semicolon-split to find which statement block the cursor is in. Monaco provides `getPosition()` to get cursor offset. Algorithm: split full text on `;`, accumulate char offset, find the block containing cursor position.

### Pattern 4: sqlparser AST — Dangerous SQL Detection

**What:** The `sqlparser` 0.53 crate is already used in `ddl_import.rs` with `MySqlDialect` and `AnsiDialect`. For dangerous SQL detection, parse the incoming SQL and walk the statement AST to classify risk.

```rust
// Source: sqlparser 0.53 crate (already used in ddl_import.rs)
use sqlparser::ast::{Statement, SetExpr, Expr};
use sqlparser::dialect::{MySqlDialect, PostgreSqlDialect};
use sqlparser::parser::Parser;

pub enum DangerClass {
    Drop,
    Truncate,
    AlterTable,
    AlterDatabase,
    DeleteWithoutWhere,
    UpdateWithoutWhere,
}

pub fn detect_dangerous_sql(sql: &str, driver: &DbDriver) -> Vec<DangerClass> {
    let dialect: Box<dyn sqlparser::dialect::Dialect> = match driver {
        DbDriver::Mysql => Box::new(MySqlDialect {}),
        DbDriver::Postgres => Box::new(PostgreSqlDialect {}),
    };
    let stmts = match Parser::parse_sql(dialect.as_ref(), sql) {
        Ok(s) => s,
        Err(_) => return vec![], // parse fail → let execution attempt handle error
    };

    let mut dangers = vec![];
    for stmt in &stmts {
        match stmt {
            Statement::Drop { .. } => dangers.push(DangerClass::Drop),
            Statement::Truncate { .. } => dangers.push(DangerClass::Truncate),
            Statement::AlterTable { .. } => dangers.push(DangerClass::AlterTable),
            Statement::Delete(del) if del.selection.is_none() => {
                dangers.push(DangerClass::DeleteWithoutWhere)
            }
            Statement::Update { selection, .. } if selection.is_none() => {
                dangers.push(DangerClass::UpdateWithoutWhere)
            }
            // Note: ALTER DATABASE — check Statement::AlterDatabase or similar variant
            _ => {}
        }
    }
    dangers
}
```

**Key insight:** sqlparser returns `Statement::AlterDatabase` for `ALTER DATABASE` statements in both MySQL and PostgreSQL dialects. Verify enum variant name against sqlparser 0.53 AST — it may be `Statement::AlterTable` with a `DatabaseObject` qualifier. Use `cargo doc --open` or grep the crate to confirm the exact variant before implementing.

### Pattern 5: EXPLAIN Normalization

**What:** MySQL `EXPLAIN FORMAT=JSON` and PostgreSQL `EXPLAIN (FORMAT JSON)` produce structurally different JSON. Normalize on the Rust side before sending to frontend.

MySQL EXPLAIN FORMAT=JSON root structure:
```json
{ "query_block": { "select_id": 1, "table": { "access_type": "ALL", "rows_examined_per_scan": 10000, ... } } }
```

PostgreSQL EXPLAIN FORMAT JSON root structure:
```json
[{ "Plan": { "Node Type": "Seq Scan", "Relation Name": "orders", "Plan Rows": 10000, "Plans": [...] } }]
```

Normalized `PlanNode` struct (Rust, then serialized to TS):
```rust
// Source: docs/db-workbench-extension-design.md §5.6
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanNode {
    pub id: String,               // synthetic UUID or path-based id
    pub label: String,            // table name or operation label
    pub node_type: String,        // "ALL", "SeqScan", "IndexScan", "HashJoin", etc.
    pub relation_name: Option<String>,
    pub cost: Option<f64>,        // PG: total_cost; MySQL: estimated from rows
    pub rows: Option<u64>,        // estimated row count
    pub children: Vec<PlanNode>,
    pub warnings: Vec<String>,    // "FULL_TABLE_SCAN", "LARGE_ROWS_ESTIMATE"
}
```

Risk thresholds (from PLAN-02 requirement):
- `warnings` gets `"FULL_TABLE_SCAN"` if MySQL `access_type == "ALL"` or PG `node_type == "Seq Scan"`
- `warnings` gets `"LARGE_ROWS_ESTIMATE"` if `rows > 10_000` (specific threshold: use 10,000 as default, planner may tune)

### Pattern 6: react-window FixedSizeList for Result Grid

**What:** `react-window` is installed but has zero current usage in the codebase. Use `FixedSizeList` for the result rows (all rows same height). Column headers are fixed outside the list via CSS sticky positioning.

```typescript
// Source: react-window 2.2.6 API
import { FixedSizeList } from "react-window";

// Outer: fixed-height container, sticky header
// FixedSizeList: itemCount=loadedRows.length, itemSize=32 (row height px)
<FixedSizeList
  height={containerHeight}   // measured via ResizeObserver
  itemCount={rows.length}
  itemSize={32}
  width="100%"
>
  {({ index, style }) => (
    <div style={style} className="grid-row">
      {columns.map(col => <GridCell key={col} value={rows[index][col]} />)}
    </div>
  )}
</FixedSizeList>
```

Column-width drag: managed via `useState<number[]>(columnWidths)`. Each column header has a resize handle div with `onMouseDown` handler. Column freeze (sticky left): `position: sticky; left: 0` CSS on the first N columns.

### Pattern 7: Tab Persistence via localStorage

**What:** The project already uses `window.localStorage` throughout Dashboard.tsx for UI state persistence. Use the same pattern for query tabs.

```typescript
// Source: client/src/pages/Dashboard.tsx localStorage pattern
const QUERY_TABS_STORAGE_KEY = "db-workbench:query-tabs:v1";

interface QueryTabState {
  id: string;
  label: string;
  sql: string;
  connectionId: string | null;
}

function loadTabs(): QueryTabState[] {
  try {
    const raw = window.localStorage.getItem(QUERY_TABS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [defaultTab()];
  } catch {
    return [defaultTab()];
  }
}

// On tab change: window.localStorage.setItem(QUERY_TABS_STORAGE_KEY, JSON.stringify(tabs))
```

### Pattern 8: CancellationToken + DB-Side Cancel

**What:** `tokio-util::sync::CancellationToken` is used to cancel the query future on the Rust side. For DB-side cancellation (so the query stops at the DB, not just at the Rust receiver):

- **MySQL:** Execute `KILL QUERY <connection_id>` on a separate connection. Get the connection ID via `SELECT CONNECTION_ID()` before running the main query.
- **PostgreSQL:** Use `pg_cancel_backend(pid)` where pid is from `SELECT pg_backend_pid()`.

Pattern:
```rust
// On query start: get db connection pid/id, store alongside CancellationToken
// On cancel:
//   1. Remove token from CancellationRegistry, call token.cancel()
//   2. Open separate connection, run KILL QUERY / pg_cancel_backend
//   This ensures DB releases its locks promptly
```

### Anti-Patterns to Avoid

- **Don't gate readonly on the frontend:** The `readonly` flag on `DbConnectionConfig` is checked in the Rust command layer (`db_query_execute`) before executing DML. Frontend may display a disabled button, but the backend must enforce it — not trust the frontend.
- **Don't use a single global pool per session:** Pool must be keyed by `connectionId` in `DbPoolRegistry`. Multiple connections can be open simultaneously.
- **Don't render all rows in DOM:** Without `react-window`, 1000-row result sets will freeze the UI. Always use `FixedSizeList`.
- **Don't split SQL by semicolon with string replace:** Use the Monaco `getModel().findMatches()` or a proper semicolon-aware split that respects string literals and comments. A regex split on `;` will break SQL with semicolons inside string values.
- **Don't assume sqlparser handles all dialect variants:** sqlparser 0.53 may not parse all MySQL-specific syntax (e.g., `KILL QUERY`). Use `Parser::parse_sql` on the user's SQL for danger detection, but handle parse errors gracefully (don't block execution on parse failure — just skip the safety dialog).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SQL formatting | Custom formatter | `sql-formatter` 15.7.2 | Comment preservation, dialect awareness, keyword casing — all handled. Hand-rolling always misses edge cases |
| EXPLAIN graph layout | Manual node positioning | `elkjs` layered algorithm | Complex crossing-minimization, level assignment — already in the dependency graph |
| Virtual scroll | Custom windowed render | `react-window` FixedSizeList | Correct scroll position math, overscan, scroll-to-item — already installed |
| Async query cancellation | setTimeout / AbortController | `tokio-util` CancellationToken | tokio-aware cancellation integrates with sqlx futures; AbortController doesn't work cross-thread in Rust |
| SQL AST walking | Regex on SQL text | `sqlparser` 0.53 AST | Regex cannot reliably detect WHERE-less DELETE — `WHERE 1=1` vs no WHERE requires AST traversal |
| Statement block detection | Full SQL parser in frontend | Semicolon-split with cursor offset | AST parser in frontend is overkill; semicolon-split with quote-awareness is sufficient for Phase 1 |

---

## Common Pitfalls

### Pitfall 1: tokio features mismatch for CancellationToken

**What goes wrong:** `tokio-util::sync::CancellationToken` requires the `sync` feature of `tokio`. The existing Cargo.toml tokio entry already has `"sync"` in its features list — confirmed. However, `tokio-util` itself must be added separately with `features = ["rt"]`.

**Why it happens:** `tokio-util` is a separate crate from `tokio`, not a sub-feature.

**How to avoid:** Add `tokio-util = { version = "0.7", features = ["rt"] }` to Cargo.toml. Current tokio already has `sync` feature so CancellationToken will work.

**Warning signs:** Compile error `error[E0433]: failed to resolve: use of undeclared crate or module tokio_util`.

### Pitfall 2: Mutex deadlock in DbPoolRegistry under async

**What goes wrong:** `Mutex<HashMap<...>>` from `std::sync` blocks the async thread when the lock is held across an `.await` point.

**Why it happens:** sqlx pool creation is async. If pool acquisition uses std Mutex and awaits inside the lock, Tokio runtime can deadlock.

**How to avoid:** Only hold the `std::sync::Mutex` lock to clone the `Arc<AnyPool>` handle, then release the lock before any `.await`. Never hold a std Mutex across `.await`.

**Warning signs:** App hangs on second query to same connection.

### Pitfall 3: Monaco keybinding conflicts with Tauri WebView

**What goes wrong:** `Ctrl+Enter` may be intercepted by the Tauri WebView / system before Monaco sees it, or Monaco's default action for the key fires instead of the custom action.

**Why it happens:** Monaco has its own default actions for some key combinations. `addAction` with a `keybindings` array replaces the default for that key, but only when the editor has focus.

**How to avoid:** Always check `editor.hasTextFocus()` in the action `run` callback as a guard. Test with editor focused vs. clicking elsewhere first. Use `monaco.KeyMod.CtrlCmd` (not `monaco.KeyMod.Ctrl`) to handle both Windows Ctrl and macOS Cmd.

**Warning signs:** Ctrl+Enter submits a form or does nothing; no action fires.

### Pitfall 4: EXPLAIN JSON structure differs more than expected

**What goes wrong:** MySQL EXPLAIN FORMAT=JSON has deeply nested `query_block.table` or `query_block.ordering_operation.table` depending on query shape. The simple `query_block.table.access_type` path only works for simple single-table queries.

**Why it happens:** MySQL EXPLAIN JSON nesting reflects query optimization phases (join_optimization, ordering_operation, etc.) — each can contain nested tables.

**How to avoid:** The normalization in `explain.rs` must recursively walk all keys looking for `table` objects at any nesting depth. Write a recursive `extract_mysql_nodes(value: &serde_json::Value) -> Vec<PlanNode>` function rather than fixed-path access.

**Warning signs:** EXPLAIN graph renders empty for JOIN queries or ORDER BY queries.

### Pitfall 5: react-window FixedSizeList width measurement

**What goes wrong:** `FixedSizeList` requires explicit pixel `width` and `height`. Passing `"100%"` string may not work as expected — the component needs numeric values for correct virtualization calculations.

**Why it happens:** react-window uses pixel math internally; percentage values are not natively supported for the height prop.

**How to avoid:** Wrap the list container in a `div` with `flex: 1` and use a `ResizeObserver` (or `react-resizable-panels` which is already used in Dashboard.tsx) to measure the container's pixel dimensions. Pass those measured values to `FixedSizeList`.

**Warning signs:** Grid renders too tall/short; vertical scrollbar disappears or overflows parent.

### Pitfall 6: Readonly enforcement trust boundary

**What goes wrong:** If the frontend disables the "Run" button for readonly connections but the Rust command does not enforce it, a crafted IPC call can still execute DML.

**Why it happens:** Tauri commands are invokable by any frontend code; the `readonly` check must live in the Rust command layer.

**How to avoid:** In `db_query_execute`, before executing any statement, check `config.readonly` from the stored connection config (loaded from storage, not passed by frontend). If readonly and the statement is DML/DDL, return `Err("Connection is readonly")`.

**Warning signs:** Readonly mode can be bypassed from browser devtools via `__TAURI_INVOKE__`.

### Pitfall 7: DbConnectionConfig struct sync between Rust and TypeScript

**What goes wrong:** When adding `environment`, `readonly`, `colorTag`, `defaultSchema` fields to `DbConnectionConfig`, the Rust struct and the TypeScript interface must be updated simultaneously. Missing one side causes silent deserialization failures (missing fields default to `None` in Rust, `undefined` in TS).

**Why it happens:** The Rust struct uses `#[serde(rename_all = "camelCase")]` — field names must match exactly on both sides.

**How to avoid:** Update both `shared/schema.ts` `DbConnectionConfig` interface AND `src-tauri/src/db_connector/mod.rs` `DbConnectionConfig` struct in the same commit (Step 1 of build order).

**Warning signs:** Newly added `environment` field is always `undefined` in frontend after save.

---

## Code Examples

### Verified Pattern: Tauri Managed State Registration (from lib.rs)

```rust
// Source: src-tauri/src/lib.rs (existing pattern)
// Add alongside existing ext_manager registration in setup()
let pool_registry = Arc::new(DbPoolRegistry { pools: Mutex::new(HashMap::new()) });
let cancel_registry = Arc::new(CancellationRegistry { tokens: Mutex::new(HashMap::new()) });
app.manage(pool_registry);
app.manage(cancel_registry);
```

### Verified Pattern: Tauri Command Registration (from lib.rs)

```rust
// Source: src-tauri/src/lib.rs — add to invoke_handler after existing db_connector commands
db_connector::commands::db_query_execute,
db_connector::commands::db_query_explain,
db_connector::commands::db_query_cancel,
db_connector::commands::db_export_rows,
```

### Verified Pattern: desktopBridge Extension (from desktop-bridge.ts)

```typescript
// Source: client/src/lib/desktop-bridge.ts — add to existing db: { ... } block
db: {
  // ...existing methods...
  async executeQuery(request: QueryExecutionRequest): Promise<QueryExecutionResponse> {
    return await invoke<QueryExecutionResponse>("db_query_execute", { request });
  },
  async explainQuery(request: ExplainRequest): Promise<DbExplainPlan> {
    return await invoke<DbExplainPlan>("db_query_explain", { request });
  },
  async cancelQuery(requestId: string): Promise<void> {
    await invoke<void>("db_query_cancel", { requestId });
  },
  async exportRows(request: ExportRowsRequest): Promise<string> {
    return await invoke<string>("db_export_rows", { request });
  },
},
```

### Verified Pattern: ConnectionsApi Extension (from host-api.ts)

```typescript
// Source: client/src/extensions/host-api.ts — extend ConnectionsApi interface
export interface ConnectionsApi {
  // ...existing methods...
  executeQuery(request: QueryExecutionRequest): Promise<QueryExecutionResponse>;
  explainQuery(request: ExplainRequest): Promise<DbExplainPlan>;
  cancelQuery(requestId: string): Promise<void>;
  previewDangerousSql(sql: string, connectionId: string): Promise<DangerousSqlPreview>;
  exportRows(request: ExportRowsRequest): Promise<string>;
}
```

### Verified Pattern: Monaco DiffEditor mount (from MonacoDdlDiff.tsx — source reference)

```typescript
// The existing DiffEditor uses DiffOnMount. For the SQL Editor, use OnMount instead:
import Editor, { type OnMount } from "@monaco-editor/react";
// Pattern: useRef<editor.IStandaloneCodeEditor>, capture in onMount callback
// Same approach as diffEditorRef in MonacoDdlDiff.tsx but for standalone editor
```

### New Type Definitions Required in shared/schema.ts

```typescript
// Source: docs/db-workbench-extension-design.md §6.5
export type DbEnvironment = "dev" | "test" | "prod";

// Extension to existing DbConnectionConfig:
export interface DbConnectionConfig {
  id: string;
  name: string;
  driver: DbDriver;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  // Phase 1 additions:
  environment?: DbEnvironment;
  readonly?: boolean;
  colorTag?: string;
  defaultSchema?: string;
}

export interface QueryExecutionRequest {
  connectionId: string;
  sql: string;
  requestId: string;   // UUID for cancel correlation
  limit?: number;      // default 1000
  offset?: number;     // for "load more" fetches
  continueOnError?: boolean;
}

export interface DbQueryColumn {
  name: string;
  dataType: string;
}

export interface DbQueryRow {
  values: (string | number | boolean | null)[];
}

export interface DbQueryBatchResult {
  sql: string;
  columns: DbQueryColumn[];
  rows: DbQueryRow[];
  totalRows: number;     // actual count in DB (may exceed loaded rows)
  elapsedMs: number;
  affectedRows?: number; // for DML
  error?: string;        // null on success
}

export interface QueryExecutionResponse {
  batches: DbQueryBatchResult[];
  requestId: string;
}

export interface PlanNode {
  id: string;
  label: string;
  nodeType: string;
  relationName?: string;
  cost?: number;
  rows?: number;
  children: PlanNode[];
  warnings: string[];   // "FULL_TABLE_SCAN", "LARGE_ROWS_ESTIMATE"
}

export interface DbExplainPlan {
  dialect: DbDriver;
  root: PlanNode;
  rawJson: string;     // original EXPLAIN JSON for hover tooltip
}

export interface DangerousSqlPreview {
  dangers: DangerClass[];
  sql: string;
  connectionName: string;
  environment: DbEnvironment;
  database: string;
}

export type DangerClass =
  | "DROP"
  | "TRUNCATE"
  | "ALTER_TABLE"
  | "ALTER_DATABASE"
  | "DELETE_WITHOUT_WHERE"
  | "UPDATE_WITHOUT_WHERE";

export interface ExportRowsRequest {
  rows: DbQueryRow[];
  columns: DbQueryColumn[];
  format: "json" | "csv" | "markdown" | "sql-insert";
  tableName?: string;  // required for sql-insert format
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-request sqlx pool creation | Persistent pool registry (DbPoolRegistry) | Phase 1 | Connection reuse; no reconnect latency per query |
| Monolithic DbConnectorWorkspace.tsx | Shell + db-workbench/ subdirectory | Phase 1 | File stays maintainable; components are individually testable |
| No SQL editor | Monaco `Editor` with dialect label + keyboard shortcuts | Phase 1 | DataGrip-style edit experience |
| Plain table for results | react-window `FixedSizeList` | Phase 1 | 1000-row result sets render without DOM explosion |
| No query safety | sqlparser AST detection + confirmation dialog | Phase 1 | Prevents accidental DROP/TRUNCATE on prod |

**Not deprecated, but extended:**
- `DbConnectionConfig` struct: extended with `environment`, `readonly`, `colorTag`, `defaultSchema` — backward-compatible with `Option<>` / `?` on new fields
- `host-api.ts` `ConnectionsApi`: extended with new methods — existing methods unchanged

---

## Open Questions

1. **`Statement::AlterDatabase` variant name in sqlparser 0.53**
   - What we know: sqlparser has `Statement::AlterTable`. ALTER DATABASE syntax exists.
   - What's unclear: Exact enum variant — may be `Statement::AlterDatabase`, `Statement::Alter(AlterStatement::Database)`, or similar.
   - Recommendation: Before implementing danger detection, run `grep -r "AlterDatabase\|Alter.*Database" ~/.cargo/registry/src/*/sqlparser-*/src/ast/` to verify the exact variant name. Do not assume.

2. **MySQL KILL QUERY connection ID thread safety**
   - What we know: MySQL `KILL QUERY <connection_id>` requires a separate DB connection and the connection ID of the running query.
   - What's unclear: Whether sqlx MySqlConnection exposes the underlying connection ID before the query starts.
   - Recommendation: Use `SELECT CONNECTION_ID()` query before starting the main query on that connection, store the result alongside the CancellationToken. This is the established MySQL pattern.

3. **react-window column header freeze with horizontal scroll**
   - What we know: `FixedSizeList` virtualizes rows but not columns. For 10+ column results, horizontal scrolling is needed.
   - What's unclear: Whether a simple `position: sticky; left: 0` CSS approach is sufficient for the first column freeze, or whether a grid virtualization approach (react-window `FixedSizeGrid`) is needed.
   - Recommendation: Start with `FixedSizeList` + CSS sticky for the first column freeze. If performance is inadequate for wide result sets, switch to `FixedSizeGrid` in the same phase. The planner should include this as a verification checkpoint.

4. **sql-formatter dialect parameter for MySQL vs PostgreSQL**
   - What we know: sql-formatter 15.7.2 supports `language: "sql"`, `"mysql"`, `"postgresql"`.
   - What's unclear: Whether `language: "mysql"` or `language: "postgresql"` produces meaningfully better output vs generic `"sql"` for the users' typical queries.
   - Recommendation: Use `language: dialect === "mysql" ? "mysql" : "postgresql"` where `dialect` comes from the active connection's `driver` field. This is low-risk and correct.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Rust / cargo | Tauri build | Check `cargo --version` | 1.77.2 minimum (Cargo.toml rust-version) | — |
| Node.js | npm install | Yes | v22.22.1 (confirmed) | — |
| sqlx | DB queries | Yes (Cargo.toml) | 0.8 | — |
| sqlparser | Danger detection | Yes (Cargo.toml) | 0.53 | — |
| tokio (with sync feature) | CancellationToken | Yes (Cargo.toml) | 1.x | — |
| tokio-util | CancellationToken | NOT in Cargo.toml | — | Must add before implementing EXEC-02 |
| @monaco-editor/react | SQL editor | Yes (package.json) | 4.7.0 | — |
| react-window | Result grid | Yes (package.json) | 2.2.6 | — |
| @xyflow/react | EXPLAIN graph | Yes (package.json) | 12.10.1 | — |
| elkjs | Graph layout | Yes (package.json) | 0.10.2 | — |
| sql-formatter | SQL formatting | NOT in package.json | — | Must `npm install sql-formatter` before EDIT-04 |
| tauri-plugin-store | Tab persistence | NOT needed | — | window.localStorage (existing project pattern) |

**Missing dependencies with no fallback:**
- `tokio-util` — required for EXEC-02 (query cancel). Must be added to Cargo.toml.
- `sql-formatter` — required for EDIT-04 (SQL formatting). Must be `npm install`ed.

**Missing dependencies with fallback:**
- None beyond the two above.

---

## Validation Architecture

> Nyquist validation config not found — treating as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (--experimental-strip-types) |
| Config file | none (command-line based) |
| Quick run command | `node --test --experimental-strip-types test/client/extension-boundaries.test.ts` |
| Full suite command | `node --test --experimental-strip-types test/client/*.test.ts` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CONN-01 | environment/readonly fields serialize round-trip | unit | `node --test --experimental-strip-types test/client/db-connection-config.test.ts` | ❌ Wave 0 |
| CONN-03 | readonly enforcement rejects DML at Rust layer | integration | Manual Tauri invoke test | manual-only |
| EDIT-04 | sql-formatter formats SQL correctly | unit | `node --test --experimental-strip-types test/client/sql-formatter.test.ts` | ❌ Wave 0 |
| SAFE-01 | dangerous SQL detection for all 6 categories | unit (Rust) | `cargo test -p db-schema-ddl-tauri db_connector::query::tests` | ❌ Wave 0 |
| SAFE-02 | prod connection requires DB name typing | manual | Manual UI test | manual-only |
| PLAN-01 | PlanNode normalization — MySQL and PG | unit (Rust) | `cargo test -p db-schema-ddl-tauri db_connector::explain::tests` | ❌ Wave 0 |
| PLAN-02 | FULL_TABLE_SCAN warning on type=ALL / Seq Scan | unit (Rust) | same as above | ❌ Wave 0 |
| EXEC-02 | cancel unregisters token from registry | unit (Rust) | `cargo test -p db-schema-ddl-tauri db_connector::query::cancel_tests` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `node --test --experimental-strip-types test/client/extension-boundaries.test.ts` (existing suite — regression guard)
- **Per wave merge:** full client test suite + Rust `cargo test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `test/client/db-connection-config.test.ts` — covers CONN-01 type roundtrip
- [ ] `test/client/sql-formatter.test.ts` — covers EDIT-04 formatting output
- [ ] Rust test modules inside `query.rs` and `explain.rs` — covers SAFE-01, PLAN-01, PLAN-02, EXEC-02

---

## Build Sequence (8 Steps — Must Be Followed In Order)

This sequence is locked by STATE.md architecture decisions. Each step is a prerequisite for the next.

| Step | What | Files Changed | Prerequisite |
|------|------|---------------|--------------|
| 1 | Type foundation | `shared/schema.ts` (15 new types + DbConnectionConfig extensions), `src-tauri/src/db_connector/mod.rs` (struct extensions) | Nothing |
| 2 | Rust command stubs | `src-tauri/src/db_connector/query.rs` (new), `explain.rs` (new), Cargo.toml (+tokio-util) | Step 1 |
| 3 | Register commands + managed state | `src-tauri/src/lib.rs` (DbPoolRegistry, CancellationRegistry, new command registrations) | Step 2 |
| 4 | IPC bridge | `client/src/lib/desktop-bridge.ts` (new db.* methods), `host-api.ts` (ConnectionsApi extension), `host-api-runtime.ts` (new requireCap guards), `builtin_extensions/mod.rs` (add `db.plan.read`, `db.result.export` capabilities) | Step 3 |
| 5 | Workspace refactor | `DbConnectorWorkspace.tsx` → layout shell + `db-workbench/` subdirectory; existing connection form + Schema/Diff tabs must remain intact | Step 4 |
| 6 | Connection environment UI | `ConnectionSidebar.tsx`, `WorkbenchLayout.tsx`, environment color band, readonly indicator | Step 5 |
| 7 | SQL editor + tabs | `SqlEditorPane.tsx`, `QueryTabs.tsx`, Monaco keybindings, sql-formatter integration | Step 5 |
| 8 | Result grid + EXPLAIN + safety | `ResultGridPane.tsx`, `ExplainPlanPane.tsx`, `DangerousSqlDialog.tsx`, `ResultExportMenu.tsx` | Steps 6 + 7 |

---

## Project Constraints (from CLAUDE.md)

- Code comments: Japanese
- User communication: Chinese
- No magic values — environment labels, DangerClass values, capability strings must be constants/enums
- Function cognitive load: max ~25 lines per function, max 3 nesting levels — use guard clauses
- Schema first: declare `PlanNode` and `QueryExecutionRequest` types before implementing
- Defensive programming: treat all DB responses as potentially missing fields
- No TODO stubs — implement what is asked (MVP) without speculative features
- Commit format: `[type] description` — no Co-Authored-By trailers
- Branching: feature branches — never work on main

---

## Sources

### Primary (HIGH confidence)

- `src-tauri/Cargo.toml` — confirmed installed: sqlx 0.8, sqlparser 0.53, tokio 1 (sync feature), tauri 2.10.3
- `package.json` — confirmed installed: @monaco-editor/react 4.7.0, react-window 2.2.6, @xyflow/react 12.10.1, elkjs 0.10.2
- `src-tauri/src/db_connector/mod.rs` — current DbConnectionConfig struct, all existing type definitions
- `src-tauri/src/lib.rs` — existing managed state pattern, command registration pattern
- `src-tauri/src/db_connector/introspect.rs` — sqlx pool creation pattern, mysql_opts/pg_opts builders
- `src-tauri/src/ddl_import.rs` — confirmed sqlparser usage: `Parser::parse_sql`, `Statement::CreateTable`, `MySqlDialect`
- `client/src/components/diff-viewer/MonacoDdlDiff.tsx` — confirmed Monaco integration pattern
- `client/src/lib/desktop-bridge.ts` — confirmed IPC invoke pattern, db.* namespace structure
- `client/src/extensions/host-api.ts` + `host-api-runtime.ts` — confirmed ConnectionsApi + requireCap pattern
- `client/src/pages/Dashboard.tsx` — confirmed `window.localStorage` persistence pattern
- `docs/db-workbench-extension-design.md` — product design canonical reference
- `docs/extension-boundary-spec.md` — capability model, checklist, anti-patterns
- `.planning/STATE.md` — locked architecture decisions (DbPoolRegistry, CancellationToken, PlanNode)

### Secondary (MEDIUM confidence)

- `npm view sql-formatter version` → 15.7.2 (confirmed current version as of 2026-03-24)
- `cargo search tokio-util` → 0.7.18 (confirmed crate exists, correct name)
- react-window API: `FixedSizeList` props — training data + npm registry; verify against react-window 2.2.6 README before implementing

### Tertiary (LOW confidence — flag for validation)

- MySQL EXPLAIN FORMAT=JSON nested structure for JOIN queries — training data; verify with actual MySQL 8.x output before implementing recursive walker
- PostgreSQL EXPLAIN FORMAT JSON structure — training data; verify with actual PG 14+ output
- sqlparser 0.53 `Statement::AlterDatabase` variant name — verify against crate source before implementing

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified from actual project files and npm registry
- Architecture: HIGH — patterns derived from existing codebase code reading
- Pitfalls: MEDIUM — most verified from code analysis; EXPLAIN JSON structure is training data
- Type definitions: HIGH — derived from design document + existing schema.ts patterns

**Research date:** 2026-03-24
**Valid until:** 2026-04-23 (30 days — dependencies are stable; sqlparser/tokio-util versions won't break)

---

## RESEARCH COMPLETE
