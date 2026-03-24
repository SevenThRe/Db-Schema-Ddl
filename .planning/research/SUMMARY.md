# Research Summary: DB 工作台 v1.4

**Synthesized:** 2026-03-24
**Sources:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md
**Confidence:** HIGH overall — all 4 research files derived from direct codebase inspection + authoritative external docs

---

## Executive Summary

DB 工作台 v1.4 upgrades the existing `db-connector` builtin extension into a full-featured SQL workbench. The upgrade is an in-place evolution — no new extension ID, no manifest migration — only the display name changes. The existing codebase already contains all major UI dependencies (Monaco, xyflow, elkjs, react-window, sqlx, sqlparser), so the milestone requires exactly **1 new npm package** (`sql-formatter`) and **1 new Rust crate** (`tokio-util`). This is architecturally a favorable position: the stack research confirms the build can proceed without evaluating alternatives for the core rendering, execution, or layout layers.

The primary complexity is concentrated in three areas: (1) the Rust query execution layer, which must introduce persistent connection pooling and a requestId-based cancellation model before any other query feature can be built safely; (2) the EXPLAIN plan normalization layer, where MySQL and PostgreSQL return structurally different JSON that must be unified into a dialect-agnostic `PlanNode` tree before the frontend can render it; and (3) the grid editing feature, which is the only write-path in the workbench and carries SQL injection risk if identifier validation against the live schema snapshot is omitted. The research is unanimous: address these three areas in the correct build order and the rest of the milestone is medium-complexity incremental work.

The most important architectural decision is adopting the **8-step build order** defined in ARCHITECTURE.md: type foundation first, Rust stubs second, IPC bridge third, workspace refactor fourth, then feature delivery in phase order. Skipping the early steps to ship features faster is the single most reliable way to produce a rewrite 30 days later. The pitfalls research confirms this pattern with specific failure modes from the existing codebase's current per-call pool construction and missing environment fields.

---

## Stack Additions

### Net-New Dependencies

| Layer | Package | Version | Purpose |
|-------|---------|---------|---------|
| Frontend (npm) | `sql-formatter` | ^15.7.2 | SQL formatting for Alt+Shift+F (EDIT-04); dialect-aware, comment-preserving, tree-shakeable ESM |
| Rust (Cargo) | `tokio-util` | 0.7 (features = ["sync"]) | `CancellationToken` for query cancellation (EXEC-02); `CancellationToken` lives in `tokio-util::sync`, not in `tokio` itself |

**Total new dependencies: 2 (1 npm, 1 Cargo)**

### Key API Decisions

| Capability | API Decision | Rationale |
|------------|-------------|-----------|
| SQL formatting | `format(sql, { language, keywordCase: 'upper', tabWidth: 2 })` from `sql-formatter` | Only maintained dialect-aware SQL formatter; `@sqltools/formatter` is abandoned; `prettier` too heavy for keybinding |
| Monaco autocomplete | `monaco.languages.registerCompletionItemProvider('sql', ...)` — native Monaco API | `monaco-sql-languages` (DTStack) only stable on Monaco 0.37.1; project is on 0.55.1. ANTLR4 bundle (~800 KB) not justified for 2-dialect workbench |
| ER + Explain layout | `elkjs` `layered` algorithm — already present | `dagre` not in repo; `elkjs` handles both tree (explain) and DAG-like FK graphs (ER) from one package; `elk.direction: DOWN` for explain, `RIGHT` for ER |
| Query cancellation | `tokio_util::sync::CancellationToken` + `tokio::select!` | `JoinHandle::abort()` drops Rust future but does not cancel DB-side query; `CancellationToken` + MySQL `KILL QUERY` / PostgreSQL `PgCancelToken` is the correct approach |
| Grid editing (values) | `sqlx::query().bind(value)` — parameterized always | String concatenation of values = SQL injection; `.bind()` is non-negotiable |
| Grid editing (identifiers) | Whitelist validation against `DbSchemaSnapshot` + dialect-appropriate quoting | `sqlx` does not support identifier binding; whitelist is the only safe path |
| Dangerous SQL detection | `sqlparser` crate `Statement` AST variants — already in `Cargo.toml` | Regex has predictable false negatives (comments, string literals, `WHERE 1=1`); `sqlparser` is already a dependency |
| Result grid virtualization | `react-window` `FixedSizeList` — already in deps | `FixedSizeGrid` for 2-axis virtualization (wide results); do NOT add `ag-grid-react` or `react-virtualized` |

