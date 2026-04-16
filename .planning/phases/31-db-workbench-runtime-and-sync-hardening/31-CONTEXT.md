# Phase 31: DB Workbench Runtime And Sync Hardening - Context

**Gathered:** 2026-04-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Close the remaining release-grade gaps where the DB Workbench still over-promises or scales poorly in live runtime and sync workflows.

This phase delivers:
- sync flows whose source/target context, table selection, and key-selection behavior match the actual connections being compared
- runtime semantics that stay truthful for cancel, dangerous-operation preview, large-result browsing, and export behavior
- data compare/apply paths that stop depending on full-table `SELECT *` + `fetch_all` behavior for normal operator workflows

Out of scope in this phase:
- connection catalog governance, grouping, or metadata ergonomics from Phase 30
- SQL snippet/library productivity surfaces from Phase 29
- release evidence collection and live environment verification policy from Phase 26
- broad new modeling/ER-authoring features or unrelated inspection expansion

</domain>

<decisions>
## Implementation Decisions

### Runtime Truth Boundary
- Rust command paths remain the source of truth for cancel semantics, dangerous-operation classification, export behavior, and sync/apply safety; frontend changes only expose or clarify what runtime already enforces.
- The product must not claim "query cancelled" as a hard database-side stop unless the driver/runtime path actually issues a real server cancel; otherwise the UI and result state must describe it as client-side cancellation and suppress stale late-arriving results.
- Dangerous-operation review should expand beyond the current narrow `DROP` / `TRUNCATE` / `ALTER TABLE` / no-`WHERE` checks so operator confirmations better match real write risk, while readonly enforcement remains a separate hard block.
- Interactive result tabs may keep bounded in-memory windows for responsiveness, but any cap must be explicit and must not silently redefine what "loaded rows" or "full result" means.

### Sync Context And Key Semantics
- Sync source and target connection selectors own their own table/introspection context; selectable tables and metadata must no longer be derived only from the currently active workbench connection snapshot.
- Data diff preview must expose per-table key selection as an explicit operator choice with a clear fallback order: primary key first, then unique/business key, then block with an actionable explanation when no stable key exists.
- Per-table compare columns and optional row filters belong in the sync contract when they materially affect correctness; the UI must stop hardcoding empty `keyColumns` / `compareColumns` payloads when runtime supports richer input.
- Compare/apply flows fail closed when stable-key resolution, snapshot freshness, or target safety checks are unresolved.

### Scalable Compare / Apply Strategy
- Full-table compare/apply paths should move toward chunked or paged row acquisition instead of `SELECT *` plus whole-table `fetch_all`, with chunk boundaries derived from stable keys where possible.
- Compare artifacts must remain reviewable long enough for realistic operator flow and job replay; expiry/cap behavior should be operationally visible rather than surprising.
- Large compare/apply and export work should reuse the existing background-job/history model from Phase 27 instead of pretending everything can stay inside transient tab memory.
- When a phase choice exists between adding another convenience control and making large-data behavior truthful, truthfulness and bounded execution win.

### Delivery And Verification Shape
- This phase should prefer a small number of high-leverage runtime and sync hardening slices over a broad rewrite of the workbench shell.
- Contract changes start in `shared/schema.ts`, then host/runtime bridge layers, then Rust request/response types, then UI consumers.
- Verification should focus on deterministic regression coverage for runtime guards, sync contract resolution, and result/export semantics before relying on new live-environment evidence.
- Existing canonical-workbench decisions stay in force: hardening lands inside the current `db-connector` product path rather than creating another DB surface.

### Claude's Discretion
- Internal refactors are allowed in `WorkbenchLayout.tsx`, sync helpers, or Rust data-diff/apply modules when they reduce coupling and make runtime semantics easier to verify.
- The implementation may split Phase 31 into separate plans for sync correctness and runtime scalability if that keeps each slice independently verifiable.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
  - already owns sync source/target selection, result-window messaging, export scope wiring, and most operator-visible runtime semantics.
- `shared/schema.ts`
  - already defines richer data-diff contracts such as `keyColumns`, `compareColumns`, `whereClause`, and `businessKeyColumns`.
- `src-tauri/src/db_connector/data_diff.rs`
  - already validates optional `whereClause` input and contains stable-key/blocker logic that the UI is not surfacing yet.
- `src-tauri/src/db_connector/data_apply.rs`
  - already enforces blocker handling, artifact expiry checks, and apply preview/execute boundaries.
- `src-tauri/src/db_connector/query.rs`
  - already centralizes dangerous-SQL detection, readonly gating, shared request cancellation tokens, and paging metadata.
- `src-tauri/src/db_connector/commands.rs`
  - already separates inline export scopes from full-result export and is the current choke point for export row caps.

### Established Patterns
- Release-grade work in this milestone has consistently kept runtime truth in Rust first, then aligned frontend copy and controls around that truth.
- The canonical DB workflow stays inside the unified workbench shell; fixes should strengthen that route rather than reviving legacy side paths.
- Background or long-running operator work belongs in durable job/history surfaces instead of transient toasts.
- Shared contract discipline matters here: frontend and backend drift has already shown up in edit metadata and sync payload usage.

### Integration Points
- Frontend/operator shell:
  - `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
  - `client/src/components/extensions/db-workbench/ResultGridPane.tsx`
  - `client/src/components/extensions/db-workbench/ConnectionSidebar.tsx`
- Shared/runtime contract:
  - `shared/schema.ts`
  - `client/src/extensions/host-api.ts`
  - `client/src/extensions/host-api-runtime.ts`
  - `client/src/lib/desktop-bridge.ts`
- Rust runtime and sync backend:
  - `src-tauri/src/db_connector/query.rs`
  - `src-tauri/src/db_connector/commands.rs`
  - `src-tauri/src/db_connector/data_diff.rs`
  - `src-tauri/src/db_connector/data_apply.rs`
  - `src-tauri/src/db_connector/introspect.rs`

</code_context>

<specifics>
## Specific Ideas

- Drive sync table options from the selected source/target connections rather than from the active workbench connection snapshot.
- Add explicit sync-table configuration for key columns, compare columns, and optional row filters so runtime fallback logic is visible instead of implicit.
- Replace whole-table compare fetches with chunked loading or another bounded strategy that can scale past toy tables without exhausting memory.
- Tighten cancel semantics so stale late responses cannot overwrite UI state after the operator cancels, and only claim hard DB-side cancellation where the driver actually supports it.
- Reconcile export/result wording with actual runtime limits, especially around loaded-row windows and full-result row caps.

</specifics>

<deferred>
## Deferred Ideas

- Snippet libraries, saved SQL assets, and repeat-execution productivity remain Phase 29 work.
- Connection grouping, notes, prioritization, and broader catalog governance remain Phase 30 work.
- Live release evidence and ship-gate policy remain governed by Phase 26 artifacts and their follow-up blockers.

</deferred>
