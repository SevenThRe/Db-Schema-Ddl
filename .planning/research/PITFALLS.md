# Domain Pitfalls: DB Workbench Features in Existing Tauri/Rust/React App

**Domain:** Adding SQL execution, result grid, query cancellation, ER diagram,
schema-aware autocomplete, and grid editing to an existing Tauri + sqlx + React desktop app.
**Researched:** 2026-03-24
**Confidence:** HIGH (codebase directly inspected, patterns derived from actual code)

---

## Critical Pitfalls

Mistakes that cause rewrites, data corruption, security regressions, or break v1.0–v1.3 flows.

---

### Pitfall 1: Per-Call Pool Construction Breaks Under Query Execution

**What goes wrong:**
The existing `introspect_schema` and `test_connection` each construct a fresh `MySqlPoolOptions` /
`PgPoolOptions`, run their query, then call `pool.close().await`. This is acceptable for
infrequent introspection, but if the new `db_query_execute` command follows the same pattern it
will pay a full TCP handshake + TLS negotiation cost on every Ctrl+Enter. At localhost this is
invisible; against a remote database with 50–200 ms RTT the user will notice a 300–600 ms pause
before the first row appears for every query, including trivial `SELECT 1`.

**Why it happens:**
The current code has no persistent connection pool state. There is no `AppState` or
`tauri::State<T>` holding a pool keyed by connection ID. The "one pool per call" approach was
fine for schema diff.

**Consequences:**
- Slow query startup for remote databases
- Connection count spikes on repeated Ctrl+Enter
- If the user has `max_connections` limited (e.g., a shared test DB), pool exhaustion
- If carried over to the cancel flow, there is nothing to cancel because the pool was created
  and destroyed within a single command invocation

**Prevention:**
Introduce a `DbPoolRegistry` as a Tauri managed state:
```rust
// src-tauri/src/db_connector/pool_registry.rs
pub struct DbPoolRegistry {
    pools: Mutex<HashMap<String, AnyPool>>,
}
```
Register it in `lib.rs` via `app.manage(...)`, then inject it into every new db command via
`tauri::State<DbPoolRegistry>`. Reuse the pool for the connection ID; create one on first use.
Close the pool when the connection config is deleted (`db_conn_delete`).

**Detection:**
Add a log timestamp before and after `pool.connect_with(...)` in any new query command. If you
see > 100 ms in any local test, the pool is not being reused.

**Phase:** Phase 1 (SQL editor + read-only grid). Must be resolved before any query command
is shipped. If deferred, the cancel flow (Phase 1 requirement EXEC-02) also cannot work.

---

### Pitfall 2: Tauri Async Commands Block the Main Thread When Tokio Runtime Is Not Configured

**What goes wrong:**
Tauri 2.x uses its own tokio runtime, but `#[tauri::command]` async functions that perform
long-running `.await` operations (e.g., `sqlx::query(...).fetch_all(&pool).await` on a slow
query) will hold a tokio worker thread for the duration. This is not blocking the UI thread in
the web sense — but if the tokio thread pool is saturated (many concurrent queries from multiple
connections, combined with ongoing auto-update polling, extension process health checks) the
command queue stalls. The UI shows a spinner that never resolves.

**Why it happens:**
The current `Cargo.toml` shows `tokio = { version = "1", features = ["fs", "io-util", "sync",
"process", "time", "macros"] }`. The `rt-multi-thread` feature is not explicitly listed — it is
pulled in transitively by Tauri, but any code that spawns unbounded tokio tasks (e.g., one task
per running query for cancellation) without limits will consume the same pool.

**Consequences:**
- Slow queries make all other Tauri commands (file list, extension health) appear frozen
- Extension process manager health checks miss their window, causing spurious "extension
  offline" errors
- Under test with multiple open query tabs, the app can appear completely non-responsive

**Prevention:**
- Use `tokio::task::spawn_blocking` only for CPU-bound work (none expected here)
- For each long-running query, use `sqlx`'s built-in statement timeout where supported:
  - MySQL: `SET SESSION wait_timeout=...` before executing, or use `sqlx::query`'s timeout
  - PostgreSQL: `SET statement_timeout = '30s'` or use `sqlx::query`'s timeout
- Limit concurrent query executions per connection using a `Semaphore` in the pool registry
  (one slot per connection is a reasonable starting point)