---

## Feature Landscape

### Phase 1 — Table Stakes (Must-Have)

These are non-negotiable for a product that does not feel incomplete.

| Feature | Complexity | Key Design Decision |
|---------|------------|---------------------|
| Monaco SQL editor with syntax highlighting | Low | Dialect switches on connection change |
| Ctrl+Enter: selection → current statement → script | Low-Medium | Statement boundary must skip semicolons in strings and comments |
| Alt+Shift+F SQL formatter | Low | `sql-formatter` npm; pin version |
| Read-only result grid (1000-row limit, virtual scroll) | Medium | `react-window FixedSizeList`; sticky header via separate DOM element |
| Elapsed time + row count in result footer | Low | Returned in `DbQueryResult.elapsedMs` + `.rowCount` |
| Error display inline with editor | Low | Error attributed to source statement by line range |
| Multiple query tabs | Medium | Tab state in React; each tab owns its content + result |
| Dangerous SQL confirmation dialog | Medium | `sqlparser` AST-based detection; prod requires typing database name |
| Connection environment color band | Low | `DbConnectionConfig.environment` field (dev/test/prod) + CSS color map |
| Export result as CSV / JSON / Markdown | Low | Rust-side serialization via `db_export_rows` command; stream to temp file for large exports |
| Basic EXPLAIN plan visualization | High | MySQL EXPLAIN FORMAT=JSON vs PostgreSQL EXPLAIN (FORMAT JSON) must be normalized to `PlanNode` in Rust before reaching frontend; xyflow + elkjs for rendering |

### Phase 2 — Differentiators (Should-Have)

| Feature | Complexity | Key Design Decision |
|---------|------------|---------------------|
| Object explorer tree (lazy load) | Medium | Lazy load on expand; MySQL `db.table` vs PostgreSQL `db.schema.table` namespace depth differs |
| In-place grid editing (single-table + PK) | High | Edit mode only for single-table SELECT with PK in result; `GridCommitDialog` shows SQL preview before commit; all patches in one transaction |
| Query history (tab persistence) | Low-Medium | Defer full history to Phase 2; session-only tabs in Phase 1 |
| Schema-aware autocomplete | Medium | One global completion provider; reads from cached schema snapshot via React ref — never triggers IPC on keystroke |

### Phase 3 — Structured Exploration (Nice-to-Have)

| Feature | Complexity | Key Design Decision |
|---------|------------|---------------------|
| FK + index introspection expansion | Medium | Separate `introspect_relations_mysql` and `introspect_relations_postgres` — do not use a cross-dialect query |
| ER diagram (auto-layout, search, click-to-explorer) | High | `elkjs` layered, direction RIGHT; self-referencing FK must be tested; read-only, no node dragging |
| Enhanced autocomplete (alias tracking, multi-FROM) | Medium | `node-sql-parser` optional at this phase; regex-based FROM scanner sufficient for Phase 1-2 |

### Phase 4 — Deferred (v2+)

| Feature | Why Deferred |
|---------|-------------|
| ER drag-to-relate + ALTER generation | Requires DDL undo/redo, dialect ALTER syntax, safe confirmation chain |
| Excel DDL ↔ live DB linkage | Unique product differentiator; architecturally complex; belongs after workbench is stable |
| Query history persistence across sessions | Adds storage schema; Phase 2 session-only tabs are sufficient |
| Optimistic locking for grid editing | Last-write-wins is acceptable for Phase 2 |

### Anti-Features (Explicit Do-Not-Build)

- Arbitrary result set editing (multi-table JOIN, no PK) — data corruption risk; DBeaver complaints confirm this
- Full SQL AST autocomplete compiler in JavaScript — months of work, not needed
- Auto-save or auto-execute on keystroke — user trust violation
- Streaming results without row cap — no UX precedent; kills performance
- Second parallel `db-workbench` extension ID — causes navigation duplication and manifest migration cost

---

## Architecture Decisions

### Build Order (8 steps, with dependencies)

**Step 1: Type Foundation** (no UI, no commands)
- Extend `DbConnectionConfig` in `shared/schema.ts` with `environment`, `readonly`, `colorTag`, `defaultSchema`
- Extend `DbSchemaSnapshot` with `foreignKeys`, `indexes`
- Add all new types: `DbQueryResult`, `DbPlanNode`, `DbExplainPlan`, `DbForeignKey`, `DbGridPatch`, etc.
- Mirror in `db_connector/mod.rs` as Rust structs with `#[serde(rename_all = "camelCase")]`
- Confirm `npm run check` + `cargo build` both pass
- Dependency: nothing blocks this; must be first

