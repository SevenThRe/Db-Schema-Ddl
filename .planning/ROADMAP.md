---
milestone: v1.4
milestone_name: DB 工作台
created: "2026-03-24"
granularity: coarse
total_phases: 4
total_requirements: 29
---

# Roadmap: DB 工作台 v1.4

## Milestone Goal

Upgrade the `db-connector` builtin extension into a high-frequency database workbench — SQL editing, incremental execution, result browsing, execution plan visualization, dangerous SQL protection, in-place grid editing, object explorer, and ER diagram — forming a complete closed loop with the existing Excel DDL definition workflow.

---

## Phases

- [ ] **Phase 1: Usable Workbench** - User can connect, write SQL, execute with Ctrl+Enter, browse results, view EXPLAIN plans, export, and is protected from dangerous SQL on prod
- [ ] **Phase 2: Editable Workbench** - User can browse schema objects, edit single-table grid cells with transaction safety, and get schema-aware autocomplete
- [ ] **Phase 3: Structural Workbench** - User can visualize the schema as an ER diagram with FK relationships, search nodes, and inspect table details
- [ ] **Phase 4: DDL 导入 & 扩展功能管理** - User can import DDL SQL files into a live database with statement preview and safety gates; extensions are managed from a dedicated page and no longer pollute the primary navigation sidebar

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

### Phase 4: DDL 导入 & 扩展功能管理
**Goal**: Users can import DDL SQL files against any live database connection with statement-level preview and the same dangerous-SQL safety gate as query execution; the main navigation sidebar is cleaned up so extension-type items no longer appear there; a dedicated Extension Management page lists all builtin and external extensions with enable/disable controls; DB 工作台 is visible and manageable from that page
**Depends on**: Phase 1 (dangerous-SQL confirmation dialog; query execution pipeline reused for DDL execution)
**Requirements**: IMP-01, IMP-02, IMP-03, EXTUI-01, EXTUI-02, EXTUI-03, EXTUI-04, EXTUI-05
**Success Criteria** (what must be TRUE):
  1. User opens DDL 导入 dialog from the workbench toolbar (not a stray header button), selects a `.sql` file, sees a parsed statement list preview, clicks Execute, and sees per-statement success/error with line number reference
  2. Prod connections require typing the database name before DDL import proceeds; dangerous statements (DROP/TRUNCATE/ALTER) trigger the standard confirmation dialog
  3. Primary sidebar contains no extension-type direct entries (数据库, Schema Diff, DDL→Excel, Enum生成 are absent from top-level navigation)
  4. Clicking 扩展功能 routes to a full-page Extension Management view listing all extensions as cards with name, description, version, enabled toggle, and an Open/Launch button
  5. DB 工作台 (db-connector builtin) appears in Extension Management as enabled by default; toggling it off hides the workbench entry from all navigation surfaces
**Plans**: 4 plans

Plans:
- [x] 04-01-PLAN.md — Rust builtin cleanup + sidebar refactor + MainSurface extension
- [x] 04-02-PLAN.md — Extension Management full-page surface
- [x] 04-03-PLAN.md — DDL import live-DB execution flow
- [ ] 04-04-PLAN.md — Visual verification checkpoint

**UI hint**: yes

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Usable Workbench | 0/4 | Planning complete | - |
| 2. Editable Workbench | 0/0 | Not started | - |
| 3. Structural Workbench | 0/0 | Not started | - |
| 4. DDL 导入 & 扩展功能管理 | 3/4 | In Progress|  |

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
| IMP-01 | Phase 4 | Pending |
| IMP-02 | Phase 4 | Pending |
| IMP-03 | Phase 4 | Pending |
| EXTUI-01 | Phase 4 | Pending |
| EXTUI-02 | Phase 4 | Pending |
| EXTUI-03 | Phase 4 | Pending |
| EXTUI-04 | Phase 4 | Pending |
| EXTUI-05 | Phase 4 | Pending |

**Total: 29/29 requirements mapped (100% coverage)**

---

## Key Constraints (from Research)

- Phase 1 MUST establish `DbPoolRegistry` + `CancellationToken` infrastructure before any query execution command
- Phase 1 MUST add `sql-formatter` npm dep and `tokio-util` Cargo dep (the only 2 new dependencies for this milestone)
- Phase 1 MUST enforce readonly at Rust command layer — not from frontend-supplied value
- Phase 1 MUST add `environment` and `readonly` fields to `DbConnectionConfig` in `shared/schema.ts` and Rust models
- Phase 2 MUST NOT start until Phase 1 readonly enforcement is proven stable and audited
- Phase 3 requires `relations.rs` extended FK introspection (separate MySQL and PostgreSQL queries) before ER diagram can render
- `DbConnectorWorkspace.tsx` refactor into `db-workbench/` subdirectory is Step 4 of 8-step build order — must precede Phase 1 feature delivery
- Phase 4 requires ZERO new npm or Cargo dependencies — all infrastructure already exists

---

*Last updated: 2026-03-25 — Phase 4 plans created (4 plans in 3 waves)*