- Never `.unwrap()` or `.expect()` on futures in async Tauri commands — propagate errors

**Detection:**
Use Tauri's `core_get_process_metrics` command (already exists) to monitor memory growth.
A stuck tokio task leaks its stack allocation. A growing memory trend during repeated query
execution indicates leaked tasks.

**Phase:** Phase 1. Architecture decision must be made before writing `db_query_execute`.

---

### Pitfall 3: Query Cancellation Cannot Interrupt sqlx Queries Without a Separate Mechanism

**What goes wrong:**
The most obvious approach — storing a `tokio::task::JoinHandle` in a `HashMap<requestId, JoinHandle>`
and calling `handle.abort()` when the cancel command arrives — works for aborting the task, but
does **not** send a protocol-level cancellation to MySQL or PostgreSQL. The database continues
executing the query. If the query is a full table scan on a 50M row table, the DB CPU stays at
100% until it finishes or times out, even though the Rust side has moved on.

**Why it happens:**
`JoinHandle::abort()` drops the future, which closes the sqlx connection, but by the time the
Rust side drops the connection, the DB has already started executing. MySQL's cancel requires
sending a `COM_QUIT` or a new connection with `KILL QUERY <thread_id>`. PostgreSQL supports
cancel via a separate cancel request (protocol-level, not a new query).

**Consequences:**
- User thinks the query was cancelled; the database is still running
- On a production DB, this creates invisible load
- The pool connection that was holding the query is silently dropped; the pool may shrink
  below its minimum if not configured with `min_connections`

**Prevention — MySQL:**
Before executing a long query, capture the MySQL thread ID:
```sql
SELECT CONNECTION_ID()
```
Store it in the `DbPoolRegistry` keyed to `requestId`. In `db_query_cancel`, open a
separate short-lived connection and issue `KILL QUERY <thread_id>`.

**Prevention — PostgreSQL:**
sqlx's `PgConnection` exposes `.cancel_token()` on a raw connection (not a pool). Use
`sqlx::pool::PoolConnection` to acquire a dedicated connection for cancellable queries.
Store the `PgCancelToken` in the pool registry keyed to `requestId`.
Call `token.cancel()` from the cancel command.

**Detection:**
After calling cancel, check `information_schema.processlist` (MySQL) or `pg_stat_activity`
(PostgreSQL) to verify the query actually stopped.

**Phase:** Phase 1 (EXEC-02 is a Phase 1 requirement). Must be designed before writing
`db_query_execute`, not retrofitted after.

---

### Pitfall 4: IPC Serialization Overhead for Large Result Sets Causes UI Freeze

**What goes wrong:**
A query that returns 10,000 rows × 50 columns with long string values can produce a JSON
payload of 5–20 MB when serialized via Tauri's IPC bridge. The `serde_json` serialization
happens synchronously in the Rust command, and the JSON deserialization plus React state update
happens synchronously on the JS main thread. The entire WebView freezes during both operations.

**Why it happens:**
The existing `invoke<T>` wrapper in `desktop-bridge.ts` (line 77) calls Tauri's IPC and
receives the entire response as a single `Promise<T>`. There is no streaming. The 1000-row
limit stated in PROJECT.md only works if the Rust side enforces it.

**Concrete numbers for this stack:**
A row of 20 columns averaging 30 chars each serializes to roughly 700 bytes of JSON. 1000 rows
= ~700 KB. That is safe. But if a developer forgets to pass `limit` to `db_query_execute` and
the query is `SELECT * FROM large_table`, the full result set comes back. A 100K row table
with wide columns can produce > 50 MB. React's `setState` with 50 MB of new data causes a
multi-second freeze.

**Consequences:**
- App appears frozen for 2–10 seconds after large queries
- Windows may show "not responding" dialog on the WebView process
- If the connection is a prod DB, the accidental full scan creates load

**Prevention:**
The Rust command `db_query_execute` must enforce the row limit server-side, not client-side:
```rust
// Limit is applied in the SQL query layer, not after fetching
.fetch_many(&pool)  // stream rows
.take(limit + 1)    // +1 to detect overflow
```
Return a `truncated: bool` flag in the response when the limit was hit.
Never return more than 1000 rows through IPC without explicit user confirmation.
For export flows (`db_export_rows`), stream to a temp file and trigger the Tauri file save
dialog rather than passing bytes through IPC.

