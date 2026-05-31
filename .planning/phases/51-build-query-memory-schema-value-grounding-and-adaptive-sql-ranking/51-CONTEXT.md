# Phase 51: Build Query Memory, Schema/Value Grounding, And Adaptive SQL Ranking - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning and execution

<domain>
## Phase Boundary

Phase 51 is the first personalization layer on top of the Phase 49-50 semantic editor baseline. The target is not generated SQL yet. The target is a trustworthy local memory model that can:

- remember accepted editor suggestions per connection
- remember successful query patterns and grounded relation or column usage
- capture safe value-shape summaries from result batches without persisting raw row payloads
- expose inspect and clear controls so ranking stays explainable instead of opaque

This phase delivers:

- connection-scoped SQL memory persisted with the rest of the workbench session
- adaptive completion ranking that consumes accepted suggestions, query-pattern grounding, and safe value profiles
- explicit operator controls for retention, schema-scoped clearing, and full memory reset
- focused regression coverage for persistence, ranking, retention, and UI/editor wiring

Out of scope in this phase:

- local model runtime
- NL-to-SQL or generated completion
- server-side memory services or cloud sync

</domain>

<decisions>
## Implementation Decisions

### Persistence Model
- Reuse the existing connection-scoped workbench session store instead of introducing a second storage surface.
- Keep memory local to each connection, with schema labels on entries so the operator can clear the current schema scope separately.
- Store only pattern metadata and value-shape hints, never raw result rows.

### Grounding Inputs
- Successful query runs remain the source of reusable query patterns.
- Monaco completion acceptance should emit a direct signal through a completion command instead of inferring acceptance indirectly from later SQL edits.
- Value grounding should come from result-batch source metadata (`sourceSchema`, `sourceTable`, `sourceColumn`) when available.

### UI Surface
- SQL memory should be reachable from the main workbench toolbar beside SQL library and snippets.
- Inspect and clear controls belong in a dedicated dialog, not hidden in localStorage or dev-only tooling.
- Retention toggles pause future capture; clearing remains a separate explicit action.

### Ranking Strategy
- Memory should bias existing clause-aware ranking, not replace it.
- Accepted suggestions and repeated relation or column patterns should be stronger signals than safe value-shape summaries.
- Value profiles should mainly help where clause, grouping, ordering, and select-list ranking.

</decisions>

<canonical_refs>
## Canonical References

- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `AGENTS.md`
- `client/src/components/extensions/db-workbench/workbench-session.ts`
- `client/src/components/extensions/db-workbench/sql-autocomplete.ts`
- `client/src/components/extensions/db-workbench/SqlEditorPane.tsx`
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
- `test/client/db-workbench-query-history-phase19.test.ts`
- `test/client/db-workbench-autocomplete-phase16.test.tsx`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `workbench-session.ts`
  - already persists query history, snippets, and restoreable connection-scoped session state
- `sql-autocomplete.ts`
  - already owns clause-aware ranking and FK-aware guidance, making it the correct place to consume memory signals
- `SqlEditorPane.tsx`
  - already owns Monaco completion registration, so completion acceptance can be captured there
- `WorkbenchLayout.tsx`
  - already records query-run history and builds autocomplete context for the active connection

### Current Gaps
- no first-class SQL memory model exists yet
- accepted completion choices are not captured
- ranking is semantic but not personalized
- operators have no inspect or clear surface for SQL-assist memory

### Integration Points
- persistence and retention:
  - `client/src/components/extensions/db-workbench/workbench-session.ts`
- pure memory helpers and safe value grounding:
  - `client/src/components/extensions/db-workbench/sql-memory.ts`
- ranking and completion metadata:
  - `client/src/components/extensions/db-workbench/sql-autocomplete.ts`
- editor acceptance hook:
  - `client/src/components/extensions/db-workbench/SqlEditorPane.tsx`
- operator controls:
  - `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
  - `client/src/components/extensions/db-workbench/SqlMemoryDialog.tsx`

</code_context>

<specifics>
## Specific Ideas

- Persist `acceptedSuggestions`, `queryPatterns`, `valueProfiles`, and retention settings inside each connection session.
- Register a Monaco completion command so accepted suggestions become explicit memory signals.
- Derive safe value profiles from `DbQueryBatchResult` source metadata and row samples, storing only hints like `email-like`, `uuid-like`, or `timestamp-like`.
- Add a dedicated SQL memory dialog with retention toggles plus clear-all and clear-current-schema actions.

</specifics>

<deferred>
## Deferred Ideas

- prompt-grounded local model runtime belongs to Phase 52
- generated SQL and NL-to-SQL belong to Phase 53
- durable shared memory across machines or cloud accounts is out of scope

</deferred>

---

*Phase: 51-build-query-memory-schema-value-grounding-and-adaptive-sql-ranking*
*Context gathered: 2026-04-18*
