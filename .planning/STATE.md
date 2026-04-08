---
gsd_state_version: 1.0
milestone: v1.5
milestone_name: milestone
status: verifying
last_updated: "2026-04-08T07:35:19.333Z"
last_activity: 2026-04-08 — Executed 16-06, recorded summary, and closed phase-16 planning/documentation gaps
progress:
  total_phases: 4
  completed_phases: 2
  total_plans: 10
  completed_plans: 10
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-04-07)

**Core value:** Users can stay inside one trustworthy workbench to inspect, query, edit, compare, and safely synchronize real databases without bouncing to a second DB tool.
**Current focus:** Phase 16 — Unified Workspace Flow

## Current Status

- `v1.0` is complete and audited at `.planning/v1.0-v1.0-MILESTONE-AUDIT.md`
- `v1.1` is complete and audited at `.planning/v1.1-v1.1-MILESTONE-AUDIT.md`
- `v1.2` is complete and audited at `.planning/v1.2-v1.2-MILESTONE-AUDIT.md`
- `v1.3` established packaged/runtime stability and delivery hardening
- `v1.4` established the current DB Workbench surface and surrounding DB management seams
- `v1.5` is now active — 应用级 DB 工作台 milestone

## Current Position

Phase: 16 (unified-workspace-flow) — COMPLETE
Plan: 06 completed (6/6)
Status: NAV-03 traceability is marked complete and `.tsx` verification commands are standardized to loader-aware cross-shell form
Last activity: 2026-04-08 — Executed 16-06, recorded summary, and closed phase-16 planning/documentation gaps

## Important Assumptions

- Internal extension ID stays `db-connector`; display name upgrades to `DB 工作台`
- Daily replacement-grade value comes from runtime trust, workflow continuity, and safety before feature breadth
- Per-connection workspace isolation and multi-schema support are first-order requirements, not polish
- Safe data sync must be built on top of proven key mapping, SQL preview, and transaction semantics
- All v1.0-v1.4 user flows must remain intact while the primary DB path is consolidated

## Accumulated Context

### Architecture Decisions

- Build order: 8 steps — type foundation first, Rust stubs, IPC bridge, workspace refactor, then Phase 1 features. Do not skip steps.
- `DbPoolRegistry` as Tauri managed state: persistent per-connection pool keyed by connectionId
- `CancellationToken` from `tokio-util` crate: requestId-based cancellation; MySQL KILL QUERY / PostgreSQL PgCancelToken for DB-side cancellation
- Monaco autocomplete reads from cached `DbSchemaSnapshot` React ref — zero IPC calls on keystroke
- EXPLAIN normalization: Rust-side `PlanNode` unification before reaching frontend (MySQL EXPLAIN FORMAT=JSON vs PostgreSQL EXPLAIN FORMAT JSON differ structurally)
- Grid edit identifier safety: whitelist validation against live `DbSchemaSnapshot`; `sqlx` parameterized `.bind()` for values only

### v1.5 Milestone Direction

- Workbench shell exists, but replacement blockers are runtime semantics, split legacy/new workflow, per-connection session leakage, hardcoded PostgreSQL `public`, and unfinished edit/sync loops
- New milestone phases continue global sequencing at Phase 15
- Treat `v1.4` as baseline capability inventory, not proof of app-grade DB tool readiness

### Key Files That Change in Phase 1

- `shared/schema.ts` — add `environment`, `readonly`, `colorTag`, `defaultSchema` to `DbConnectionConfig`; add ~15 new type interfaces
- `src-tauri/src/db_connector/mod.rs` — add `query.rs`, `explain.rs` modules; extend structs
- `src-tauri/src/lib.rs` — register new commands; add `CancellationRegistry` managed state
- `client/src/lib/desktop-bridge.ts` — add new async methods for query/explain/export
- `client/src/extensions/host-api.ts` — extend `ConnectionsApi`
- `client/src/extensions/host-api-runtime.ts` — add capability constants
- `client/src/components/extensions/DbConnectorWorkspace.tsx` — refactor to layout shell + `db-workbench/` subdirectory