**Detection:**
Add a `row_count` field to the query response and log a warning in Rust when it approaches the
limit. Integration test with a table of 10K rows — the response must arrive in < 200 ms and
must be truncated to 1000.

**Phase:** Phase 1. The 1000-row limit must be enforced in the Rust command implementation,
not documented as a convention.

---

### Pitfall 5: Grid Editing via String Concatenation Creates SQL Injection

**What goes wrong:**
When implementing `db_grid_commit`, the intuitive approach is to build an UPDATE statement like:
```rust
// WRONG
let sql = format!(
    "UPDATE {} SET {} = '{}' WHERE {} = '{}'",
    patch.table_name, patch.column_name, patch.new_value,
    pk_column, pk_value
);
```
If `patch.new_value` contains `'; DROP TABLE users; --`, the UPDATE executes the DROP.
If `patch.table_name` comes from the frontend, it can contain arbitrary SQL.

**Why it happens:**
sqlx's parameterized queries (`sqlx::query("UPDATE t SET col = ? WHERE pk = ?").bind(val)`)
only support value binding, not identifier binding (table names, column names). Identifiers must
be injected as strings. Developers often mistake "I used `.bind()`" for "I am safe" when the
table/column names are still concatenated.

**Consequences:**
- Data loss or corruption on any connected database
- If the connection is prod (which the UI allows), this is catastrophic
- The readonly mode check on the frontend can be bypassed via developer tools

**Prevention — values:** Always use `.bind()` for values. Never format values into SQL strings.

**Prevention — identifiers:** Validate table and column names against the current schema
snapshot before using them in queries. In `db_grid_commit`, the Rust side must:
1. Re-introspect (or use the cached snapshot) to get the actual table/column list
2. Reject any `patch.table_name` or `patch.column_name` that does not appear in the snapshot
3. Quote identifiers using dialect-appropriate escaping:
   - MySQL: backtick-wrap and reject backticks in the name
   - PostgreSQL: double-quote-wrap and reject double-quotes in the name

**Prevention — readonly bypass:** The readonly check must live in the Rust command, not only
in the React UI. `db_grid_commit` must verify `readonly: true` on the stored connection config
and return an error if so. The frontend check is UX; the Rust check is security.

**Detection:**
Write a test that sends a `GridCommitRequest` with `table_name = "users; DROP TABLE users"` and
verify the Rust side returns an error, not an executed DROP.

**Phase:** Phase 2 (grid editing). The readonly-in-Rust check should be added in Phase 1 when
the environment model is implemented (CONN-03), even before grid editing exists.

---

### Pitfall 6: Dangerous SQL Detection via Regex Has Predictable False Negatives

**What goes wrong:**
The design doc (section 5.7) correctly identifies that dangerous SQL detection must scan actual
statements, not just watch for button clicks. The naive implementation is a regex like:
```rust
let is_dangerous = Regex::new(r"(?i)\b(DROP|TRUNCATE|ALTER)\b").unwrap();
```
This misses:
- `/* comment */ DROP TABLE` — comment prefix before keyword
- `DROP\nTABLE` — newline between keyword and object
- `DrOp` with mixed case (regex flag helps but CTE aliases can still confuse)
- `DELETE FROM users` — caught separately, but `DELETE FROM users WHERE 1=1` (effectively
  unbounded) is not caught by a WHERE-presence check if the WHERE clause is `WHERE 1=1`

Conversely, it produces false positives on:
- Column names containing `DROP` (e.g., `SELECT drop_date FROM events`)
- Comments that mention `DROP` in documentation strings
- String literals: `INSERT INTO log VALUES ('DROP TABLE was attempted')`

**Why it happens:**
The project already has `sqlparser = "0.53"` in `Cargo.toml`. The regex approach is faster to
implement but structurally incorrect. `sqlparser` parses SQL into an AST where `DROP` appears
as `Statement::Drop`, not a substring match.

**Consequences:**
- False negatives: dangerous SQL executes without confirmation on prod
- False positives: legitimate queries are blocked, frustrating the user
- Users learn to work around the dialog and stop reading it (cry-wolf effect)

