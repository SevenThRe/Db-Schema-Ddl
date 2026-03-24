# Feature Landscape: DB 工作台 Workbench Extension

**Domain:** Desktop database workbench (SQL editor + result grid + schema visualization)
**Milestone:** v1.4 — upgrading `db-connector` to a full workbench
**Researched:** 2026-03-24
**Overall confidence:** HIGH (backed by existing design doc, verified against tool ecosystem patterns)

---

## Table Stakes

Features users expect from any database tool. Missing = product feels incomplete or unprofessional.

| Feature | Why Expected | Complexity | Phase |
|---------|--------------|------------|-------|
| Monaco SQL editor with syntax highlighting | Every modern DB tool uses a proper code editor, not textarea | Low — Monaco already in deps | 1 |
| Ctrl+Enter to run current statement | Universal keyboard shortcut in DBeaver, DataGrip, TablePlus, VS Code | Low — Monaco keybinding API | 1 |
| Result grid with column headers | Users need to see what column they are reading | Low | 1 |
| Elapsed time per query | Users always ask "how long did that take?" | Low | 1 |
| Row count in result footer | Required for verification and pagination awareness | Low | 1 |
| Error display inline | Errors must show near the editor, not in a hidden console | Low | 1 |
| Multiple query tabs | Users keep multiple queries open simultaneously | Medium — tab state management | 1 |
| SQL formatter (Alt+Shift+F) | Expected in any Monaco-based editor; `sql-formatter` npm is the de facto choice | Low — add `sql-formatter` package | 1 |
| Dangerous SQL confirmation | Required for prod safety; users expect it from professional tools | Medium — parser logic | 1 |
| Connection environment color band | Prod/test differentiation is muscle memory in professional DBA workflow | Low | 1 |
| Export result as CSV/JSON | Most frequent data-handoff action users perform | Low | 1 |
| Object explorer tree | Browsing tables without writing `SHOW TABLES` is expected | Medium — recursive tree UI | 2 |
| Read-only result from "view table data" | Right-click table → view data is universal | Low once explorer exists | 2 |
| Execution plan visualization | Advanced users need EXPLAIN; graphical view is competitive baseline | High — two-dialect normalization | 1 |

---

## Differentiators

Features that set this workbench apart from generic tools — especially given the existing Excel-DDL context.

| Feature | Value Proposition | Complexity | Phase |
|---------|-------------------|------------|-------|
| Environment color band + prod name-confirm | Most tools show a subtle warning; requiring name re-entry for prod DDL is a strong UX differentiator | Medium | 1 |
| In-place grid editing with SQL preview before commit | DBeaver does in-place editing silently; showing the generated UPDATE before committing is a trust-builder | High — patch model, PK detection, transaction scope | 2 |
| Incremental execution (selection / statement / script) | DataGrip does this well; TablePlus does not. Ctrl+Enter on selection vs cursor-statement is a quality-of-life differentiator | Medium — statement boundary detection | 1 |
| EXPLAIN graph with full-scan highlighting | explain.dalibo.com is a reference; having it embedded is better than copy-pasting to a web tool | High — MySQL/PG plan JSON differ structurally | 1 |
| ER diagram auto-layout from live FK introspection | Embedded ER is rare in lightweight tools; competitors like DBeaver have it but it is heavy | High — FK query + elkjs layout | 3 |
| Schema-aware autocomplete tied to active connection | Many SQL editors offer keyword autocomplete; table+column names from live schema snapshot is the differentiated layer | Medium — completion provider + snapshot cache | 1 |
| Connection to Excel DDL loop (future) | Unique to this product — no other tool generates DDL from Excel AND connects to live DB | High — Phase 4 only | 4 |

---

## Anti-Features

