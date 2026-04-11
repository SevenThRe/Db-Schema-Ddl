# Phase 19: Trusted Query Continuity - Context

**Gathered:** 2026-04-11
**Mode:** Smart Discuss (autonomous defaults, non-interactive)
**Status:** Ready for planning

<domain>
## Phase Boundary

Close the remaining operator-trust gap in the DB Workbench runtime:
- supported result-returning statements must still execute when load-more paging is unavailable
- unsupported paging must be communicated as a limitation, not as an empty or ambiguous result
- recent query context must still come back when the operator reopens a connection after restart

Out of scope in this phase:
- named script libraries, snippet CRUD, and favorites surfaces (Phase 20)
- deeper explorer object coverage (Phase 21)
- browse presets or copy/export accelerators beyond current runtime truthfulness (Phase 22)

</domain>

<decisions>
## Implementation Decisions

### Runtime Trust Model
- Unsupported paging must disable load-more, not skip statement execution.
- Wrapper-safe read queries keep the bounded first-page path even when load-more is disallowed by policy.
- Non-pageable but supported result shapes such as `SHOW` and script-mode `EXPLAIN` return rows through a runtime path marked `pagingMode=unsupported`.

### Operator Messaging
- The result footer must show evidence that rows were returned plus an explicit unsupported-paging message.
- Load-more UI stays available only when `pagingMode=offset` and `hasMore=true`.
- The phase uses the existing `Only single result-returning statements support load more.` runtime reason unless a more specific runtime error is warranted.

### Query Continuity Boundary
- Connection-scoped recent SQL persistence stays local-first and reuses the existing workbench session store.
- Phase 19 does not add new persistence backends or cross-connection memory sharing.
- Validation should prove both write-time capture (`appendRecentQuery`) and reconnect-time restore (`hydrateConnectionSession` -> `recentQueries` UI).

### the agent's Discretion
- Internal helper refactors inside `query.rs` are allowed when they reduce duplicated paging/result-shaping logic.
- Additional narrow regression tests are encouraged if they lock the trusted runtime contract without requiring live DB fixtures.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `client/src/components/extensions/db-workbench/workbench-session.ts`
  - already persists tabs, recent queries, snippets, and selected table by connection id.
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
  - already restores session state on connection switch and records recent SQL after successful query execution.
- `test/client/db-workbench-session-phase16.test.ts`
  - already covers connection-scoped recent query persistence primitives.
- `test/client/db-workbench-flow-phase16.test.tsx`
  - already covers connection-isolated recent SQL behavior.

### Current Runtime Gap
- `src-tauri/src/db_connector/query.rs`
  - currently classifies `SHOW` and `EXPLAIN` as `Unsupported`, which returns an empty unsupported-paging batch instead of executing the statement.
- `ResultGridPane.tsx`
  - currently prioritizes `hasMore` over `pagingMode`, so unsupported-but-truncated results cannot truthfully report "load more unavailable" if runtime starts surfacing `hasMore=true`.

### Integration Points
- Runtime query semantics: `src-tauri/src/db_connector/query.rs`
- Result footer/operator copy: `client/src/components/extensions/db-workbench/ResultGridPane.tsx`
- Connection session hydration and recent SQL surfaces: `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
- Regression coverage:
  - `test/client/db-workbench-runtime-phase15.test.tsx`
  - `test/client/db-workbench-session-phase16.test.ts`

</code_context>

<specifics>
## Specific Ideas

- Use one shared result-shaping helper in Rust so pageable, unsupported-paging, and non-query batches stop drifting.
- Keep unsupported paging explicit for multi-statement result batches as well; "cannot load more" should not imply "did not run".
- Add phase-specific regression checks for:
  - supported non-pageable statement classification
  - unsupported paging footer copy with loaded-row evidence
  - reconnect-time recent query continuity path

</specifics>

<deferred>
## Deferred Ideas

- Operator-facing recent query search, pinning, rename, and library management belong in Phase 20.
- If the product later wants partial-fetch support for more statement families, that should become an explicit runtime design task instead of piggybacking on this trust closeout.

</deferred>

---

*Phase: 19-trusted-query-continuity*
*Context gathered: 2026-04-11*