**Prevention:**
Use `sqlparser` to parse each statement. Check `ast::Statement` variants:
- `Statement::Drop { .. }` — always dangerous
- `Statement::Truncate { .. }` — always dangerous
- `Statement::AlterTable { .. }` — always dangerous (also `AlterDatabase`)
- `Statement::Delete { selection: None, .. }` — DELETE without WHERE
- `Statement::Update { selection: None, .. }` — UPDATE without WHERE

For multi-statement scripts, parse all statements before executing any. If any statement is
dangerous, collect them all and present a consolidated confirmation dialog.

**Fallback:** If `sqlparser` fails to parse (non-standard dialect extension), fall back to
regex but mark the result as "could not fully analyze — treat as potentially dangerous" and
force confirmation regardless.

**Detection:**
Test matrix: `DELETE FROM users WHERE 1=1` (should NOT trigger — has WHERE), `DELETE FROM users`
(SHOULD trigger), `SELECT drop_date FROM t` (should NOT trigger), `/* drop */ DROP TABLE t`
(SHOULD trigger).

**Phase:** Phase 1 (SAFE-01 and SAFE-02 are Phase 1 non-negotiables).

---

### Pitfall 7: Readonly Mode Is Bypassed via Frontend Developer Tools

**What goes wrong:**
The current capability check in `host-api-runtime.ts` uses `requireCap(granted, cap)` which
throws if the capability is not in the granted list. For the new `readonly` mode, developers
may implement the guard only in the React component:
```tsx
// WRONG — only in UI
{!connection.readonly && <Button onClick={executeSQL}>Execute</Button>}
```
A user (or attacker with access to the local machine) can open DevTools, call
`window.__TAURI__.invoke("db_query_execute", { connectionId: "prod-id", sql: "DROP TABLE..." })`
and bypass the UI entirely. On a desktop app, the WebView is the same process, and DevTools are
accessible.

**Why it happens:**
The existing capability model in `host-api-runtime.ts` protects host API surface, but the raw
`invoke()` in `desktop-bridge.ts` is a thin wrapper. The Rust command handlers in `commands.rs`
do not re-check the connection's `readonly` or `environment` fields.

**Consequences:**
- Production database modified despite "readonly" indicator being shown
- DML executed on prod without the required `prod` environment confirmation dialog
- A user who trusted the readonly indicator is not protected

**Prevention:**
Every write-path Tauri command must re-read the connection config from storage and enforce:
```rust
// In db_query_execute, db_grid_commit, etc.
if config.readonly && is_mutating_sql(&parsed_statements) {
    return Err("この接続は読み取り専用です".to_string());
}
```
The `readonly` flag lives in `DbConnectionConfig` which is stored in the local JSON store.
Reading it from storage (not trusting the frontend-supplied config) is the correct pattern.

**Detection:**
Open DevTools in the Tauri app and invoke `db_query_execute` directly via
`window.__TAURI__.invoke(...)` with a readonly connection and a DELETE statement. If it
executes, the guard is missing.

**Phase:** Phase 1 when environment model (CONN-03) is implemented. The Rust-side readonly
check must be in place before any write-path command exists.

---

## Moderate Pitfalls

Mistakes that cause regressions, performance issues, or maintenance problems.

---

### Pitfall 8: Breaking Existing db_connector Flows When Adding Pool State

**What goes wrong:**
The existing `db_introspect` and `db_diff` commands work by creating a fresh pool, running
queries, and closing it. When the `DbPoolRegistry` is introduced (Pitfall 1 fix), developers
often change these existing commands to use the registry. If the registry is not yet fully
initialized when these commands are called (e.g., right after startup before any query has
been run), or if the pool is closed when the connection is deleted, the existing introspect
flow breaks with a confusing "pool not found" error instead of a connection failure.

**Prevention:**
Keep `db_introspect` and `db_diff` using their own pools (or using the registry with a
lazy-init fallback). Do not force them through the new query execution path. Add the registry
strictly as an additive change. Test the v1.0–v1.3 connection management flow end-to-end
after every change to `db_connector/mod.rs`.

**Detection:**
Regression test: after adding `DbPoolRegistry`, open the Schema Diff panel and run a diff
between two existing connections. If it fails where it previously succeeded, the pool
initialization is incorrect.

**Phase:** Phase 1. Any refactor of `db_connector` must have a regression test baseline.

---

### Pitfall 9: DbConnectionConfig Has No environment or readonly Fields Yet