Features to explicitly NOT build in this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Arbitrary result set editing (multi-table JOIN, no PK) | Unmappable updates create data corruption; no professional tool attempts this | Restrict to single-table + PK in result; show "read-only" badge for other result sets |
| Full SQL AST autocomplete compiler | Building a full dialect-aware SQL parser from scratch in JavaScript is months of work; correctness bar is high | Use `registerCompletionItemProvider` with tokenizer-based context extraction + schema snapshot; "good enough" beats nothing |
| Auto-save or auto-execute on keystroke | Silent execution is a user trust violation | Require explicit Ctrl+Enter or button click |
| Streaming results without a row cap | Pulling millions of rows into the frontend kills performance and has no UX precedent in competitors | Enforce 1000-row limit first page, explicit "load more" with count warning |
| ER diagram edit mode (drag-to-relate, ALTER generation) | Requires DDL undo/redo, dialect-specific ALTER syntax, safe confirmation chain; disproportionately complex vs read-only ER | Read-only ER in Phase 3; drag-to-relate in Phase 4 |
| Query history persistence across sessions (Phase 1) | Nice-to-have, but adds storage schema; blocks Phase 1 velocity | Defer to Phase 2 along with saved scripts |
| Second parallel "db-workbench" extension ID | Causes navigation duplication, manifest migration cost | Upgrade `db-connector` in-place; rename display to `DB 工作台` |
| Synchronous cancellation of Rust async queries | Blocking the main thread to cancel kills UX | Use requestId + cancellation token pattern in Tauri; show Cancel button in UI |

---

## Feature Details: Expected Behaviors and Edge Cases

### 1. Monaco SQL Editor

**How professional tools do it:**
DBeaver and DataGrip use CodeMirror/IntelliJ respectively. TablePlus uses Monaco. All support dialect detection from connection type.

**Expected behaviors:**
- Syntax highlighting switches automatically when active connection dialect changes (MySQL → PostgreSQL)
- Ctrl+Enter executes selection if text is selected; falls back to "statement containing cursor" if no selection
- Statement boundary for "current statement" is determined by semicolons, ignoring semicolons inside string literals and comments
- Shift+Ctrl+Enter runs the entire editor content as a script
- Alt+Shift+F formats using `sql-formatter` (already the community standard, supports MySQL and PostgreSQL dialects)
- Tab pages are independent: each tab has its own content, result, and connection reference

**Edge cases:**
- User writes two statements with no semicolon between them — the boundary detector must treat two-statement script as two statements even without trailing semicolon on the first
- Statement boundary must skip `--` line comments and `/* */` block comments that contain semicolons
- Dialect switch mid-session: editor should re-tokenize on connection change
- `sql-formatter` in maintenance mode (confirmed): pin the version; do not rely on new features

**Complexity: LOW-MEDIUM.** Monaco API is well-documented. Statement splitter needs careful implementation for edge cases but is well-understood. SQL formatter integration is one `npm install sql-formatter` + format action.

---

### 2. Incremental SQL Execution

**How professional tools do it:**
DataGrip: selection → run, no selection → current statement. "Run script" is a separate command. Each segment reports elapsed time and row count.

**Expected behaviors:**
- Multi-statement script: each statement returns its own result set, shown in sequenced tabs or accordion
- Failed statement: show error inline, but display results from already-executed statements above it
- "Stop on error" toggle (configurable): default ON for scripts, OFF for exploratory use
- Each batch result shows: statement text, elapsed ms, row count or affected rows, status icon

**Edge cases:**
- Statements that return no rows (INSERT, UPDATE, DELETE): show "X rows affected" not an empty grid
- Script with 20 statements: user should not need to scroll a single huge accordion
- Nested BEGIN/END blocks (MySQL stored procs): must not split on internal semicolons

**Complexity: MEDIUM.** Statement splitting is the hardest part. A regex-based splitter covers 90% of cases; the remaining 10% (BEGIN/END blocks, dollar-quoting in PG) requires careful handling. Recommend shipping "best-effort" splitter with known limitation documented.

---

### 3. Execution Plan Visualization

