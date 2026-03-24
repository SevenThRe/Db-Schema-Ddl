# Requirements: DB 工作台 v1.4

**Created:** 2026-03-24
**Milestone:** v1.4 DB 工作台
**Status:** Active

## Milestone Goal

Upgrade the `db-connector` builtin extension into a high-frequency database workbench: SQL editing, incremental execution, result browsing, execution plan visualization, dangerous SQL protection, in-place grid editing, object explorer, and ER diagram — forming a complete closed loop with the existing Excel DDL definition workflow.

---

## Requirements

### Category: Connection & Environment (CONN)

- [x] **CONN-01**: User can assign an environment label (dev / test / prod) and optional color tag to each saved connection
- [x] **CONN-02**: User sees a prominent color band on the workbench header when the active connection is test (blue) or prod (red)
- [x] **CONN-03**: User can mark a connection as readonly, which disables DML execution and grid editing at the Rust command layer

### Category: SQL Editor (EDIT)

- [x] **EDIT-01**: User can write SQL in a Monaco editor with syntax highlighting for the current connection's dialect (MySQL / PostgreSQL)
- [x] **EDIT-02**: User can execute the selected SQL with Ctrl/Cmd+Enter; without selection, the current statement block is executed
- [x] **EDIT-03**: User can execute the full script with Shift+Ctrl/Cmd+Enter
- [x] **EDIT-04**: User can format SQL with Alt+Shift+F (selection or full file) using sql-formatter
- [x] **EDIT-05**: User can open multiple query tab pages and switch between them

### Category: Execution & Results (EXEC)

- [ ] **EXEC-01**: User can execute multi-statement scripts where each segment returns an independent result and elapsed time; user can configure stop-on-error vs continue
- [x] **EXEC-02**: User can cancel a running query via a Cancel button (requestId-based CancellationToken on Rust side)
- [ ] **EXEC-03**: User can view result rows in a virtual-scroll grid limited to 1000 rows per fetch, with column header freeze and column-width drag
- [ ] **EXEC-04**: User can export the current result as JSON, CSV, Markdown Table, or SQL Insert; full-export mode shows row count warning before proceeding

### Category: Execution Plan (PLAN)

- [x] **PLAN-01**: User can request an execution plan for any SELECT query and see it rendered as a node graph (xyflow + elkjs)
- [x] **PLAN-02**: User can see full-table-scan nodes (MySQL type=ALL / PostgreSQL Seq Scan) highlighted in red and large-rows-estimate nodes flagged with a risk badge

### Category: Dangerous SQL Protection (SAFE)

- [x] **SAFE-01**: User sees a confirmation dialog before executing DROP, TRUNCATE, ALTER TABLE, ALTER DATABASE, DELETE without WHERE, or UPDATE without WHERE (detected via sqlparser AST on Rust side)
- [ ] **SAFE-02**: The confirmation dialog shows connection name, environment label, database name, and exact SQL; for prod connections the user must type the database name to confirm

### Category: Grid Editing (GRID)

- [ ] **GRID-01**: User can double-click a cell in a single-table result set (with PK in result columns, connection not readonly) to enter edit mode
- [ ] **GRID-02**: User can see pending changes as a generated SQL preview (parameterized, validated identifiers) before committing
- [ ] **GRID-03**: User can commit all pending changes in a single transaction or discard them; transaction rolls back on any failure

### Category: Object Explorer (OBJ)

- [ ] **OBJ-01**: User can browse a tree of schemas, tables, views, and columns for the active connection
- [ ] **OBJ-02**: User can right-click a table to open "view table data" as a grid query

### Category: ER Diagram (ER)

- [ ] **ER-01**: User can view an auto-layout ER diagram of the current schema including foreign key relationships (requires extended introspect for FK/indexes)
- [ ] **ER-02**: User can search tables by name and focus the diagram on matching nodes
- [ ] **ER-03**: User can click a table node to see column details in a side panel

### Category: Autocomplete (AUTO)

- [ ] **AUTO-01**: User receives schema-aware autocomplete in the SQL editor: table names from current schema, column names scoped to FROM clause tables, and SQL keyword completion

---

## Future Requirements (Deferred)

- Drag-to-relate in ER diagram generating ALTER preview (Phase 4 / v2.0)
- Excel definition book to live DB linkage entry points (Phase 4 / v2.0)
- Alias tracking in autocomplete (beyond basic table.column)
- Cross-session query history persistence
- Saved script library with tagging
- Multiple simultaneous connection tabs

---

## Out of Scope

- Creating a second separate `db-workbench` extension ID — internal ID stays `db-connector`
- Arbitrary result set editing (only single-table + primary key in results)
- Non-Windows packaging concerns for this milestone
- Full CI/CD pipeline changes
- monaco-sql-languages package — version incompatible with monaco-editor 0.55.1

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CONN-01 | Phase 1: Usable Workbench | Complete |
| CONN-02 | Phase 1: Usable Workbench | Complete |
| CONN-03 | Phase 1: Usable Workbench | Complete |
| EDIT-01 | Phase 1: Usable Workbench | Complete |
| EDIT-02 | Phase 1: Usable Workbench | Complete |
| EDIT-03 | Phase 1: Usable Workbench | Complete |
| EDIT-04 | Phase 1: Usable Workbench | Complete |
| EDIT-05 | Phase 1: Usable Workbench | Complete |
| EXEC-01 | Phase 1: Usable Workbench | Pending |
| EXEC-02 | Phase 1: Usable Workbench | Complete |
| EXEC-03 | Phase 1: Usable Workbench | Pending |
| EXEC-04 | Phase 1: Usable Workbench | Pending |
| PLAN-01 | Phase 1: Usable Workbench | Complete |
| PLAN-02 | Phase 1: Usable Workbench | Complete |
| SAFE-01 | Phase 1: Usable Workbench | Complete |
| SAFE-02 | Phase 1: Usable Workbench | Pending |
| GRID-01 | Phase 2: Editable Workbench | Pending |
| GRID-02 | Phase 2: Editable Workbench | Pending |
| GRID-03 | Phase 2: Editable Workbench | Pending |
| OBJ-01 | Phase 2: Editable Workbench | Pending |
| OBJ-02 | Phase 2: Editable Workbench | Pending |
| AUTO-01 | Phase 2: Editable Workbench | Pending |
| ER-01 | Phase 3: Structural Workbench | Pending |
| ER-02 | Phase 3: Structural Workbench | Pending |
| ER-03 | Phase 3: Structural Workbench | Pending |

**Coverage: 21/21 requirements mapped (100%)**

---

*Last updated: 2026-03-24 — Traceability table populated after roadmap creation*
