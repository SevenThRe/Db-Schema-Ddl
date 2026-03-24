---
phase: 1
reviewers: [codex]
reviewed_at: 2026-03-24T00:00:00Z
plans_reviewed:
  - 01-01-PLAN.md
  - 01-02-PLAN.md
  - 01-03-PLAN.md
  - 01-04-PLAN.md
---

# Cross-AI Plan Review — Phase 1: Usable Workbench

---

## Codex Review

Using `code-review-playbook` for a structured plan-quality review. The required routing audit script could not be executed because local PowerShell script execution is disabled, so this review is based on the provided phase brief and plan text.

### Plan 01-01: Type Foundation + Rust Backend

#### Summary
This is the right place to put the hard guarantees for Phase 1: shared types, dangerous-SQL classification, cancellation, EXPLAIN normalization, and managed state all belong in the backend foundation. The sequencing is mostly sound, but the plan is carrying several correctness-critical behaviors without specifying enough contract detail around statement splitting, pagination, cancellation lifecycle, and server-side enforcement boundaries.

#### Strengths
- Pushes dangerous-SQL detection and readonly enforcement into Rust, which is the correct trust boundary.
- Separates MySQL and PostgreSQL EXPLAIN normalization early, matching the known format divergence.
- Calls out `CancellationToken` and the mutex-across-`await` hazard explicitly.
- Starts with failing tests, which is useful here because the type surface is broad and easy to drift.
- Establishes shared TS/Rust types before IPC and UI work, reducing downstream churn.

#### Concerns
- `HIGH`: `split_sql_statements` is underspecified and likely fragile. SQL splitting is notoriously hard across comments, quoted strings, PostgreSQL dollar-quoted bodies, and dialect-specific syntax. If frontend execution targeting and backend segmentation diverge, `EXEC-01`, `SAFE-01`, and `SAFE-02` become unreliable.
- `HIGH`: The plan does not clearly define the backend contract for `Load more` / incremental fetch. Phase 1 requires 1000-row fetches with explicit continuation, but no cursor/offset/fetch-next command is called out here.
- `HIGH`: Dangerous-SQL handling appears split between preview and execute flows. If `db_query_execute` can still run destructive SQL without an explicit confirmed flag or server-side recheck, the safety model is advisory rather than enforced.
- `MEDIUM`: Cancellation registry cleanup is only unit-tested at register/unregister level. That does not cover real query lifecycle races, duplicate request IDs, repeated cancel calls, or cleanup on SQL errors.
- `MEDIUM`: The plan creates a large duplicated type surface in TS and Rust with no stated drift control. That tends to break IPC evolution later.
- `MEDIUM`: Readonly enforcement is mentioned, but the plan does not say whether multi-statement scripts are prevalidated statement-by-statement before execution begins.

#### Suggestions
- Define one canonical execution contract now: request shape, per-statement result shape, cancellation state, pagination token shape, and confirmed-dangerous-execution semantics.
- Do not rely on a hand-rolled SQL splitter unless it is narrowly scoped and tested against comments, quoted semicolons, CTEs, and PostgreSQL dollar quotes. If the backend owns execution segmentation, the frontend should consume that behavior rather than reimplement it.
- Add integration tests for:
  - multi-statement stop-on-error vs continue-on-error
  - readonly rejection inside mixed scripts
  - cancel during a long-running query
  - fetch-first-page then fetch-next-page
- Make `db_query_execute` require an explicit confirmation field when the preview classified the SQL as dangerous, and revalidate on the Rust side before execution.

#### Risk Assessment
**HIGH**. This plan contains the phase's trust boundary and execution semantics. If the statement model, pagination model, or safety enforcement is wrong here, later UI work will look complete but still fail the Phase 1 success criteria.

---

### Plan 01-02: IPC Bridge + Workspace Refactor

#### Summary
The plan sensibly turns the backend foundation into a usable extension boundary and creates the shell needed for the workbench UI. The main risk is not technical difficulty but regression risk: this plan changes extension APIs, capabilities, and the primary workspace container while also promising that legacy connection/schema/diff flows stay intact.

#### Strengths
- Good bridge-first sequencing: commands and capabilities are added before feature components depend on them.
- Explicit capability additions (`db.plan.read`, `db.result.export`) are the right place to keep extension permissions coherent.
- Thin-shell refactor is a good architectural move if it truly isolates legacy views from new workbench panes.
- Pulling SQL formatting dependency setup forward reduces risk in the editor plan.