**How professional tools do it:**
`explain.dalibo.com` is the reference implementation for PostgreSQL plan visualization. MySQL Workbench renders EXPLAIN visually. DataGrip shows plan as a graph.

**MySQL EXPLAIN FORMAT=JSON structure:**
```
query_block → nested_loop[] | table | ordering_operation | grouping_operation
  table → table_name, access_type ("ALL" = full scan), rows_examined_per_scan, key
```

**PostgreSQL EXPLAIN (FORMAT JSON) structure:**
```
[{ "Plan": { "Node Type", "Relation Name", "Startup Cost", "Total Cost", "Plan Rows", "Plans": [...] } }]
```

**Normalization to PlanNode (as designed in doc):**
- MySQL `access_type = "ALL"` → `warning: "full_table_scan"`
- PostgreSQL `Node Type = "Seq Scan"` → `warning: "full_table_scan"`
- Both: `rows > threshold (e.g. 10000)` → risk badge

**Expected behaviors:**
- User presses dedicated "Explain" button or runs `EXPLAIN ...` directly
- Backend detects if SQL starts with EXPLAIN; if not, prepends EXPLAIN FORMAT=JSON automatically
- Graph renders with elkjs layered algorithm (top-to-bottom, left-to-right)
- Clicking a node shows raw explain JSON for that node in sidebar
- Full-scan nodes are red; large-rows nodes get orange badge

**Edge cases:**
- MySQL and PostgreSQL JSON structures are completely different — normalization layer in Rust is mandatory before sending to frontend
- Multi-query EXPLAIN: only the first statement is explainable; show error for multi-statement
- EXPLAIN on INSERT/UPDATE/DELETE: supported in both dialects; do not restrict to SELECT only

**Complexity: HIGH.** Two-dialect normalization is the core difficulty. MySQL EXPLAIN JSON is deeply nested with irregular keys; PostgreSQL is cleaner but has dozens of node types. Budget significant time for the Rust normalization layer. xyflow+elkjs rendering itself is medium complexity — existing in codebase.

---

### 4. Read-Only Result Grid

**How professional tools do it:**
DBeaver uses a virtualized table with column resize, sort, and copy. DataGrip uses IntelliJ's table UI with filter row. TablePlus is clean but non-virtual.

**Expected behaviors:**
- First 1000 rows loaded; "Load more" button with count warning if total > 1000
- Column headers are always visible (sticky header)
- Column widths are draggable; defaults are capped (e.g., max 300px auto-width)
- Click column header to sort (client-side sort on loaded data only, not re-query)
- Copy single cell: Ctrl+C on selected cell
- Copy row: Ctrl+Shift+C or right-click menu
- NULL values shown as `NULL` in distinct style (italic or grey), not empty string

**React-window vs TanStack Virtualizer:**
`react-window` is already in dependencies. It handles virtual scroll but requires custom implementation for sticky column headers. TanStack Virtualizer (`@tanstack/react-virtual`) is the 2025 recommended alternative but is not in deps. Decision: use `react-window` as already available; implement sticky header via separate fixed header row rendered outside the virtualized list.

**Edge cases:**
- Result with 200 columns: horizontal virtualization also needed; react-window FixedSizeGrid handles both axes
- Column with JSON/array value: render as truncated string with expand-on-click
- Binary column: render as `[BLOB]` with byte count
- Timestamps: render in local timezone consistently

**Complexity: MEDIUM.** The virtual scroll itself is solved by react-window. The challenge is the sticky-header + sticky-first-column combination, which requires a "split grid" pattern (header row as separate DOM element) or use of MultiGrid from react-virtualized. Budget time for this UI pattern.

---

### 5. In-Place Grid Editing

**How professional tools do it:**
DBeaver allows editing any cell in "edit mode" without PK checks — this has caused user data corruption complaints. TablePlus requires PK to be present. DataGrip detects the query's source table automatically.