**Step 2: Rust Module Stubs + Command Registration**
- Create `query.rs`, `explain.rs`, `grid_edit.rs`, `relations.rs` as stub modules returning `Err("not implemented")`
- Add `pub mod` declarations in `mod.rs`; thin dispatchers in `commands.rs`
- Register all 6 new commands in `lib.rs` `generate_handler![]`
- Add `CancellationRegistry` as managed state in `lib.rs`
- Dependency: requires Step 1 types in Rust

**Step 3: IPC Bridge Wiring**
- Extend `desktopBridge.db` in `desktop-bridge.ts` with 6 new async methods
- Add method signatures to `ConnectionsApi` in `host-api.ts`
- Add capability constants (`db.plan.read`, `db.data.edit`, `db.result.export`) to `host-api-runtime.ts`
- Wire new methods in `createConnectionsApi()` with `requireCap` guards
- Dependency: requires Step 2 (command names must exist in Rust)

**Step 4: DbConnectorWorkspace Refactor**
- Reduce `DbConnectorWorkspace.tsx` to layout shell with tab router only
- Move existing connection/schema/diff UI into `db-workbench/` placeholder components
- Add `ConnectionBand.tsx` for environment color band
- Regression check: existing connection/schema/diff flows must still work
- Dependency: requires Step 3

**Step 5: Phase 1 Core — SQL Editor + Read-only Grid + Explain**
- Implement `query.rs`: persistent `DbPoolRegistry`, `CancellationToken` cancellation, 1000-row hard limit
- Implement `explain.rs`: EXPLAIN FORMAT=JSON parsing, `PlanNode` normalization for MySQL + PostgreSQL
- Build `SqlEditorPane.tsx`, `ResultGridPane.tsx`, `ExplainPlanPane.tsx`, `DangerousSqlDialog.tsx`
- Dependency: requires Steps 1-4

**Step 6: Phase 1 Completion — Export + Environment Model**
- Implement `db_export_rows` in `query.rs` with CSV/JSON/Markdown/SQL Insert serializers
- Wire environment color band from `DbConnectionConfig.environment` into `ConnectionBand.tsx`
- Add readonly enforcement in Rust commands (read from stored config, not frontend-supplied)
- Dependency: requires Step 5

**Step 7: Phase 2 — Grid Editing**
- Implement `grid_edit.rs`: parameterized UPDATE/INSERT/DELETE in a single transaction; identifier whitelist validation
- Extend `ResultGridPane.tsx` with edit mode, pending patch tracking, yellow highlight
- Build `GridCommitDialog.tsx` with SQL preview before commit
- Dependency: requires Step 5 to be stable and tested; do not start until query chain is proven

**Step 8: Phase 3 — ER Diagram + Object Explorer** (can run parallel to Step 7)
- Implement `relations.rs`: separate MySQL and PostgreSQL FK + index introspection functions
- Build `ObjectExplorerPane.tsx` with lazy-load tree and right-click actions
- Build `ErDiagramPane.tsx` with xyflow auto-layout via elkjs
- Dependency: requires Step 3 (`introspectRelations` wired)

### Key Integration Points (Existing Files That Change)

| File | What Changes |
|------|-------------|
| `shared/schema.ts` | Add ~15 new type interfaces; extend `DbConnectionConfig` and `DbSchemaSnapshot` |
| `src-tauri/src/db_connector/mod.rs` | Add new Rust structs; add `pub mod` for 4 new modules; extend existing structs |
| `src-tauri/src/db_connector/commands.rs` | Add 6 new thin command dispatchers |
| `src-tauri/src/lib.rs` | Register 6 new commands; add `CancellationRegistry` managed state |
| `client/src/lib/desktop-bridge.ts` | Add 6 new async methods to `desktopBridge.db` |
| `client/src/extensions/host-api.ts` | Add new `ConnectionsApi` methods + request/response types |
| `client/src/extensions/host-api-runtime.ts` | Add 3 new capability constants; wire new methods with guards |
| `client/src/components/extensions/DbConnectorWorkspace.tsx` | Reduce to layout shell; delegate to `db-workbench/` sub-components |

### New Rust Modules

