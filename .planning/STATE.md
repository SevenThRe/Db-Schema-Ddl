---
gsd_state_version: 1.0
milestone: v1.4
milestone_name: DB 工作台
status: in_progress
last_updated: "2026-03-24T00:00:00+09:00"
progress:
  total_phases: 3
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-03-24)

**Core value:** Users can write SQL, browse results, visualize execution plans, safely edit data, and explore ER diagrams — all within the db-connector workbench — forming a closed loop with Excel DDL definition and schema comparison.
**Current focus:** Milestone v1.4 roadmap created — 3 phases, 21 requirements mapped. Ready to plan Phase 1.

## Current Status

- `v1.0` is complete and audited at `.planning/v1.0-v1.0-MILESTONE-AUDIT.md`
- `v1.1` is complete and audited at `.planning/v1.1-v1.1-MILESTONE-AUDIT.md`
- `v1.2` is complete and audited at `.planning/v1.2-v1.2-MILESTONE-AUDIT.md`
- `v1.3` is complete — runtime hardening (startup/shutdown/logging/packaged smoke)
- `v1.4` is now active — DB 工作台 workbench extension milestone
- Phase numbering starts at 01 (with `_v1_4` suffix per project convention)

## Current Position

Phase: Phase 1 (not started)
Plan: —
Status: Roadmap created — ready for `/gsd:plan-phase 1`
Last activity: 2026-03-24 — Roadmap created for milestone v1.4 DB 工作台

```
Progress: [                    ] 0%
Phase 1/3 | Plan 0/0
```

## Important Assumptions

- Internal extension ID stays `db-connector`; display name upgrades to `DB 工作台`
- Frontend already has Monaco, @xyflow/react, elkjs, react-window — no new major UI dependencies needed
- Rust db_connector module already exists with introspect/diff commands — add query/explain/grid-edit/relations modules
- Grid editing uses parameterized SQL (values) + identifier whitelist validation against schema snapshot (no string concat for identifiers)
- Phase 1 (usable workbench) delivers the core SQL editor + results + explain + safety protection
- ER drag-to-relate is Phase 4 and must not creep into earlier phases
- All v1.0–v1.3 user flows (connection management, schema compare, apply history) must stay intact

## Accumulated Context

### Architecture Decisions

- Build order: 8 steps — type foundation first, Rust stubs, IPC bridge, workspace refactor, then Phase 1 features. Do not skip steps.
- `DbPoolRegistry` as Tauri managed state: persistent per-connection pool keyed by connectionId
- `CancellationToken` from `tokio-util` crate: requestId-based cancellation; MySQL KILL QUERY / PostgreSQL PgCancelToken for DB-side cancellation
- Monaco autocomplete reads from cached `DbSchemaSnapshot` React ref — zero IPC calls on keystroke
- EXPLAIN normalization: Rust-side `PlanNode` unification before reaching frontend (MySQL EXPLAIN FORMAT=JSON vs PostgreSQL EXPLAIN FORMAT JSON differ structurally)
- Grid edit identifier safety: whitelist validation against live `DbSchemaSnapshot`; `sqlx` parameterized `.bind()` for values only

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

## Next Command

- `/gsd:plan-phase 1` — Plan Phase 01: Usable Workbench (SQL editor, read-only grid, explain, danger protection, connection environment model)

---
*Last updated: 2026-03-24 after creating milestone v1.4 roadmap*