**Expected behaviors:**
- Edit mode enabled only when: result comes from single-table SELECT AND primary key column(s) are present in result set
- Non-editable results show "Read only" badge in grid footer
- Double-click cell → inline input; Tab/Enter to confirm, Escape to cancel
- Changed cells are highlighted (yellow background is industry convention)
- Footer shows: "N rows modified" + "Preview SQL" button + "Commit" button + "Discard" button
- SQL preview shows exact parameterized UPDATE statements (not string-concatenated, Rust-side parameterized)
- Commit: Rust opens transaction, executes all patches, commits on success, rolls back on any failure
- Rollback: all pending changes discarded, grid reverts to original values

**How to detect "single-table + PK" from a SELECT result:**
The query must be parsed to extract the FROM clause. For Phase 2 scope, the simpler detection is: when user enters via "View Table Data" (right-click from object explorer), the source table and PK are known. For arbitrary SELECT queries, show the editing affordance only if all result columns map to a single table AND PK columns are detected in the result columns. This requires the backend to return column metadata including `table_name` and `is_primary_key` in `DbQueryColumn`.

**Edge cases:**
- Composite PK: must include all PK columns in the WHERE clause of generated UPDATE
- NULL cell: must generate `IS NULL` in WHERE, not `= NULL`
- User edits PK column itself: this changes the identity of the row — disallow PK column editing
- Concurrent modification: another session updates the row between read and commit — last-write-wins is acceptable for Phase 2; optimistic locking is Phase 4+
- Very large pending batch (user edits 500 rows): confirm dialog should show count, not all 500 SQL statements

**Complexity: HIGH.** The most complex feature in the milestone. The patch model, PK detection, transaction handling, and SQL preview all need to work together. The Rust side must generate correct parameterized SQL for MySQL (? placeholders) and PostgreSQL ($1 placeholders). Defer to Phase 2 after query execution is stable.

---

### 6. Object Explorer

**How professional tools do it:**
DBeaver and DataGrip both use an async-loading tree: top level is connections, then databases/schemas, then tables/views, then columns/indexes. Items load on first expand (lazy load).

**Expected behaviors:**
- Tree root: active connection → databases → tables, views (separate group) → columns, indexes (expand table)
- Lazy loading: fetch children only when node is expanded (avoids introspecting entire schema upfront)
- Right-click table: "View Table Data" → opens query tab with `SELECT * FROM table LIMIT 1000`
- Right-click table: "Copy name" (qualified: schema.table)
- Columns show data type and NOT NULL/PK/FK indicator
- Refresh button at connection level to re-introspect

**Edge cases:**
- Large schema with 500 tables: lazy loading is mandatory; do not eagerly fetch all 500 tables' columns at startup
- View vs table: distinguish visually (DataGrip uses different icons)
- Schema (namespace) vs database: MySQL uses "database" as the primary namespace; PostgreSQL uses "schema" inside "database" — the tree depth differs between dialects

**Complexity: MEDIUM.** Tree rendering with lazy load is a well-understood pattern. The dialect difference in namespace structure (MySQL `db.table` vs PostgreSQL `db.schema.table`) adds branching. The introspect commands already exist; extend them for per-table column detail on demand.

---

### 7. Dangerous SQL Protection

**How professional tools do it:**
DBeaver shows a simple Yes/No confirmation. DataGrip has a configurable "safe delete" mode. TablePlus does not protect at all by default.

**Expected behaviors:**
- Detection must happen on parsed SQL, not just button state (users can paste dangerous SQL)
- Patterns to detect (as defined in PROJECT.md):
  - `DROP` (any: table, database, index, view, procedure)
  - `TRUNCATE`
  - `ALTER TABLE` / `ALTER DATABASE`
  - `DELETE` with no `WHERE` clause
  - `UPDATE` with no `WHERE` clause
- Dialog shows: connection name, environment, database name, exact SQL to be executed
- Dev environment: yellow dialog, single-click confirm
- Test environment: orange dialog, single-click confirm
- Prod environment: red dialog, user must type database name to confirm (prevents copy-paste confirmation)

