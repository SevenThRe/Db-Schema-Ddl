# DB 工作台 (DB Workbench Extension)

## What This Is

This milestone transforms the existing `db-connector` builtin extension into a full-featured database workbench that users want to stay in. The goal is not to build a standalone product, but to upgrade the existing extension within the current builtin extension architecture so that Excel-defined DDL, live database operations, schema comparison, and ER visualization form a complete closed loop.

The target audience is the existing DBSchemaExcel2DDL desktop user who already uses the tool to define schemas in Excel and generate DDL. This milestone gives them a place to execute, inspect, and manage those schemas against real databases — without leaving the app.

## Core Value

Users can define a schema in Excel, generate DDL, connect to a real database, execute and verify queries, visualize the schema as an ER diagram, compare live DB against their Excel definition, and edit data safely — all within one desktop workbench.

## Current Milestone: v1.4 DB 工作台

**Goal:** Upgrade `db-connector` into a high-frequency database workbench with SQL editing, result browsing, execution plan visualization, safe DML, and ER diagram support.

**Target features:**
- Connection environment model (dev/test/prod color bands, readonly mode)
- Monaco SQL editor (dialect-aware, Ctrl+Enter execution, tab pages)
- Incremental execution (selection / current statement / full script)
- Read-only result grid (virtual scroll, column freeze, sort/filter)
- Result export (JSON, CSV, Markdown Table, SQL Insert)
- Execution plan visualization (xyflow + elkjs, full-scan highlighting)
- Dangerous SQL protection (DROP/TRUNCATE/ALTER/DELETE+UPDATE without WHERE)
- Single-table in-place grid editing (transaction commit/rollback + SQL preview)
- Object explorer (database tree: schemas, tables, columns, indexes)
- ER diagram (foreign key introspect, auto-layout, read-only browse)
- Schema-aware SQL autocomplete (keyword + table/column from snapshot)

## Requirements

### Validated (from previous milestones)

- Users can upload Excel definition files and parse multiple table definitions from a workbook
- Users can generate MySQL and Oracle DDL from structured table definitions
- Users can connect to MySQL/PostgreSQL databases, compare file vs DB, preview and apply SQL, inspect history, visualize schema graphs, export live DB schema to workbook templates, and reverse-import DDL bundles
- Desktop app starts, shuts down, and logs failures reliably (v1.3)

### Active

#### Connection & Environment
- [ ] **CONN-01**: User can assign an environment label (dev / test / prod) and optional color tag to each saved connection
- [ ] **CONN-02**: User sees a prominent color band on the workbench header when the active connection is test or prod
- [ ] **CONN-03**: User can mark a connection as readonly, which disables DML execution and grid editing

#### SQL Editor
- [ ] **EDIT-01**: User can write SQL in a Monaco editor with syntax highlighting for the current connection's dialect (MySQL / PostgreSQL)
- [ ] **EDIT-02**: User can execute the selected SQL with Ctrl/Cmd+Enter; without selection, the current statement block is executed
- [ ] **EDIT-03**: User can execute the full script with Shift+Ctrl/Cmd+Enter
- [ ] **EDIT-04**: User can format SQL with Alt+Shift+F (selection or full file)
- [ ] **EDIT-05**: User can open multiple query tab pages and switch between them

#### Execution & Results
- [ ] **EXEC-01**: User can execute multi-statement scripts where each segment returns an independent result and elapsed time
- [ ] **EXEC-02**: User can cancel a running query from the UI
- [ ] **EXEC-03**: User can view result rows in a virtual-scroll grid limited to 1000 rows per fetch, with column header freeze and column-width drag
- [ ] **EXEC-04**: User can export the current result as JSON, CSV, Markdown Table, or SQL Insert (with row count warning for full-export mode)

#### Execution Plan
- [ ] **PLAN-01**: User can request an execution plan for any SELECT query and see it rendered as a node graph
- [ ] **PLAN-02**: User can see full-table-scan nodes highlighted in red and large-rows-estimate nodes flagged with a risk badge