**What goes wrong:**
`DbConnectionConfig` in `src-tauri/src/db_connector/mod.rs` currently has no `environment`
or `readonly` fields. Adding them as `Option<String>` and `Option<bool>` for backward
compatibility with existing saved configs is the right approach. But if the frontend sends
a `DbConnectionConfig` that includes `environment: null` and the Rust `#[serde(rename_all =
"camelCase")]` struct does not match, `db_conn_save` silently drops the fields and the
connection is saved without the environment label.

**Prevention:**
Use `#[serde(default)]` on the new fields in the Rust struct. Write a migration check in
`storage::list_db_connections` that defaults missing fields to `environment: "dev"` and
`readonly: false`. Test with an existing connection config JSON that predates the new fields.

**Detection:**
Serialize an existing stored connection, add the new fields in the frontend, save, re-read
from storage, and verify the fields round-trip correctly.

**Phase:** Phase 1 (CONN-01 through CONN-03).

---

### Pitfall 10: Monaco Autocomplete Triggers Introspect on Every Keystroke

**What goes wrong:**
Monaco's `registerCompletionItemProvider` calls the registered provider on every keystroke.
If the provider implementation calls `host.connections.introspect(connectionId)` (which invokes
`db_introspect` → `introspect_mysql` → new pool → INFORMATION_SCHEMA query) on every call,
the user will cause a schema query for every character typed. With a 200 ms network RTT,
autocomplete becomes a query storm.

**Prevention:**
The schema snapshot for autocomplete must be a cached in-memory snapshot, not a live query.
The correct architecture:
1. Cache the `DbSchemaSnapshot` in a React ref or `useRef` keyed by `connectionId`
2. Invalidate the cache when `db_introspect` is explicitly called (connection switch, manual
   refresh button)
3. The Monaco completion provider reads only from the cache — it never triggers an IPC call
4. Debounce schema refresh on connection open: fetch once, not on every editor mount