**Detection approach:**
Regex-based detection is sufficient for the dangerous patterns listed — these are coarse enough that false positives are acceptable (better safe than sorry). A full AST parser would handle edge cases like `DELETE FROM t WHERE 1=1` but that is overkill for Phase 1. Recommended regex patterns:
- `/^\s*(DROP|TRUNCATE)\s/i` — catches DROP/TRUNCATE
- `/^\s*ALTER\s+(TABLE|DATABASE)\s/i` — catches structural changes
- `/^\s*DELETE\s+FROM\s+\w+\s*$/i` and `/^\s*DELETE\s+FROM\s+\w+\s*;?\s*$/i` — DELETE with no WHERE
- `/^\s*UPDATE\s+\w+\s+SET\s+.*(?<!WHERE\b.*)$/i` — UPDATE with no WHERE (fragile; verify with test cases)

For the WHERE-less UPDATE/DELETE detection, a simple approach: check if the statement text contains the word `WHERE` (case-insensitive) after normalizing whitespace and removing string literals. Not perfect, but covers the high-risk cases. Flag for improvement in Phase 3.

**Complexity: MEDIUM.** The dialog UI is straightforward. The detection logic requires careful regex construction and test coverage. The prod "type database name" pattern is a known UX solution from AWS console and other tools.

---

### 8. ER Diagram Browse

**How professional tools do it:**
DBeaver generates ER from INFORMATION_SCHEMA FK data and renders with a custom Java canvas. DataGrip's ER diagram is read-only by default and very fast. DBSchema has the richest ER tool but is commercial.

**What introspection must expand:**
Current `introspect.rs` fetches tables and columns only. For ER, must also query:
- `INFORMATION_SCHEMA.KEY_COLUMN_USAGE` + `REFERENTIAL_CONSTRAINTS` for FK relationships (MySQL)
- `pg_constraint` + `pg_attribute` for FK relationships (PostgreSQL)
- `INFORMATION_SCHEMA.TABLE_CONSTRAINTS` + `INFORMATION_SCHEMA.KEY_COLUMN_USAGE` for both

**Expected behaviors:**
- Auto-layout via elkjs `layered` algorithm (hierarchical from FK source to target)
- Each table node shows: table name, columns list (name + data type), PK indicator
- FK relationships shown as edges with directional arrows (source column → referenced column)
- Search box: filter by table name, matching nodes highlighted, non-matching faded
- Click node: expand column details, highlight FK edges for that node only
- Click node: "Jump to Object Explorer" — focuses the tree to that table
- Pan and zoom: xyflow handles this natively
- Read-only: no node dragging that persists, no edge creation

**Edge cases:**
- Schema with no FK constraints: show all tables as disconnected nodes (still useful for overview)
- Schema with 200 tables and complex FK graph: elkjs handles non-tree graphs but layout can be chaotic. Recommend `elk.algorithm: "layered"` with `elk.direction: "RIGHT"` and `elk.spacing.nodeNode: "30"` minimum
- Circular FK references (allowed in MySQL with deferred constraints): elkjs handles cycles via feedback edge detection
- Self-referencing FK (e.g., `employee.manager_id → employee.id`): xyflow renders self-loops as curved edges

**Complexity: HIGH — but isolated.** The layout computation (elkjs) is asynchronous and can take 200-500ms for large schemas. Run it in a useEffect with a loading state. The FK introspection queries are dialect-specific. The xyflow rendering is the easiest part. Total complexity is high because of the combination of introspection expansion + normalization + layout tuning. Defer to Phase 3 as designed.

---

### 9. Schema-Aware Autocomplete

**How professional tools do it:**
DataGrip has the best autocomplete in class — full SQL AST-aware with alias tracking. DBeaver has table/column completion from cached schema. VSCode SQLTools has basic keyword + table/column completion.

