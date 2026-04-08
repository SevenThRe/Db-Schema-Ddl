# Phase 18: Live Data Compare & Sync - Context

**Gathered:** 2026-04-08
**Mode:** Smart Discuss (autonomous defaults, non-interactive)
**Status:** Ready for planning

<domain>
## Phase Boundary

Turn the partially scaffolded data-sync concept into a first-class DB Workbench operator workflow that satisfies SYNC-01/02/03:
- compare source vs target live data by stable key
- classify row-level deltas as insert/update/delete candidates
- preview sync SQL and execution counts before apply
- block apply when target data changed after compare snapshot
- execute selected sync actions with operator-visible audit history

Out of scope in this phase: generic ETL/import pipelines, cross-vendor type mapping beyond current MySQL/PostgreSQL runtime, full automatic rollback SQL generation, and non-Workbench standalone sync modules.

</domain>

<decisions>
## Implementation Decisions

### 1) Compare Contract and Key Policy (SYNC-01)
- The compare direction is explicit and authoritative: `source -> target`.
- Compare uses an explicit table list in the request; no implicit whole-database auto-compare in the first cut.
- Each table must resolve stable match keys with strict precedence:
  1. primary key
  2. unique key
  3. operator-specified business key columns
- Tables without resolvable stable keys are compare-readable but apply-blocked (`blocked=true`, blocker code emitted).
- Row status classification is fixed to:
  - `source_only` -> suggested `insert`
  - `target_only` -> suggested `delete`
  - `value_changed` -> suggested `update`
  - `unchanged` -> hidden by default, expandable on demand
- Compare columns default to intersection of non-key columns present in both source and target snapshots for that table.

### 2) Preview and Apply Flow (SYNC-02/SYNC-03)
- Apply follows a two-step preview/execute contract, mirroring the successful phase-17 prepare/commit safety pattern:
  - `db_data_diff_preview` creates a compare artifact (`compareId`) with summary + sampled row deltas.
  - `db_data_apply_preview` consumes selected actions and returns SQL preview, per-table row counts, and blocker/risk summaries.
  - `db_data_apply_execute` executes only actions that were previewed and confirmed.
- Selection supports both:
  - table-level bulk actions (all inserts/updates/deletes in table)
  - row-level overrides (include/exclude/action override)
- Execution transaction boundary is per table (not one global transaction across all tables):
  - each table batch is atomic
  - failed table rolls back fully
  - other selected tables can still complete
  - job status may be `partial` with explicit per-table failure details
- Readonly target connections remain preview-only and cannot execute.

### 3) Snapshot Guard and Stale-Compare Blocking (SYNC-02)
- Compare preview persists a deterministic `targetSnapshotHash` scoped to selected tables, keys, and compare columns.
- Apply preview/execute re-samples target state and computes `currentTargetSnapshotHash` using the same canonical hash algorithm.
- If hash mismatch is detected, apply is hard-blocked with `target_snapshot_changed`; user must rerun compare.
- Compare artifacts expire after 15 minutes by default; expired artifacts cannot be executed.
- Snapshot guard validation is enforced in Rust command paths, not frontend-only.

### 4) Auditability, Safety Confirmation, and Persistence (SYNC-03)
- Every preview/execute action is auditable with durable local records:
  - compare metadata (source/target, table scope, key config, compare hash)
  - apply selection summary (counts by action/table)
  - SQL preview excerpt and execution summary
  - per-table/per-row failure diagnostics (including key tuple where available)
- Add a dedicated apply job model with statuses:
  - `pending`, `running`, `completed`, `failed`, `partial`
- Production-grade safety confirmations are required before execute:
  - always show source/target names, environments, and total action counts
  - require typed target database confirmation when target environment is `prod`
  - highlight delete-heavy operations with explicit warning threshold treatment
- New capability gate is introduced as `db.data.sync`; sync preview/execute APIs are blocked when capability is absent.

### Recommended Defaults for Planner
- Reuse phase-17 integrity semantics (artifact id/hash verification) instead of inventing a second trust model.
- Keep compare/apply contracts fail-closed with explicit blocker codes.
- Prefer operator-visible job history over transient toast-only success/failure reporting.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Scope and Acceptance
- `.planning/ROADMAP.md` - Phase 18 goal, dependencies, success criteria, and hard constraints.
- `.planning/REQUIREMENTS.md` - SYNC-01/SYNC-02/SYNC-03 requirement definitions.
- `.planning/STATE.md` - current architecture decisions and phase sequencing assumptions.