**Detection:**
Open the Network/IPC trace (Tauri's `tauri_plugin_log` with `Info` level), type 50 characters
in the SQL editor, and count how many `db_introspect` calls appear in the log. Acceptable: 0.
Actual if not fixed: 50.

**Phase:** Phase 1 when Monaco is integrated (EDIT-01, AUTO-01).

---

### Pitfall 11: ER Diagram Foreign Key Queries Differ Significantly Between MySQL and PostgreSQL

**What goes wrong:**
MySQL stores foreign key information in `INFORMATION_SCHEMA.KEY_COLUMN_USAGE` and
`INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS`. PostgreSQL stores them in `pg_constraint`
joined with `pg_class` and `pg_attribute`. The existing `introspect_mysql` and
`introspect_postgres` functions already diverge — but neither currently fetches foreign keys.
Writing the ER diagram introspect (`db_introspect_relations`) as a single query with a
`#[cfg]` branch or runtime `if driver == MySQL` is manageable, but common mistakes are:
- Using MySQL's query against PostgreSQL (returns empty, not an error)
- Using `INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS` against PostgreSQL (returns partial data
  because PG's `information_schema` coverage for FK constraint names is incomplete relative
  to `pg_constraint`)
- Not handling self-referencing foreign keys (a table that has an FK to itself)

**Prevention:**
Write separate `introspect_relations_mysql` and `introspect_relations_postgres` functions,
just as `introspect_mysql` and `introspect_postgres` are separated. For PostgreSQL, use
`pg_constraint` directly:
```sql
SELECT
  conname AS constraint_name,
  conrelid::regclass AS from_table,
  a.attname AS from_column,
  confrelid::regclass AS to_table,
  af.attname AS to_column
FROM pg_constraint c
JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
JOIN pg_attribute af ON af.attrelid = c.confrelid AND af.attnum = ANY(c.confkey)
WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace
```
Test with at least one self-referencing FK and one composite FK.

**Detection:**
Create a test schema with at least two FK relationships (including one composite FK) and verify
the ER diagram renders all edges correctly for both MySQL and PostgreSQL.

**Phase:** Phase 3 (ER-01). This is a research requirement for Phase 3 — do not attempt to
use a generic cross-dialect query.

---

### Pitfall 12: Multi-Statement Script Execution Returns Ambiguous Error Attribution

**What goes wrong:**
When executing a multi-statement script (`mode: "script"`), if statement 3 of 5 fails, the
user needs to know which statement failed. The straightforward implementation iterates
statements and stops on the first error. But if the implementation wraps all 5 statements in
a single `sqlx::query(full_script)` call, the error message from the database names the
internal line number within the combined string, not the original editor line number. The user
cannot identify which statement caused the error without counting from the start of the script.

**Prevention:**
Parse the script into individual statements using `sqlparser` before execution. Execute each
statement independently (separate sqlx calls, same connection). Track the source position
(start line, end line) of each statement in the original text. On error, return the source
position alongside the error message so the frontend can highlight the failing statement in
Monaco.

**Detection:**
Test with a 5-statement script where statement 3 contains a syntax error. Verify the error
response identifies statement 3 by its editor line range, not a combined-script byte offset.

**Phase:** Phase 1 (EXEC-01).

---

## Minor Pitfalls

Mistakes that cause friction but do not corrupt data or break existing flows.

---

### Pitfall 13: DbConnectorWorkspace.tsx Grows Into an Unmaintainable Mega-Component

**What goes wrong:**
The design doc (section 6.6) warns explicitly: "現有 `DbConnectorWorkspace.tsx` 不应继续膨胀
成一个超大文件". The existing component already handles connection list, schema view, and diff.
Adding Monaco, result grid, explain plan, object explorer, and ER diagram into the same file
produces a 2000+ line component that is impossible to test, debug, or review.

**Prevention:**
Treat refactoring `DbConnectorWorkspace.tsx` into the `db-workbench/` shell as Phase 1 step 0
(as recommended in design doc section 11). The shell component should have no business logic —
only panel mounting and tab routing. Add a file size lint if the project has one.

**Phase:** Phase 1, first commit.

---

### Pitfall 14: Execution Plan Normalization Breaks on Older MySQL Versions

**What goes wrong:**
`EXPLAIN FORMAT=JSON` was introduced in MySQL 5.6 but the JSON structure changed significantly
in MySQL 8.0. The normalized `PlanNode` structure in the design doc must handle both schemas.
MySQL 5.7 uses `"query_block"` as the top-level key; MySQL 8.0 uses `"query_block"` but with
additional `"cost_info"` nesting. If the normalization function assumes 8.0 structure and the
user has a 5.7 database, the explain graph renders empty.

**Prevention:**
Normalize defensively: walk the JSON tree looking for known keys (`"query_block"`, `"table"`,
`"nested_loop"`) rather than assuming a fixed depth. Include a version check from the connection
test (`SELECT VERSION()`) and log a warning if the version is below 8.0.

**Phase:** Phase 1 (PLAN-01). Affects all users of MySQL 5.7 in enterprise environments.

---

### Pitfall 15: Tauri Command Name Collisions Silently Fail to Register

**What goes wrong:**
In `lib.rs`, `tauri::generate_handler![]` takes a flat list of command function references.
If two modules define a function with the same name (e.g., both `db_connector::commands` and
a future `db_workbench::commands` define `db_query_execute`), Rust will produce a compile error.
However, if a command is added to a module but not added to the `generate_handler![]` list,
Tauri does not error at compile time — the frontend receives "Command not found" at runtime.

**Prevention:**
After adding any new `#[tauri::command]` function, verify it is in the `invoke_handler` list
in `lib.rs`. Add an integration smoke test that calls each new command with a minimal payload
and verifies it does not return "Command not found".

**Phase:** Applies to every phase. Most likely to cause confusion in Phase 1 when 6+ new
commands are added at once.

---

### Pitfall 16: Host API `ALL_CAPABILITIES` Constant Silently Grants New Capabilities

**What goes wrong:**
`host-api-runtime.ts` line 12–17 defines `ALL_CAPABILITIES` as a hardcoded list used as the
default when `grantedCapabilities` is not passed. New capabilities (`db.plan.read`,
`db.data.edit`, `db.result.export`) added in Phase 1 must also be added to `ALL_CAPABILITIES`
or the builtin `db-connector` extension will not be able to call them when rendered without
explicit capability injection.

Conversely, if `ALL_CAPABILITIES` is updated but the builtin extension manifest in
`src-tauri/src/builtin_extensions/` is not updated to declare the new capabilities, the
extension boundary spec's `useHostApiFor()` contract (referenced in `CLAUDE.md`'s extension
boundary spec) will flag a capability mismatch in the capability fail-closed model.