**The key limitation in Monaco:**
`registerCompletionItemProvider` is **language-global**, not per-editor-instance. This means all Monaco SQL instances share the same completion provider. For a single-connection workbench this is fine; for multi-tab with different connections it requires the provider to look up the "active connection's snapshot" at completion time rather than using captured closure data.

**Recommended implementation (confirmed by community patterns):**
1. Register one completion provider for the SQL language at app init
2. Provider function reads `activeConnectionSnapshot` from a React context or Zustand store at invocation time
3. For each trigger character (space, dot, open paren), parse the partial SQL up to cursor to determine context
4. Context detection (lightweight, not full AST):
   - After `FROM ` or `JOIN ` → suggest table names
   - After `table_alias.` or `table_name.` → suggest columns of that table
   - Inside `WHERE`, `SELECT`, `SET` → suggest all accessible columns given FROM clause
   - Generic → suggest SQL keywords + table names

**Snapshot cache strategy:**
- Refresh on connection switch (invalidate + re-introspect)
- Refresh on `db_introspect_schema` success (already exists)
- Cache in react-query; stale-while-revalidate acceptable

**Edge cases:**
- Multiple FROM tables: `SELECT * FROM a, b WHERE a.id =` — completion should suggest `a.` and `b.` columns
- CTE (`WITH cte AS (...)`) — CTE name should appear as a virtual table name in completion
- Subqueries — partial; skip for Phase 1, document as known gap
- User has 500-column table — completion list should still appear fast (filtering is client-side, not round-trip)

**Complexity: MEDIUM.** The Monaco API integration is straightforward. The context extraction (alias/table resolution) is where complexity lives. "Good enough" is: FROM clause table detection + dot-triggered column completion. Full alias tracking is Phase 2 enhancement.

---

## Feature Dependencies

```
Schema introspect (existing)
  └── Object explorer (new)
        └── In-place grid editing (single-table via right-click path)
        └── ER diagram (FK introspection expansion)
              └── ER search + jump-to-explorer

Query execution (new: Rust db_query_execute)
  └── Result grid (read-only)
        └── Export (JSON/CSV/Markdown/SQL Insert)
        └── In-place grid editing (arbitrary SELECT path)
  └── Dangerous SQL protection (intercepts before execution)

Introspect expansion (new: FK + indexes)
  └── ER diagram
  └── Autocomplete schema snapshot

Monaco editor setup (tabs, keybindings)
  └── SQL formatter
  └── Autocomplete provider
  └── Incremental execution
  └── Explain trigger

Explain (new: Rust db_query_explain)
  └── Plan normalization (Rust, MySQL + PG)
        └── ER-plan visualization (xyflow + elkjs)
```

---

## Phase Ordering Recommendation

### Phase 1: Usable Workbench (highest ROI, lowest risk)

Deliver in this order within the phase:

1. Refactor `DbConnectorWorkspace.tsx` into `db-workbench/` directory structure (pre-req for everything)
2. Add `db_query_execute` Tauri command + `DbQueryResult` shared types
3. Monaco editor with SQL tabs and Ctrl+Enter keybinding
4. Read-only result grid (react-window, sticky header, 1000-row limit)
5. Dangerous SQL protection dialog (regex-based, env-aware)
6. Connection environment labels + color bands
7. SQL formatter (Alt+Shift+F via `sql-formatter`)
8. Export: JSON, CSV, Markdown Table
9. Basic EXPLAIN plan visualization (xyflow + elkjs, full-scan highlighting)

**Why Phase 1 looks like this:** SQL editor + result grid delivers immediate daily value. Dangerous SQL protection is a non-negotiable trust feature. EXPLAIN was designed as Phase 1 because it has strong standalone value and the xyflow/elkjs stack is already available.

### Phase 2: Editable Workbench (higher complexity, high value)