### Design Documents

- Design document at `docs/db-workbench-extension-design.md` defines the full product vision
- Extension boundary spec at `docs/extension-boundary-spec.md` governs capability model
- Codebase map refreshed 2026-03-24 at `.planning/codebase/`

## Architecture Decisions (Plan 04 Additions)

- react-window v2 `List` + `rowComponent` used (FixedSizeList API removed in v2.x)
- ELK layout is async; useMemo derives flat node list, useEffect runs layout and updates state
- `confirmed=true` in QueryExecutionRequest is the Rust-layer safety gate — frontend dialog is UI only
- 3-mode export: current-page (client-side) / full-re-execute (backend exportRows) / auto-merge

## Architecture Decisions (Plan 04-01 Additions)

- Phase 4 nav model: ddl-to-excel, excel-to-java-enum, schema-diff navigation cleared from Rust manifests; static sidebar entries replace extension contributions for built-in features
- MainSurface union extended with `{ kind: "extensions" }` — extensions surface placeholder added; Plan 02 replaces with ExtensionManagement component
- DDL import button removed from Dashboard header; sidebar is now the canonical entry point

## Architecture Decisions (Plan 04-02 Additions)

- Extension filter: show `db-connector` (DbConnector) + `kind === "external"` only; builtin Transformer/Utility are framework features, not user-managed extensions
- Enable toggle: `ext_set_enabled` IPC + `invalidateQueries(["extensions","all"])` overrides 60s staleTime for immediate sidebar sync
- Uninstall in Phase 4: `ext_set_enabled(false)` + local `uninstalledIds` Set as stub; real uninstall IPC deferred to future phase
- 打開 button: navigates to `{ kind: "extension", extensionId, panelId }` via `onNavigate` prop from Dashboard

## Architecture Decisions (Plan 15-01 Additions)

- Query batch contract now includes explicit paging metadata fields (`returnedRows`, `hasMore`, `pagingMode`, `pagingReason`, `nextOffset`) instead of relying on row-length inference only.
- Export contract now uses runtime-backed request shape (`connectionId/requestId/sql/schema/scope`) and binary response typing (`BinaryCommandResult`) on the frontend bridge.
- Tauri invoke surface now includes `db_list_schemas` and `db_export_rows` registrations to keep command wiring aligned with bridge/API signatures.

## Architecture Decisions (Plan 15-02 Additions)

- Query execution now uses a bounded wrapper (`SELECT * FROM (<base>) ... LIMIT/OFFSET`) with fail-closed `paging_mode=unsupported` for unsafe load-more shapes.
- Export runtime is backend-owned via `db_export_rows`, with `MAX_EXPORT_ROWS` default ceiling, server-side serialization, and `export:{request_id}` cancellation keys.
- PostgreSQL introspection/execution resolves schema as `request.schema -> default_schema -> public` and applies execution context with `SET search_path`.

## Architecture Decisions (Plan 15-03 Additions)

- Result browsing now trusts runtime paging metadata (`pagingMode`/`hasMore`/`nextOffset`) and no longer derives paging capability from `totalRows - loadedRows` guesses.
- Export menu scopes are explicitly runtime-backed (`current_page`, `loaded_rows`, `full_result`) and all export payloads flow through `hostApi.connections.exportRows`.
- Stop action now cancels query or export request IDs through one path, and PostgreSQL schema selection is persisted via `hostApi.connections.save(defaultSchema)` and immediately reflected in introspection/query/export context.

## Architecture Decisions (Plan 15-04 Additions)