### Immediate Prior-Phase Safety Contract
- `.planning/phases/17-safe-data-editing/17-CONTEXT.md` - prepare/commit integrity model, fail-closed eligibility, rollback behavior to carry forward.

### Product and Boundary Design
- `docs/db-workbench-data-sync-design.md` - intended data-sync UX/flow, hash guard model, and staged implementation guidance.
- `docs/db-workbench-extension-design.md` - DB Workbench architecture, capability shape, and command/module conventions.
- `docs/extension-boundary-spec.md` - capability enforcement and host-API boundary rules.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `client/src/components/extensions/db-workbench/data-sync-row-diff.ts`
  - already defines row-diff status/action vocabulary and adapter to existing structured diff UI primitives.
- `client/src/components/extensions/db-workbench/DataSyncRowDiffPane.tsx`
  - existing row-diff detail surface that can be embedded into a full sync workspace once compare data is wired.
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
  - current operator shell with connection/schema context, query runtime, and phase-17 safe mutation flow.
- `client/src/components/extensions/db-workbench/GridEditCommitDialog.tsx`
  - proven preview-confirm UX pattern for mutation safety prompts.

### Established Patterns to Reuse
- Two-step integrity flow (`planId` + `planHash`) already exists for row edit apply:
  - `src-tauri/src/db_connector/grid_edit.rs`
  - `shared/schema.ts` (`DbGridPrepareCommit*`, `DbGridCommit*`)
- Host API capability gating is centralized and fail-closed:
  - `client/src/extensions/host-api.ts`
  - `client/src/extensions/host-api-runtime.ts`
- Desktop bridge and command registration pattern is consistent for new runtime commands:
  - `client/src/lib/desktop-bridge.ts`
  - `src-tauri/src/lib.rs`

### Current Gaps (Must Be Filled in Phase 18)
- No live data-compare/apply shared contracts currently exist in `shared/schema.ts`.
- `DataSyncRowDiffPane` is not wired into `WorkbenchLayout` or `DbConnectorWorkspace` yet.
- Backend currently has schema diff (`db_diff`) and grid edit apply, but no data-sync compare/apply commands:
  - `src-tauri/src/db_connector/commands.rs`
  - `src-tauri/src/db_connector/mod.rs`
- Local SQLite persistence currently stores DB connections but has no sync compare/apply audit tables:
  - `src-tauri/src/storage.rs`

### Integration Points for Phase 18
- Frontend shell: extend `WorkbenchLayout` with a dedicated sync workflow entry while keeping SQL path stable.
- Shared contract: add compare/preview/execute/audit types in `shared/schema.ts` first.
- Host bridge chain: `host-api.ts` -> `host-api-runtime.ts` -> `desktop-bridge.ts` -> Tauri commands.
- Rust modules: add dedicated data-sync modules instead of expanding `query.rs` or overloading `grid_edit.rs`.

</code_context>

<specifics>
## Specific Implementation Notes

- Recommended command surface:
  - `db_data_diff_preview`
  - `db_data_diff_detail`
  - `db_data_apply_preview`
  - `db_data_apply_execute`
  - `db_data_apply_job_detail`
- Recommended Rust module split:
  - `src-tauri/src/db_connector/data_diff.rs`
  - `src-tauri/src/db_connector/data_apply.rs`
  - optional shared hash helper under `db_connector/` for compare/apply guard parity
- Recommended persistence tables in local SQLite:
  - `db_data_compares`
  - `db_data_compare_tables`
  - `db_data_apply_jobs`
  - `db_data_apply_results`
- UI baseline:
  - keep desktop pane density and existing Workbench visual language
  - make sync direction always visible (`source -> target`)
  - show summary-first, drilldown-second execution results (consistent with prior apply-history decisions)
- Safety/error coding should be explicit and machine-usable:
  - `missing_stable_key`
  - `target_snapshot_changed`
  - `unsafe_delete_threshold`
  - `readonly_target`
  - `artifact_expired`

</specifics>

<deferred>
## Deferred Ideas

- Automatic reverse SQL generation for one-click rollback of all successful sync actions.
- Large-table hash/chunk compare optimization beyond the first correctness-first implementation.
- Multi-target fan-out sync execution from one source in a single operation.
- Cross-engine transform rules beyond current MySQL/PostgreSQL operational scope.
- Full diff/report export UX parity (PDF-rich reporting, external sharing workflows).

</deferred>

---

*Phase: 18-live-data-compare-sync*
*Context gathered: 2026-04-08*