**Prevention:**
Update `ALL_CAPABILITIES`, the builtin extension manifest, and the `host-api-runtime.ts`
`requireCap` guards in the same commit. The extension boundary spec onboarding checklist
(docs/extension-boundary-spec.md §6) should be run for any new capability.

**Phase:** Phase 1 when `db.plan.read`, `db.data.edit`, `db.result.export` are introduced.

---

## Phase-Specific Warnings Summary

| Phase | Topic | Likely Pitfall | Required Mitigation |
|-------|-------|---------------|---------------------|
| Phase 1 | Pool architecture | Per-call pool creation | Add `DbPoolRegistry` as managed state before any query command |
| Phase 1 | Query cancellation | Abort without DB-level cancel | Capture thread ID (MySQL) or cancel token (PostgreSQL) on query start |
| Phase 1 | IPC payload size | Full result set in single response | Hard-enforce 1000-row limit in Rust, return `truncated: bool` |
| Phase 1 | Dangerous SQL detection | Regex false negatives | Use `sqlparser` AST — `sqlparser` crate already in `Cargo.toml` |
| Phase 1 | Readonly enforcement | Frontend-only check bypassed via DevTools | Rust command reads stored `readonly` field and rejects write operations |
| Phase 1 | Monaco autocomplete | Live introspect on every keystroke | Cache snapshot in React ref; never IPC in completion provider |
| Phase 1 | Tokio thread saturation | Long queries block extension health checks | Add per-connection `Semaphore` in pool registry |
| Phase 1 | Multi-statement error | Ambiguous error line attribution | Parse to individual statements; track source positions |
| Phase 1 | Component size | DbConnectorWorkspace.tsx grows unbounded | Refactor to `db-workbench/` shell before adding features |
| Phase 1 | Command registration | New commands missing from `generate_handler!` | Checklist: every new `#[tauri::command]` must be in `lib.rs` |
| Phase 1 | Capability constants | `ALL_CAPABILITIES` not updated | Update manifest + runtime + constants in same commit |
| Phase 1 | Explain plan format | MySQL 5.7 vs 8.0 JSON structure | Defensive tree walk, not fixed-depth extraction |
| Phase 2 | Grid editing SQL injection | String concatenation for identifiers | Validate identifiers against schema snapshot; `.bind()` for values only |
| Phase 2 | Readonly bypass in grid | `readonly` only checked in UI | `db_grid_commit` must re-read and enforce `readonly` from storage |
| Phase 2 | Environment model fields | `DbConnectionConfig` missing new fields | `#[serde(default)]` on Rust side; migration default in storage layer |
| Phase 2 | Transaction atomicity | Multiple patches in separate statements | Wrap all patches in a single `BEGIN` / `COMMIT` block on the Rust side |
| Phase 3 | ER diagram FK queries | MySQL vs PostgreSQL schema diverge | Separate `introspect_relations_mysql` / `introspect_relations_postgres` |
| Phase 3 | Self-referencing FKs | ER diagram renders cycle incorrectly | Test with self-referencing FK before shipping ER diagram |

---

## Sources

- Direct inspection of `src-tauri/src/db_connector/introspect.rs` — per-call pool pattern confirmed
- Direct inspection of `src-tauri/Cargo.toml` — `sqlparser = "0.53"` already available
- Direct inspection of `src-tauri/src/lib.rs` — flat `generate_handler!` list pattern
- Direct inspection of `client/src/extensions/host-api-runtime.ts` — `ALL_CAPABILITIES` hardcoded list
- Direct inspection of `client/src/lib/desktop-bridge.ts` — `invoke<T>` single-response pattern
- Direct inspection of `src-tauri/src/db_connector/mod.rs` — `DbConnectionConfig` has no environment/readonly yet
- `docs/db-workbench-extension-design.md` section 8 (security constraints)
- `.planning/PROJECT.md` constraints section (parameterized SQL, 1000-row limit)
- sqlx documentation: cancellation tokens exist on `PgConnection`, not on pool checkouts (MEDIUM confidence)
- MySQL protocol: `KILL QUERY` is the correct cancellation mechanism (HIGH confidence, standard protocol)
- `sqlparser` crate: `Statement::Drop`, `Statement::Delete { selection }` variants available (HIGH confidence — crate already in use in this repo at `src-tauri/src/` based on `Cargo.toml`)
