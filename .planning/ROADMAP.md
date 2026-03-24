---
milestone: v1.4
milestone_name: DB 工作台
created: "2026-03-24"
granularity: coarse
total_phases: 3
total_requirements: 21
---

# Roadmap: DB 工作台 v1.4

## Milestone Goal

Upgrade the `db-connector` builtin extension into a high-frequency database workbench — SQL editing, incremental execution, result browsing, execution plan visualization, dangerous SQL protection, in-place grid editing, object explorer, and ER diagram — forming a complete closed loop with the existing Excel DDL definition workflow.

---

## Phases

- [ ] **Phase 1: Usable Workbench** - User can connect, write SQL, execute with Ctrl+Enter, browse results, view EXPLAIN plans, export, and is protected from dangerous SQL on prod
- [ ] **Phase 2: Editable Workbench** - User can browse schema objects, edit single-table grid cells with transaction safety, and get schema-aware autocomplete
- [ ] **Phase 3: Structural Workbench** - User can visualize the schema as an ER diagram with FK relationships, search nodes, and inspect table details

---

## Phase Details

### Phase 1: Usable Workbench
**Goal**: Users can connect to MySQL or PostgreSQL, write SQL with syntax highlighting and formatting, execute with keyboard shortcuts, see results in a virtual-scroll grid, view execution plan graphs, export results, and are protected by environment-aware dangerous SQL confirmation before any destructive command runs
**Depends on**: Nothing (first phase; Steps 1-4 infrastructure — type foundation, Rust stubs, IPC bridge, workspace refactor — are internal prerequisites within this phase)
**Requirements**: CONN-01, CONN-02, CONN-03, EDIT-01, EDIT-02, EDIT-03, EDIT-04, EDIT-05, EXEC-01, EXEC-02, EXEC-03, EXEC-04, PLAN-01, PLAN-02, SAFE-01, SAFE-02
**Success Criteria** (what must be TRUE):
  1. User can assign dev/test/prod environment label and see a prominent color band on the workbench header for test (blue) or prod (red) connections; readonly connections show a lock indicator
  2. User can write SQL in a Monaco editor, execute with Ctrl+Enter (selection or current statement) and Shift+Ctrl+Enter (full script), format with Alt+Shift+F, and switch between multiple query tabs
  3. User can execute a query and see results in a virtual-scroll grid limited to 1000 rows, with sticky column headers, column-width drag, elapsed time, row count, a cancel button that stops the running query, and export to CSV/JSON/Markdown/SQL Insert
  4. User can request an EXPLAIN plan for any SELECT query and see it rendered as a node graph with full-table-scan nodes highlighted in red and large-row-estimate nodes flagged with a risk badge
  5. User sees a confirmation dialog showing connection name, environment, database name, and exact SQL before any DROP/TRUNCATE/ALTER/WHERE-less DELETE or UPDATE executes; prod connections require typing the database name to confirm; readonly connections reject DML at the Rust command layer
**Plans**: 4 plans

Plans:
- [x] 01-01-PLAN.md — Type foundation + Rust backend (shared types, query.rs, explain.rs, managed state)
- [x] 01-02-PLAN.md — IPC bridge + workspace refactor (desktop-bridge, host-api, capabilities, layout shell)
- [x] 01-03-PLAN.md — SQL editor + connection UI (Monaco integration, keyboard shortcuts, tabs, sidebar)
- [x] 01-04-PLAN.md — Results + EXPLAIN + safety (virtual grid, node graph, dangerous SQL dialog, export)

**UI hint**: yes