| Module | Responsibility |
|--------|---------------|
| `db_connector/query.rs` | Execute SQL; `DbPoolRegistry` (persistent per-connection pool); `CancellationRegistry`; paginated row streaming; export serializers |
| `db_connector/explain.rs` | EXPLAIN FORMAT=JSON execution; MySQL + PostgreSQL normalization to `PlanNode` tree |
| `db_connector/grid_edit.rs` | Parameterized UPDATE/INSERT/DELETE; identifier whitelist validation; transaction scope |
| `db_connector/relations.rs` | FK + index introspection; separate MySQL and PostgreSQL query functions |

### New React Components

| Component | Purpose |
|-----------|---------|
| `db-workbench/SqlEditorPane.tsx` | Monaco editor, statement detection, keyboard bindings, autocomplete wiring |
| `db-workbench/ResultGridPane.tsx` | Virtual-scroll result grid, sort, copy, export trigger, edit mode |
| `db-workbench/ExplainPlanPane.tsx` | xyflow + elkjs plan tree, full-scan highlighting, node detail sidebar |
| `db-workbench/ObjectExplorerPane.tsx` | Lazy-load DB object tree, right-click actions |
| `db-workbench/ErDiagramPane.tsx` | xyflow ER diagram with auto-layout, search, click-to-explorer |
| `db-workbench/DangerousSqlDialog.tsx` | Env-aware confirmation (dev=yellow, test=orange, prod=red + name entry) |
| `db-workbench/GridCommitDialog.tsx` | Pending patches list, SQL preview, commit/rollback |
| `db-workbench/QueryTabs.tsx` | Multi-tab query state management |
| `db-workbench/ConnectionBand.tsx` | Environment color band + readonly indicator in workspace header |

---

## Watch Out For (Top Pitfalls)

### Pitfall 1 — Per-Call Pool Construction (CRITICAL, Phase 1)

**What breaks:** The existing `introspect_schema` creates and closes a fresh connection pool per call. If `db_query_execute` follows the same pattern, each Ctrl+Enter pays a full TCP + TLS handshake. At remote DB RTTs of 50–200 ms this is 300–600 ms of dead time before the first row appears. More critically, the requestId-based cancellation model (EXEC-02) cannot work without a persistent pool — there is nothing to cancel if the connection is created and destroyed within a single command.

**Prevention:** Add `DbPoolRegistry` as Tauri managed state in `lib.rs` before writing any query command. Registry stores `HashMap<connectionId, AnyPool>`. Reuse pool for same connectionId; create on first use; close on connection delete. Existing `db_introspect` and `db_diff` keep their own pools (do not force them through the registry — additive only).

---

### Pitfall 2 — SQL Injection via Grid Editing Identifier Concatenation (CRITICAL, Phase 2)

**What breaks:** `sqlx` parameterized `.bind()` only works for values, not identifiers. Table names and column names from the frontend cannot be bound — they must be concatenated as strings. Without whitelist validation against the live schema snapshot, `patch.table_name = "users; DROP TABLE users"` executes the DROP.

**Prevention:** In `db_grid_commit`, validate every identifier in `DbGridPatch` against the current `DbSchemaSnapshot` before building the query string. Reject anything not in the snapshot. Additionally, enforce the `readonly` flag from the stored connection config in Rust — not from the frontend-supplied value.

---

### Pitfall 3 — Dangerous SQL Detection via Regex Has False Negatives (CRITICAL, Phase 1)

**What breaks:** `/DROP|TRUNCATE|ALTER/i` misses `/* comment */ DROP TABLE`, `DELETE FROM users WHERE 1=1` (has WHERE clause, technically), and produces false positives on `SELECT drop_date FROM events` or string literals containing DDL keywords.

**Prevention:** Use the `sqlparser` crate (already in `Cargo.toml`) to parse statements into AST. Check `Statement::Drop`, `Statement::Truncate`, `Statement::AlterTable`, `Statement::Delete { selection: None }`, `Statement::Update { selection: None }`. If parsing fails, fall back to "treat as dangerous." Never use regex as the primary detection mechanism.

---

### Pitfall 4 — IPC Payload Overflow From Unguarded Result Sets (CRITICAL, Phase 1)

**What breaks:** A query against a wide 100K-row table without a Rust-enforced row limit produces 50+ MB of JSON. `serde_json` serializes synchronously on the Rust side; `JSON.parse` and React setState happen synchronously on the JS main thread. The entire WebView freezes for 2–10 seconds. Windows shows "not responding."

