# Phase 1: Usable Workbench - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase upgrades the `db-connector` builtin extension into a usable SQL workbench.

It covers:

- connection environment model (dev/test/prod labels, color bands, readonly flag)
- Monaco SQL editor with syntax highlighting, multi-tab, keyboard shortcuts, SQL formatting
- Ctrl+Enter execution (selection or current statement block), Shift+Ctrl+Enter (full script)
- multi-statement incremental execution with per-segment results and elapsed time
- virtual-scroll result grid (1000 rows per fetch, "Load more" button, column freeze, column-width drag)
- result export (JSON / CSV / Markdown Table / SQL Insert)
- EXPLAIN plan visualization as node graph (xyflow + elkjs) with risk highlighting
- dangerous SQL confirmation dialog (all environments; prod requires typing database name)
- query cancel via CancellationToken

It does **not** cover:

- object explorer / schema tree (Phase 2)
- grid cell editing (Phase 2)
- schema-aware autocomplete (Phase 2)
- ER diagram (Phase 3)

</domain>

<decisions>
## Implementation Decisions

### Workbench Layout
- **D-01:** Left sidebar is present in Phase 1 and shows the connection selector (active connection name + environment color indicator). This sidebar is the Phase 2 placeholder for the object tree — no structural layout change needed in Phase 2.
- **D-02:** Layout: narrow left sidebar | center Monaco editor | bottom results/explain area. Right context panel deferred to Phase 2+.

### EXPLAIN Plan Trigger
- **D-03:** Toolbar has a dedicated "Explain" button (next to Run). Clicking it runs EXPLAIN on the current selection or current statement block and renders the result as a node graph.
- **D-04:** If the user manually writes `EXPLAIN SELECT ...` and executes with Ctrl+Enter, the result is also rendered as a graph (not as plain rows). Auto-detection is based on leading EXPLAIN keyword.

### Multi-Statement Execution Default
- **D-05:** Default behavior is **stop on error** — execution halts at the first failing statement. User can toggle to "continue on error" per execution session. This is the safer default for database operations.

### Result Row Overflow
- **D-06:** When a query returns more than 1000 rows, the grid shows the first 1000 with a status line ("1,000 / N rows loaded") and a **"Load more" button** at the bottom. User explicitly triggers additional fetches. Auto-scroll loading is not used.

### Query Tab Lifecycle
- **D-07:** Query tabs are **fully persisted** across app restarts — tab list, SQL content per tab, and the associated connection. Uses Tauri local store (via existing `desktop-bridge.ts`). On restart, last session's tabs are restored as-is.

### Dangerous SQL Confirmation
- **D-08:** Confirmation dialog is shown for **all environments** (dev, test, prod) for DROP / TRUNCATE / ALTER TABLE / ALTER DATABASE / DELETE without WHERE / UPDATE without WHERE.
- **D-09:** For dev/test connections: dialog shows connection name, environment, database name, exact SQL — user clicks OK to confirm.
- **D-10:** For prod connections: same dialog but user must **type the database name** before confirming. Readonly connections reject DML at the Rust command layer before reaching the dialog.

### Claude's Discretion
- Exact panel geometry and pixel sizing within the left sidebar.
- Loading skeleton / empty state design for results area.
- Specific error state presentation when a statement fails mid-script.
- Progress indicator style during query execution.

</decisions>

<specifics>
## Specific Ideas