#### Dangerous SQL Protection
- [ ] **SAFE-01**: User sees a confirmation dialog before executing DROP, TRUNCATE, ALTER TABLE, ALTER DATABASE, DELETE without WHERE, or UPDATE without WHERE
- [ ] **SAFE-02**: The confirmation dialog shows the connection name, environment label, database name, and exact SQL; for prod connections the user must type the database name to confirm

#### Grid Editing
- [ ] **GRID-01**: User can double-click a cell in a single-table result set (with primary key in results, not readonly connection) to enter edit mode
- [ ] **GRID-02**: User can see pending changes as a SQL preview before committing
- [ ] **GRID-03**: User can commit all pending changes in a single transaction or discard them

#### Object Explorer
- [ ] **OBJ-01**: User can browse a tree of databases, tables, views, and columns for the active connection
- [ ] **OBJ-02**: User can right-click a table to open a "view table data" query with an editable grid

#### ER Diagram
- [ ] **ER-01**: User can view an auto-layout ER diagram of the current schema that includes foreign key relationships
- [ ] **ER-02**: User can search tables by name and focus the diagram on matching nodes
- [ ] **ER-03**: User can click a table node to see column details and jump to the object explorer

#### Autocomplete
- [ ] **AUTO-01**: User receives schema-aware autocomplete in the SQL editor: table names, column names scoped to the FROM clause, and keyword completion

### Future Requirements

- Drag-to-relate in ER diagram to generate ALTER preview (Phase 4 — deferred)
- Excel definition book ↔ live DB linkage entry points (Phase 4 — deferred)
- Query history persistence across sessions
- Saved script library

### Out of Scope

- A second separate database extension (db-workbench as a separate extension ID) — internal ID stays `db-connector`, display name upgrades to `DB 工作台`
- Arbitrary result set editing (only single-table + primary key in results)
- Full CI/CD pipeline expansion
- Non-Windows packaging concerns for this milestone

## Context

- `v1.0` is complete and audited at `.planning/v1.0-v1.0-MILESTONE-AUDIT.md`
- `v1.1` is complete and audited at `.planning/v1.1-v1.1-MILESTONE-AUDIT.md`
- `v1.2` is complete and audited at `.planning/v1.2-v1.2-MILESTONE-AUDIT.md`
- `v1.3` is complete and audited at `.planning/v1.3-v1.3-MILESTONE-AUDIT.md` (runtime hardening)
- Design document for this milestone: `docs/db-workbench-extension-design.md`
- Frontend already has Monaco, @xyflow/react, elkjs, react-window in dependencies
- Rust side already has db_connector module with introspect and diff commands

## Constraints

- **Extension ID**: Keep `db-connector` internally; only upgrade display name and expand capabilities
- **Compatibility**: v1.0 through v1.3 user-facing flows must remain intact (connection management, schema compare, DDL diff, apply history)
- **Safety**: Grid editing must use parameterized SQL on the Rust side; no string concatenation
- **Performance**: Result grid must stay smooth at 1000 rows; no synchronous main-thread blocking for large result sets
- **Scope discipline**: ER drag-to-relate and Excel linkage are Phase 4 and should not creep into earlier phases

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Upgrade `db-connector` in-place, not create `db-workbench` | Avoids duplicate navigation entries, reduces manifest/panel/i18n migration cost | Accepted |
| Phase 1 = SQL editor + read-only grid + explain + safety | Delivers immediate value; editable grid and ER are follow-on | Accepted |
| Grid editing requires single-table + PK in result | Prevents unmappable updates; keeps safety model tractable | Accepted |
| Dangerous SQL protection is Phase 1 non-negotiable | Environment isolation is a user trust requirement, not a nice-to-have | Accepted |
| ER drag-to-relate deferred to Phase 4 | DDL generation + undo/redo + safety model is significantly more complex than read-only ER | Accepted |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-24 when opening v1.4 DB 工作台*
