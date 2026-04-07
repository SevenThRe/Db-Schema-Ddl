---
gsd_state_version: 1.0
milestone: v1.5
milestone_name: 应用级 DB 工作台
status: Ready to execute
last_updated: "2026-04-07T00:00:00+09:00"
progress:
  total_phases: 18
  completed_phases: 14
  total_plans: 0
  completed_plans: 0
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-04-07)

**Core value:** Users can stay inside one trustworthy workbench to inspect, query, edit, compare, and safely synchronize real databases without bouncing to a second DB tool.
**Current focus:** Phase 15 — Query Runtime Hardening

## Current Status

- `v1.0` is complete and audited at `.planning/v1.0-v1.0-MILESTONE-AUDIT.md`
- `v1.1` is complete and audited at `.planning/v1.1-v1.1-MILESTONE-AUDIT.md`
- `v1.2` is complete and audited at `.planning/v1.2-v1.2-MILESTONE-AUDIT.md`
- `v1.3` established packaged/runtime stability and delivery hardening
- `v1.4` established the current DB Workbench surface and surrounding DB management seams
- `v1.5` is now active — 应用级 DB 工作台 milestone

## Current Position

Phase: 15 (query-runtime-hardening-v1_5) — READY
Plan: -
Status: Requirements and roadmap defined
Last activity: 2026-04-07 — Roadmap created for milestone v1.5 应用级 DB 工作台

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

## Next Command

- `$gsd-discuss-phase 15`
- `$gsd-plan-phase 15`

---
*Last updated: 2026-04-07 after creating the v1.5 roadmap*