#### Concerns
- `HIGH`: "Legacy connection management, schema browse, and diff compare must remain accessible" is a major compatibility requirement, but the plan has no explicit regression matrix or gating mechanism for those flows.
- `HIGH`: New desktop bridge methods and new capability gates introduce a classic runtime mismatch risk if any one of manifest, host runtime, Rust command registration, or UI capability checks lags behind.
- `MEDIUM`: `workbenchMode` is mentioned, but not whether it is feature-flagged, persisted, or defaulted safely for existing users.
- `MEDIUM`: The plan changes layout shell and extension boundary at once. That is a large blast radius for a plan whose main job is plumbing.
- `LOW`: CSS custom properties for env/explain colors are added, but there is no mention of accessibility contrast for red/blue bands and badges.

#### Suggestions
- Add a regression checklist for the legacy flows and make it a formal verification gate for this plan.
- Add one extension-boundary integration test that exercises each new bridge method against capability denial and capability grant paths.
- Keep the new workbench shell behind an explicit mode or feature gate until Plans 01-03 and 01-04 are in place.
- Define stable error payloads in the host API now so UI code does not end up branching on raw Tauri/Rust error strings later.

#### Risk Assessment
**MEDIUM-HIGH**. The plan is conceptually correct, but it touches multiple boundaries at once and has a strong non-regression requirement that is not yet backed by explicit acceptance checks.

---

### Plan 01-03: SQL Editor + Connection UI

#### Summary
This plan covers the interactive center of the workbench well: Monaco, shortcuts, tabs, persistence, and connection context. The biggest issue is that it duplicates execution-targeting logic in the frontend. If the editor decides "current statement" differently from the backend, execution, EXPLAIN, and dangerous-SQL preview will not consistently target the same SQL.

#### Strengths
- Good attention to platform detail with `KeyMod.CtrlCmd`.
- Query tab persistence is called out explicitly, which matches the user decision record.
- Toolbar plus EXPLAIN auto-detection align with the phase UX decisions.
- Connection sidebar responsibilities are appropriately narrow for Phase 1.

#### Concerns
- `HIGH`: Frontend "statement block detection" is a major correctness risk. If the editor computes the active statement independently from backend segmentation, users can preview/confirm one SQL block and execute another.
- `HIGH`: Tab persistence is underspecified for corrupted localStorage, schema version changes, or invalid restored active-tab state. Since tabs persist across restarts, this needs a migration and recovery story.
- `MEDIUM`: Binding `Ctrl+W` in a desktop editor is risky. On many platforms it is expected to close a tab or window, and collisions with host-level behavior are likely.
- `MEDIUM`: EXPLAIN auto-detection based on "starts with EXPLAIN" needs to handle leading comments/whitespace and avoid misrouting malformed SQL.
- `MEDIUM`: The plan does not mention cancellation UI state ownership in the editor itself, even though keyboard-driven execution implies a tight editor-to-running-query state loop.
- `LOW`: Multiple query tabs are planned, but connection affinity per tab is not specified. If users switch connections while a tab is open, the behavior needs to be explicit.

#### Suggestions
- Move statement targeting to a shared contract. The frontend should send cursor/selection info, and the backend should return the resolved execution segments, or both layers should use one shared parser utility with identical tests.
- Add localStorage versioning, validation, and reset-on-corruption behavior for persisted tabs.
- Reconsider `Ctrl+W`, or make it opt-in if the host shell already uses it for tab/window close.
- Define whether query tabs are global or bound to a specific connection, and persist that intentionally.

#### Risk Assessment
**MEDIUM-HIGH**. The UI scope is reasonable, but execution-targeting drift between editor and backend would create subtle, user-visible correctness failures that are hard to debug later.

---

### Plan 01-04: Results + EXPLAIN + Safety

#### Summary
This plan is the most user-visible and the most overloaded. It aims to land result browsing, export, EXPLAIN visualization, dangerous-SQL UX, and final workbench orchestration together. The flow is directionally correct, but there are still unresolved backend dependencies and a few safety/performance gaps that could keep the finished phase from actually meeting the success criteria.