- Layout should feel like a desktop DB workbench (DataGrip / DBeaver pane style), not a card-based web UI. Reuse existing pane language from `Dashboard.tsx`.
- EXPLAIN graph: full-table-scan nodes (MySQL type=ALL / PostgreSQL Seq Scan) highlighted in red; large-row-estimate nodes get a risk badge. This matches the PLAN-02 success criterion.
- The environment color band is a prominent header strip — not just a small badge. prod=red, test=blue, dev=green. This is the first line of defense against mis-targeting.
- "It should feel like you're always aware of which environment you're in" — color band must be visible at all times while the workbench is open.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product Vision & Architecture
- `docs/db-workbench-extension-design.md` — Full product design: layout, SQL editor spec, incremental execution rules, result grid behavior, EXPLAIN normalization, dangerous SQL rules, export spec
- `docs/extension-boundary-spec.md` — Capability model, HostApi contract, contribution resolver rules — governs how new workbench capabilities must be declared

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` — Phase 1 requirements: CONN-01~03, EDIT-01~05, EXEC-01~04, PLAN-01~02, SAFE-01~02 (16 requirements)
- `.planning/ROADMAP.md` — Phase 1 success criteria (5 acceptance conditions, verbatim)

### Architecture Decisions (from STATE.md)
- `.planning/STATE.md` §Architecture Decisions — DbPoolRegistry managed state, CancellationToken strategy, EXPLAIN PlanNode unification, Monaco autocomplete cache approach, grid edit identifier safety (read even though grid edit is Phase 2 — autocomplete cache pattern is relevant)

### Key Files That Change in Phase 1
- `shared/schema.ts` — add `environment`, `readonly`, `colorTag`, `defaultSchema` to `DbConnectionConfig`; add ~15 new type interfaces
- `src-tauri/src/db_connector/mod.rs` — add `query.rs`, `explain.rs` modules
- `src-tauri/src/lib.rs` — register new commands; add `CancellationRegistry` managed state
- `client/src/lib/desktop-bridge.ts` — add async methods for query/explain/export
- `client/src/extensions/host-api.ts` — extend `ConnectionsApi`
- `client/src/extensions/host-api-runtime.ts` — add capability constants
- `client/src/components/extensions/DbConnectorWorkspace.tsx` — refactor to layout shell + `db-workbench/` subdirectory

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `client/src/components/extensions/DbConnectorWorkspace.tsx` — current connection management shell; Phase 1 refactors this into the workbench layout shell. Connection form and saved-connections list are reused.
- `client/src/lib/desktop-bridge.ts` — existing Tauri IPC bridge pattern; new query/explain/export commands follow the same async invoke pattern.
- `client/src/extensions/host-api.ts` + `host-api-runtime.ts` — capability declaration pattern is established; new workbench capabilities extend `ConnectionsApi`.
- `shared/schema.ts` — `DbConnectionConfig`, `DbSchemaSnapshot`, `DbSchemaDiffResult` already defined; Phase 1 extends `DbConnectionConfig`.
- `src-tauri/src/db_connector/` — `commands.rs`, `introspect.rs` already exist; `query.rs` and `explain.rs` are new modules following the same pattern.
- Monaco editor already installed (`@monaco-editor/react`); used in `MonacoDdlDiff.tsx` — same integration pattern applies to SQL editor.
- `@xyflow/react` + `elkjs` already installed; used in existing graph views — reuse for EXPLAIN node graph.
- `react-window` already installed — reuse for virtual-scroll result grid.

### Established Patterns
- Shared Zod contracts in `shared/schema.ts`; route definitions in `shared/routes.ts` — all new IPC types follow this pattern.
- HostApi capability model is fail-closed: disabled = invisible. New workbench capabilities must be declared in `builtin_extensions/mod.rs`.
- Tauri commands use `#[tauri::command]` + `tauri::State` managed state pattern.
- Frontend uses TanStack Query for server state; local UI state via React hooks.

### Integration Points
- Phase 1 does NOT add a new extension ID — it upgrades the existing `db-connector` extension in place.
- The existing `连接 / Schema / DIFF` tab structure in `DbConnectorWorkspace` is replaced by the new workbench layout. Schema and Diff views must remain accessible (existing functionality must not regress).
- Left sidebar connection selector connects to existing saved-connections list from `DbConnectionConfig[]`.
- Dangerous SQL detection runs on the Rust side (sqlparser AST) before execution reaches the DB.

</code_context>

<deferred>
## Deferred Ideas

- Object explorer / schema tree — Phase 2
- Grid cell editing and transaction commit — Phase 2
- Schema-aware autocomplete — Phase 2
- ER diagram with FK relationships — Phase 3
- Drag-to-relate in ER diagram — Phase 4 / v2.0
- Cross-session query history persistence (beyond tab restore) — future
- Saved script library with tagging — future
- Multiple simultaneous connection tabs — future

</deferred>

---

*Phase: 01-usable-workbench-v1_4*
*Context gathered: 2026-03-24*
