# Phase 27: Job Center And Execution History - Context

**Gathered:** 2026-04-12
**Mode:** Smart Discuss (autonomous defaults, non-interactive)
**Status:** Ready for planning

<domain>
## Phase Boundary

Turn long-running DB work into a persistent operator surface so job status and failure context do not disappear after a toast.

This phase covers:
- a persistent Job Center inside the canonical DB workbench shell
- recent and active job history for the currently wired background DB workflow
- reopenable job detail with enough audit context to understand prior runs without rerunning them blindly

Out of scope in this phase:
- inventing fake background jobs for export or release verification when the runtime does not yet persist them
- broad data-edit throughput work beyond job-history integration (Phase 28)
- SQL snippet/script management (Phase 29)
- larger connection-governance workflows (Phase 30)

</domain>

<decisions>
## Implementation Decisions

### Job Center Surface
- Job history stays inside the canonical `WorkbenchLayout` as another result-mode pane rather than creating a second standalone workspace.
- The Job Center is persistent and reopenable through workbench session state; it is not a notification drawer or transient modal.
- The existing sync pane keeps lightweight inline status, but the durable source of truth for finished/running apply jobs moves to the Job Center.

### Initial Job Family Coverage
- Phase 27 formalizes `Data Sync apply` as the first persisted background job family because it already runs asynchronously and is already stored locally.
- The shared contract should be generic enough to add future job families later, but this phase must not claim export or verification jobs are already wired if they are not.
- Job list entries must still feel professional: status, timestamps, related connections, action counts, blocker state, and failure summary belong in the list/preview model.

### Reopen And Review Semantics
- Operators can reopen any recent job detail from the Job Center without depending on the original toast or the sync pane still being open.
- Reopening a historical sync job should be able to restore the related sync source/target context back into the canonical sync pane.
- Running jobs should keep polling from one central history surface so the operator can leave the sync pane and still observe completion/failure.

### Claude's Discretion
- Small refactors are allowed if they collapse duplicate apply-job state between the sync pane and the new Job Center.
- A new dedicated pane component is preferred if it keeps `WorkbenchLayout.tsx` from turning into another monolith.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone and prior-phase anchors
- `.planning/ROADMAP.md` — Phase 27 goal and success criteria
- `.planning/PROJECT.md` — publishable DB workbench product goal
- `.planning/REQUIREMENTS.md` — release-grade constraints and current scope boundaries
- `.planning/STATE.md` — current milestone state and blocked live-verification note
- `.planning/phases/24-canonical-workbench-flow/24-CONTEXT.md` — canonical-shell requirement
- `.planning/phases/26-release-candidate-verification/26-VERIFICATION.md` — verification is still blocked externally, so Phase 27 should keep improving operator trust locally

### Runtime truth surfaces
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx` — current sync pane, apply-job polling, and canonical result-mode tabs
- `client/src/components/extensions/db-workbench/workbench-session.ts` — persisted workbench tab state
- `client/src/extensions/host-api.ts`
- `client/src/extensions/host-api-runtime.ts`
- `client/src/lib/desktop-bridge.ts`
- `shared/schema.ts`
- `src-tauri/src/db_connector/mod.rs`
- `src-tauri/src/db_connector/commands.rs`
- `src-tauri/src/db_connector/data_apply.rs`
- `src-tauri/src/storage.rs`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `WorkbenchLayout.tsx`
  - already has canonical bottom-pane tabs (`results`, `explain`, `schema-diff`, `sync`, `inspect`) and an async polling loop for running apply jobs.
- `storage.rs`
  - already persists `db_data_apply_jobs` and `db_data_apply_results`, including SQL preview audit, timestamps, and result rows.
- `data_apply.rs`
  - already builds a rich detail response for a single apply job from persisted storage.

### Current Gaps
- There is no list/recent-history API for apply jobs; only `fetchDataApplyJobDetail(jobId)` exists.
- The only visible apply-job detail is embedded inside the sync pane, so history effectively disappears once the pane state resets.
- Workbench session persistence does not yet remember a Job Center selection or let historical job review reopen naturally.

### Integration Points
- Shared contract and Tauri wiring:
  - `shared/schema.ts`
  - `src-tauri/src/db_connector/mod.rs`
  - `src-tauri/src/db_connector/commands.rs`
  - `client/src/extensions/host-api.ts`
  - `client/src/extensions/host-api-runtime.ts`
  - `client/src/lib/desktop-bridge.ts`
- Persistent workbench UI:
  - `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
  - `client/src/components/extensions/db-workbench/workbench-session.ts`

</code_context>

<specifics>
## Specific Ideas

- Add a generic `DbBackgroundJobSummary` list contract with a current `jobKind: "data-apply"` implementation so the Job Center surface can scale without lying about unsupported jobs.
- Add a dedicated `JobCenterPane.tsx` with a list/detail split that feels like a desktop tool, not a toast archive.
- Store the selected job id in the workbench session so a reopened workspace can return directly to the last reviewed job.
- Add a `Reopen sync context` action from job detail to restore source/target connection ids back into the sync pane.

</specifics>

<deferred>
## Deferred Ideas

- Export jobs and release-verification runs can join the same job center later once they are truly persisted as runtime jobs.
- Cross-workspace global job center routing outside the DB workbench shell belongs to a later product iteration if needed.

</deferred>

---

*Phase: 27-job-center-and-execution-history*
*Context gathered: 2026-04-12*