**Prevention:** `db_query_execute` must enforce the row limit on the Rust side using `.fetch_many().take(limit + 1)`. Return `hasMore: true` when the result is truncated. For export flows, write to a temp file and invoke the Tauri file-save dialog — never pass large byte payloads through the IPC bridge.

---

### Pitfall 5 — Monaco Autocomplete Triggers Live Introspect on Every Keystroke (MODERATE, Phase 1)

**What breaks:** `registerCompletionItemProvider` fires on every keystroke. If the provider calls `host.connections.introspect(connectionId)` (→ IPC → Rust → INFORMATION_SCHEMA query), typing 50 characters produces 50 `db_introspect` calls. With a 200 ms network RTT this is a query storm that degrades perceived editor responsiveness to zero.

**Prevention:** Cache the `DbSchemaSnapshot` in a React ref keyed by `connectionId`. The Monaco completion provider reads only from the cache — zero IPC calls during typing. Invalidate the cache on connection switch or explicit user-triggered refresh. Accept stale-while-revalidate for schema accuracy.

---

### Additional Notable Pitfalls (Phase-Specific)

| Phase | Pitfall | Mitigation Summary |
|-------|---------|-------------------|
| Phase 1 | Query cancellation drops Rust future but DB continues running | MySQL: `KILL QUERY <thread_id>` on separate connection; PostgreSQL: `PgCancelToken::cancel()` |
| Phase 1 | Tokio thread saturation under concurrent queries | Per-connection `Semaphore` in pool registry; `SET statement_timeout` on PostgreSQL |
| Phase 1 | Multi-statement error has no source line attribution | Parse to individual statements via `sqlparser`; track source line ranges; return in error response |
| Phase 1 | New commands missing from `generate_handler![]` | Checklist: every `#[tauri::command]` must be in `lib.rs` — confirmed via integration smoke test |
| Phase 1 | `ALL_CAPABILITIES` + builtin manifest not updated in same commit | Extension boundary spec §6 checklist must run for every new capability |
| Phase 1 | MySQL 5.7 vs 8.0 EXPLAIN JSON structure differ | Defensive tree walk on JSON keys, not fixed-depth extraction; warn if version < 8.0 |
| Phase 2 | `DbConnectionConfig` has no `environment`/`readonly` fields yet | `#[serde(default)]` on Rust struct; default existing configs to `environment: "dev"`, `readonly: false` in storage layer |
| Phase 3 | FK introspection query incompatible across dialects | Separate `introspect_relations_mysql` and `introspect_relations_postgres` — never a shared cross-dialect query |

---

## Recommended Phase Structure

### Phase 1: Usable Workbench

**Main deliverable:** A developer can connect to MySQL or PostgreSQL, write SQL with syntax highlighting and schema-aware autocomplete, execute with Ctrl+Enter, see results in a virtual-scroll grid, format with Alt+Shift+F, view an EXPLAIN plan graph, export results, and be warned before dangerous SQL runs on prod.

**Key features delivered:**
- Monaco SQL editor with tabs, keyboard bindings, statement detection
- `db_query_execute` with persistent connection pool and query cancellation
- Read-only result grid (react-window, 1000-row limit, sticky header)
- `db_query_explain` with MySQL + PostgreSQL normalization to `PlanNode`
- EXPLAIN visualization (xyflow + elkjs, full-scan highlighting)
- Dangerous SQL protection (sqlparser AST, env-aware dialog, prod name entry)
- Connection environment color band
- SQL formatter (Alt+Shift+F)
- Export: CSV, JSON, Markdown, SQL Insert
- Readonly enforcement in Rust commands

**Research flags:** Steps 1-4 (type foundation + stubs + IPC + refactor) are prerequisite infrastructure. Do not skip. EXPLAIN plan normalization needs careful implementation time — budget it separately from the UI work.

---

### Phase 2: Editable Workbench

**Main deliverable:** Users can browse the database schema via an object explorer tree, right-click to view table data, and edit single-table results with full transaction safety.

**Key features delivered:**
- Object explorer tree (lazy load, dialect-aware namespace depth)
- In-place grid editing: edit mode, patch tracking, SQL preview, transaction commit/rollback
- `db_grid_commit` with identifier whitelist validation and parameterized values
- `GridCommitDialog` with full SQL preview before destructive commit
- Schema-aware autocomplete (table + column names from cached snapshot)
- Query history (session-level tab persistence)

**Research flags:** Grid editing is the highest-risk feature in this phase. The identifier validation against schema snapshot and Rust-side readonly enforcement must be audited before shipping.