### Phase 2: Editable Workbench
**Goal**: Users can browse the database object tree, open table data directly from the explorer, edit single-table grid results in a transaction with full SQL preview before commit, and receive schema-aware autocomplete in the SQL editor without live database calls on every keystroke
**Depends on**: Phase 1 (readonly enforcement proven at Rust layer; query execution chain stable; DbSchemaSnapshot available as cached ref for autocomplete)
**Requirements**: GRID-01, GRID-02, GRID-03, OBJ-01, OBJ-02, AUTO-01
**Success Criteria** (what must be TRUE):
  1. User can browse a lazy-loaded tree of schemas, tables, views, and columns for the active connection, and right-click a table to open a "view table data" grid query in a new tab
  2. User can double-click a cell in a single-table result (PK column present in result, connection not readonly) to enter edit mode, with pending changes visually highlighted
  3. User can review a generated SQL preview of all pending changes before committing, then commit all patches in a single transaction or discard them; any failure automatically rolls back the entire transaction
  4. User receives table names, column names scoped to the FROM clause, and SQL keyword suggestions while typing in the Monaco editor, with zero live database calls triggered per keystroke
**Plans**: TBD
**UI hint**: yes

### Phase 3: Structural Workbench
**Goal**: Users can visualize the current database schema as an auto-layout ER diagram showing foreign key relationships, search for tables by name, and click any table node to inspect its column details
**Depends on**: Phase 2 (relations.rs FK introspection module implemented; DbSchemaSnapshot extended with foreignKeys and indexes fields)
**Requirements**: ER-01, ER-02, ER-03
**Success Criteria** (what must be TRUE):
  1. User can open an ER diagram view showing all tables in the current schema connected by foreign key relationship arrows, rendered with auto-layout (elkjs layered algorithm, direction RIGHT)
  2. User can type a table name in a search box to highlight and focus matching table nodes in the ER diagram
  3. User can click any table node in the ER diagram to see its column list, data types, and PK/FK indicators in a side panel
**Plans**: TBD
**UI hint**: yes

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Usable Workbench | 0/4 | Planning complete | - |
| 2. Editable Workbench | 0/0 | Not started | - |
| 3. Structural Workbench | 0/0 | Not started | - |

---

## Coverage

| Requirement | Phase | Status |
|-------------|-------|--------|
| CONN-01 | Phase 1 | Pending |
| CONN-02 | Phase 1 | Pending |
| CONN-03 | Phase 1 | Pending |
| EDIT-01 | Phase 1 | Pending |
| EDIT-02 | Phase 1 | Pending |
| EDIT-03 | Phase 1 | Pending |
| EDIT-04 | Phase 1 | Pending |
| EDIT-05 | Phase 1 | Pending |
| EXEC-01 | Phase 1 | Pending |
| EXEC-02 | Phase 1 | Pending |
| EXEC-03 | Phase 1 | Pending |
| EXEC-04 | Phase 1 | Pending |
| PLAN-01 | Phase 1 | Pending |
| PLAN-02 | Phase 1 | Pending |
| SAFE-01 | Phase 1 | Pending |
| SAFE-02 | Phase 1 | Pending |
| GRID-01 | Phase 2 | Pending |
| GRID-02 | Phase 2 | Pending |
| GRID-03 | Phase 2 | Pending |
| OBJ-01 | Phase 2 | Pending |
| OBJ-02 | Phase 2 | Pending |
| AUTO-01 | Phase 2 | Pending |
| ER-01 | Phase 3 | Pending |
| ER-02 | Phase 3 | Pending |
| ER-03 | Phase 3 | Pending |

**Total: 21/21 requirements mapped (100% coverage)**

---

## Key Constraints (from Research)

- Phase 1 MUST establish `DbPoolRegistry` + `CancellationToken` infrastructure before any query execution command
- Phase 1 MUST add `sql-formatter` npm dep and `tokio-util` Cargo dep (the only 2 new dependencies for this milestone)
- Phase 1 MUST enforce readonly at Rust command layer — not from frontend-supplied value
- Phase 1 MUST add `environment` and `readonly` fields to `DbConnectionConfig` in `shared/schema.ts` and Rust models
- Phase 2 MUST NOT start until Phase 1 readonly enforcement is proven stable and audited
- Phase 3 requires `relations.rs` extended FK introspection (separate MySQL and PostgreSQL queries) before ER diagram can render
- `DbConnectorWorkspace.tsx` refactor into `db-workbench/` subdirectory is Step 4 of 8-step build order — must precede Phase 1 feature delivery

---

*Last updated: 2026-03-24 — Phase 1 plans created (4 plans, 2 waves)*