- Query runtime regression tests now lock wrapper paging SQL (`SELECT * FROM (...)`, `limit + 1`), unsupported paging metadata, and cancellation token cleanup for both query and export request IDs.
- PostgreSQL introspection SQL statements are centralized constants with tests asserting schema binding via `$1` and no hardcoded `public` filters.
- Phase 15 client regression tests pin operator-visible paging/export strings (`Current page`, `Loaded rows`, `Full result`, `Load more unavailable for this result.`) and backend wiring (`exportRows`, `nextOffset`, full-result warning copy).

## Architecture Decisions (Plan 16-01 Additions)

- Primary route resolution in `DbConnectorWorkspace` now defaults to `PRIMARY_WORKSPACE_VIEW` (`sql`) whenever a selected connection context exists; no-connection entry stays on `connections`.
- Legacy `connections/schema/diff` tabs remain available for continuity but are explicitly labeled as `Legacy tools` so they do not compete with primary entry intent.
- The operator shell now surfaces `Primary DB workspace` in `WorkbenchLayout`, and the fixed-width (`w-[240px]`) sidebar object tree is explicitly titled `Object Explorer` while preserving table/key/index navigation and `onOpenTable` actions.

## Architecture Decisions (Plan 16-02 Additions)

- Workbench session persistence is now centralized in `workbench-session.ts` using `db-workbench:session:v2:{connectionId}` so tabs/drafts/history/snippets are isolated per connection.
- Legacy tab storage (`db-workbench:query-tabs:v1`) is migrated only when a connection has no v2 session, then removed to prevent dual-write drift.
- WorkbenchLayout now restores connection session state on `connection.id` changes and records successful SQL runs through `appendRecentQuery(connection.id, sql)` for deterministic recent-query reuse.
- Snippet operations (`Save snippet`, `Insert snippet`) and `Recent SQL` insertion are session-backed actions tied to the active connection context.

## Architecture Decisions (Plan 16-03 Additions)

- Explorer snapshot contracts now model `views` as a first-class collection in both TypeScript and Rust, separate from base tables.
- Starter query SQL generation in `WorkbenchLayout` now applies driver-safe identifier quoting and qualifies PostgreSQL table targets with active `runtimeSchema`.
- Object explorer quick actions (`Select top 100`, `Count rows`, `Select explicit columns`) all flow through one handler, with explicit-column mode inserting SQL and returning editor focus without auto-execution.

## Architecture Decisions (Plan 16-04 Additions)

- Workbench autocomplete context is now derived once per snapshot/schema change via `buildAutocompleteContext(schemaSnapshot, runtimeSchema)` and injected into `SqlEditorPane`.
- Monaco completion registration is now explicit (`registerCompletionItemProvider`) with dispose/re-register lifecycle control to avoid duplicate providers during remounts or connection switches.
- Alias resolution now supports `FROM/JOIN` alias patterns (including schema-qualified references), and phase-16 regressions lock `SELECT u.` and `JOIN orders o` autocomplete behavior plus connection-scoped `recent sql` and `snippet` session continuity.

## Architecture Decisions (Plan 16-05 Additions)

- Workbench session v2 payload now includes `selectedTableName: string | null` so selected object focus is persisted in the same connection-scoped contract as tabs/drafts/recent/snippets.
- Connection-switch hydration in `WorkbenchLayout` explicitly restores selected object focus via `setSelectedTableName(restored.selectedTableName)` before continuing normal explorer reconciliation.
- Phase-16 session regressions now assert selected object isolation across at least two connection IDs in both session-contract and flow-level tests.

## Architecture Decisions (Plan 16-06 Additions)

- NAV-03 is treated as complete in REQUIREMENTS/ROADMAP once verification evidence already proves implementation and regression coverage in phase-16 artifacts.
- `.tsx` verification command documentation now uses `node --import tsx --test --experimental-strip-types` as canonical form, with `NODE_OPTIONS=--import tsx node ...` retained as historical run context only.

## Next Command

- `$gsd-plan-phase 17`
- `$gsd-verify-work 16`
- `$gsd-discuss-phase 17`

---
*Last updated: 2026-04-08 after completing 16-06 traceability and verification-command gap closure*