1. Object explorer tree (lazy load, right-click "view data")
2. In-place grid editing (single-table + PK, patch model, SQL preview, transaction commit/rollback)
3. Query history tab persistence
4. Schema-aware autocomplete (table + column names from snapshot)
5. Export "full result set" mode with count warning

**Why Phase 2 looks like this:** Object explorer is required for the "safe" in-place editing path. Grid editing is the most complex single feature — it should go after query execution is stable and tested.

### Phase 3: Structured Workbench (visualization + exploration)

1. FK + index introspection expansion (new Rust queries)
2. ER diagram (auto-layout, search, click-to-explorer)
3. Enhanced autocomplete: alias tracking, multi-FROM table awareness

**Why Phase 3 looks like this:** ER diagram requires the FK introspection work that does not exist yet. It is visually impressive but not blocking daily use. Autocomplete enhancement can share the expanded snapshot.

### Phase 4: Design Enhancement (deferred per PROJECT.md decision)

- ER drag-to-relate + ALTER preview generation
- Excel DDL ↔ live DB linkage entry points
- Query history persistence + saved script library
- Optimistic locking for grid editing

---

## Complexity Summary

| Feature | Complexity | Main Difficulty |
|---------|------------|-----------------|
| Monaco editor + tabs | Low | None; Monaco API is well-documented |
| SQL formatter | Low | One npm package install + format action |
| Incremental execution + statement split | Medium | Semicolon-inside-string edge cases |
| Read-only result grid | Medium | Sticky header + horizontal virtualization |
| Export (CSV/JSON/Markdown) | Low | Straightforward serialization |
| Dangerous SQL protection | Medium | Regex detection of WHERE-less UPDATE/DELETE |
| Environment color bands | Low | CSS + config field |
| EXPLAIN visualization | High | Two-dialect JSON normalization in Rust |
| Object explorer | Medium | Lazy-load tree, dialect namespace difference |
| In-place grid editing | High | Patch model, PK detection, parameterized SQL, transaction scope |
| ER diagram | High | FK introspection, elkjs layout tuning, non-tree FK graphs |
| Schema-aware autocomplete | Medium | Monaco global provider + live snapshot lookup |

---

## Sources

- [Monaco Editor registerCompletionItemProvider API](https://microsoft.github.io/monaco-editor/typedoc/functions/languages.registerCompletionItemProvider.html)
- [Issue: Completion providers per instance (Monaco)](https://github.com/microsoft/monaco-editor/issues/593)
- [Implementing SQL Autocompletion in Monaco-Editor](https://medium.com/@alanhe421/implementing-sql-autocompletion-in-monaco-editor-493f80342403)
- [monaco-sql-languages npm](https://www.npmjs.com/package/monaco-sql-languages)
- [sql-formatter npm](https://www.npmjs.com/package/sql-formatter)
- [PostgreSQL EXPLAIN documentation](https://www.postgresql.org/docs/current/sql-explain.html)
- [MySQL EXPLAIN FORMAT=JSON (Percona blog)](https://www.percona.com/blog/explain-formatjson-provides-us-all-details-about-subqueries-attached_subqueries-nested_loop-materialized_from_subquery-optimized_away_subqueries/)
- [React Flow + elkjs auto-layout example](https://reactflow.dev/examples/layout/auto-layout)
- [xyflow community: layout algorithm discussion](https://github.com/xyflow/xyflow/discussions/1786)
- [TanStack Virtualizer sticky grid guide](https://mashuktamim.medium.com/building-sticky-headers-and-columns-with-tanstack-virtualizer-react-a-complete-guide-12123ef75334)
- [React-window virtualization guide (web.dev)](https://web.dev/virtualize-long-lists-react-window/)
- [DBeaver vs DataGrip feature comparison](https://www.devart.com/dbforge/edge/datagrip-vs-dbeaver-vs-dbforge-edge.html)
- [explain.dalibo.com — PostgreSQL EXPLAIN visualizer reference](https://explain.dalibo.com/)