#### Strengths
- Captures the core execution flow clearly: preview, confirm if needed, then execute.
- Includes the right UX affordances for the result area: status line, cancel, load more, multi-batch results, export, explain tabs.
- Recognizes that human visual verification is required for the graph/grid work.
- Puts readonly rejection before dialog display, which matches the project decision.

#### Concerns
- `HIGH`: `Load more` is planned in the UI, but the earlier plans do not explicitly define the backend pagination/fetch-next mechanism required to support it.
- `HIGH`: Dangerous-SQL confirmation is described as a frontend interception flow. That is insufficient by itself; destructive execution must still be enforceable by the Rust command layer, not just by UI convention.
- `HIGH`: "Frontend serialization" for export is risky for memory and correctness. If users expect export beyond the currently rendered 1000 rows, this plan needs a clear export scope and likely backend-assisted streaming for larger datasets.
- `MEDIUM`: `react-window` plus sticky headers, frozen columns, and resizable widths is not trivial. That combination is often where grid implementations become unstable or visually inconsistent.
- `MEDIUM`: Cancel behavior for multi-statement execution is not fully specified. The UI needs to define whether cancel stops only the current statement, how partial results are surfaced, and what status the remaining queued statements receive.
- `MEDIUM`: ELK auto-layout on every explain render can get expensive; there is no mention of memoization or deferred rendering for larger plans.
- `LOW`: Risk-badge thresholds for "large rows" are not specified, which can lead to inconsistent highlighting across dialect normalizers.

#### Suggestions
- Pull pagination/export contract details back into Plan 01-01 or 01-02 before this plan starts. This plan should consume those primitives, not invent them late.
- Make dangerous execution require a backend-verified confirmation flag tied to the exact SQL and connection/database context.
- Define export scope explicitly:
  - current visible page only
  - all fetched pages
  - full query result via dedicated backend export path
- Reduce implementation risk in the grid by scoping "freeze columns" carefully if needed, or by explicitly testing whether the chosen stack can support sticky header + resize + horizontal scroll without layout drift.
- Specify cancel semantics for multi-statement runs and verify them in integration tests, not just manually.

#### Risk Assessment
**HIGH**. This plan is doing too much at once, and some of its required behaviors depend on backend contracts that are not yet concretely defined in the earlier plans.

---

### Overall Assessment (Codex)

The phase decomposition is mostly sensible: backend foundation first, then IPC/layout, then editor UI, then results/safety/EXPLAIN. The main weakness is not ordering but contract incompleteness. Three cross-plan issues need tightening before execution starts:

- The execution model must be unified across frontend and backend: statement targeting, multi-statement segmentation, stop-on-error behavior, cancellation, and pagination.
- The safety model must be enforceable in Rust, not only through frontend dialog flow.
- The data-volume model must be explicit: 1000-row paging, load-more semantics, and export scope all need one shared contract.

If those are clarified up front, the phase is achievable. Without them, the plans can all "complete" and still miss the actual success criteria in ways users will notice immediately.

---

## Consensus Summary

*(Single reviewer — no multi-reviewer consensus available. Run with `--gemini` or `--all` for additional perspectives.)*

### Key Concerns (HIGH severity)

1. **SQL statement splitting fragility** (01-01, 01-03) — Frontend and backend may compute "current statement" differently, causing EXEC-01, SAFE-01, SAFE-02 to target wrong SQL.
2. **Safety model not enforced at Rust layer** (01-01, 01-04) — Dangerous SQL confirmation is frontend-only; `db_query_execute` must also verify a confirmed flag server-side.
3. **Pagination/Load-more contract missing** (01-01, 01-04) — The 1000-row fetch + "Load more" behavior requires a cursor/offset mechanism that is not defined in the foundation plan.
4. **Legacy regression risk unguarded** (01-02) — Schema browse and diff compare must remain accessible, but no regression gate is specified.
5. **Export scope undefined** (01-04) — Memory-unsafe frontend serialization for large datasets; no backend-assisted export path planned.

### Suggestions Before Execution

- **01-01**: Add `confirmed: bool` field to `db_query_execute` — enforce server-side after dangerous classification.
- **01-01**: Specify pagination token / offset contract explicitly in the type definitions.
- **01-03**: Add localStorage version key + corruption recovery for tab persistence.
- **01-02**: Add legacy-flow regression checklist as a formal verification gate.
- **01-04**: Clarify export scope (page vs all-fetched vs full-re-execute) before implementation.