---

### Phase 3: Structured Workbench

**Main deliverable:** Users can visualize the database schema as an ER diagram and get enhanced SQL autocomplete with alias and multi-table awareness.

**Key features delivered:**
- `db_introspect_relations` with separate MySQL + PostgreSQL FK query functions
- ER diagram (xyflow + elkjs, auto-layout, table search, click-to-explorer)
- Enhanced autocomplete: alias tracking, multi-FROM table column resolution

**Research flags:** FK introspection is dialect-specific — do not attempt a unified cross-dialect query. Self-referencing FKs and circular FK references must be tested before shipping ER diagram.

---

### Phase 4: Design Enhancement (Deferred)

**Main deliverable:** Advanced features connecting the workbench to the product's unique Excel DDL origin.

**Key features (deferred):**
- ER diagram drag-to-relate + ALTER preview generation
- Excel DDL ↔ live DB linkage entry points
- Query history persistence + saved script library
- Optimistic locking for concurrent grid editing

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack (new dependencies) | HIGH | npm and crates.io verified; `monaco-sql-languages` incompatibility confirmed via their own README; `tokio-util` CancellationToken confirmed via official Rust docs |
| Features (table stakes + differentiators) | HIGH | Benchmarked against DBeaver, DataGrip, TablePlus patterns; confirmed against design doc §5 |
| Architecture (component boundaries, build order) | HIGH | All findings from direct source file inspection — not assumptions. `DbConnectionConfig` confirmed to lack `environment`/`readonly` fields. |
| Pitfalls (critical and moderate) | HIGH | Critical pitfalls derived from actual code patterns (per-call pool in `introspect.rs`; flat `generate_handler!` in `lib.rs`). Minor pitfalls are HIGH confidence. |
| sql-formatter version | MEDIUM | v15.7.2 confirmed via npmjs.com; no Context7 entry. Pin the version and do not rely on new features. |
| sqlx cancellation behavior | MEDIUM | Confirmed via sqlx GitHub issue #2054; documented but behavior not guaranteed stable across sqlx patch versions. |

### Gaps to Address During Planning

1. **Connection pool lifecycle on connection delete:** The `DbPoolRegistry` must close the pool when a connection config is deleted. The existing `db_conn_delete` command flow needs to be extended to trigger pool cleanup — this integration point is not yet detailed.

2. **Column metadata for edit eligibility:** `DbQueryColumn` must include `tableName` and `isPrimaryKey` fields for the frontend to determine edit eligibility on arbitrary SELECT results. The Rust side must extract this from sqlx column metadata — not all databases expose this uniformly.

3. **MySQL 5.7 EXPLAIN FORMAT=JSON compatibility:** The normalization strategy for MySQL 5.7 vs 8.0 structure differences is known in principle (defensive tree walk) but the exact key differences should be verified against a real MySQL 5.7 instance before Phase 1 ships.

4. **`DbPoolRegistry` thread-safety under concurrent tabs:** Multiple open query tabs against the same connection share the same pool. The pool itself is thread-safe (sqlx pools are `Send + Sync`), but the cancellation registry needs to handle concurrent insertions without lock contention. This is low risk with a `tokio::sync::Mutex` but should be tested explicitly.

---

## Sources (Aggregated)

- Direct codebase inspection: `src-tauri/src/db_connector/`, `client/src/extensions/host-api*.ts`, `client/src/lib/desktop-bridge.ts`, `shared/schema.ts`, `src-tauri/src/lib.rs`
- `docs/db-workbench-extension-design.md` — authoritative milestone design intent
- `.planning/PROJECT.md` — requirements, constraints, phase ordering rationale
- Monaco Editor TypeDoc: https://microsoft.github.io/monaco-editor/typedoc/
- sql-formatter npm: https://www.npmjs.com/package/sql-formatter
- React Flow + elkjs example: https://reactflow.dev/examples/layout/elkjs
- tokio-util CancellationToken: https://docs.rs/tokio-util/latest/tokio_util/sync/struct.CancellationToken.html
- sqlx cancel-safety issue #2054: https://github.com/launchbadge/sqlx/issues/2054
- react-window API: https://react-window.vercel.app/
- PostgreSQL EXPLAIN docs: https://www.postgresql.org/docs/current/sql-explain.html
- MySQL EXPLAIN FORMAT=JSON (Percona blog)
- explain.dalibo.com — PostgreSQL EXPLAIN visualizer reference implementation
