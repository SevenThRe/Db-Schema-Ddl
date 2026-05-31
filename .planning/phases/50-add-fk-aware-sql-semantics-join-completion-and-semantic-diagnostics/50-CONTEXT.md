# Phase 50: Add FK-Aware SQL Semantics, Join Completion, And Semantic Diagnostics - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 50 is the professional-guidance pass on top of the Phase 49 semantic foundation. It turns the shared statement analysis into more IDE-like SQL authoring help: richer driver-aware catalog suggestions, smarter FK join synthesis, and lightweight semantic diagnostics before execution.

This phase delivers:
- driver-aware completion catalogs for common MySQL/PostgreSQL builtins, types, and system schemas
- stronger FK-driven join assistance that helps in both `JOIN` and `ON` clause authoring
- semantic diagnostics for unknown relations, broken aliases, missing qualified columns, and risky DML patterns such as `UPDATE`/`DELETE` without `WHERE`
- focused regression coverage that proves the editor now gives semantic guidance beyond the Phase 49 foundation

Out of scope in this phase:
- persistent query memory or value-grounded ranking
- local model runtime or NL-to-SQL generation
- a full SQL engine parser that guarantees every vendor grammar edge case

</domain>

<decisions>
## Implementation Decisions

### Driver-Aware Catalogs
- The autocomplete context should carry the active driver so completion ranking can distinguish MySQL vs PostgreSQL builtins, types, and system schemas.
- Builtins and types should be injected as low-friction completion items rather than a separate catalog UI in this phase.
- Existing relation and routine suggestions should remain, but driver builtins and system schemas should rank intentionally instead of looking like anonymous keywords.

### FK-Aware Join Guidance
- Phase 49 already provides join-template suggestions in `JOIN` scope; this phase should extend that into `ON`-clause guidance so alias-aware join conditions can be inserted after the joined table is chosen.
- The FK graph from the schema snapshot remains the source of truth for join synthesis.
- Suggestions should respect current bindings and avoid suggesting edges that are already satisfied by bound relations where possible.

### Semantic Diagnostics
- Diagnostics should run locally in the editor alongside the existing lexical and formatter checks rather than requiring a backend round trip.
- The first semantic pass should focus on high-signal issues: unknown relation names, unresolved aliases, missing qualified columns, duplicate alias confusion, missing `ON/USING` after joins, and risky `UPDATE`/`DELETE` without `WHERE`.
- Diagnostics should be lightweight warnings or errors, not hard blocks; runtime safety still belongs to backend execution paths.

### Claude's Discretion
- Completion kinds may expand if that improves Monaco presentation for types or diagnostic-relevant symbols.
- System-schema catalogs can be curated rather than exhaustive as long as they are clearly driver-aware.
- Verification should stay focused on deterministic client tests and `npm run check`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning anchors
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `.planning/phases/49-build-ast-backed-sql-context-engine-and-scope-resolution/49-CONTEXT.md`
- `AGENTS.md`

### Current semantic foundation
- `client/src/components/extensions/db-workbench/sql-semantic-context.ts`
- `client/src/components/extensions/db-workbench/sql-autocomplete.ts`
- `client/src/components/extensions/db-workbench/SqlEditorPane.tsx`
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`

### Existing regression anchors
- `test/client/db-workbench-sql-semantic-context-phase49.test.ts`
- `test/client/db-workbench-autocomplete-phase16.test.tsx`
- `test/client/db-workbench-sql-library-phase16.test.ts`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `sql-semantic-context.ts`
  - now provides shared statement kind, clause spans, visible bindings, and member-access resolution that Phase 50 can reuse for diagnostics and smarter join assistance
- `sql-autocomplete.ts`
  - already owns completion-item ranking and FK join template generation, making it the right place to add driver-aware catalog items and ON-clause suggestions
- `SqlEditorPane.tsx`
  - already aggregates lexical and formatter markers and can append semantic markers without changing the broader workbench flow

### Current Gaps
- completion context currently has no driver field, so builtins/types/system schemas cannot rank differently for MySQL vs PostgreSQL
- FK join synthesis is strongest in `JOIN` scope but does not yet guide the `ON` clause after a relation alias is in place
- the editor still lacks semantic diagnostics beyond lexical/formatter failures

### Integration Points
- context and ranking changes:
  - `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
  - `client/src/components/extensions/db-workbench/sql-autocomplete.ts`
- semantic diagnostics:
  - `client/src/components/extensions/db-workbench/sql-semantic-context.ts`
  - `client/src/components/extensions/db-workbench/SqlEditorPane.tsx`
- verification:
  - `test/client/db-workbench-sql-semantic-context-phase49.test.ts`
  - `test/client/db-workbench-autocomplete-phase16.test.tsx`
  - `test/client/db-workbench-sql-semantics-phase50.test.ts`

</code_context>

<specifics>
## Specific Ideas

- Add a `driver` field to `SqlAutocompleteContext` and pass it from `WorkbenchLayout`.
- Introduce driver-specific builtin function, type, and system-schema completion catalogs with stable sort prefixes.
- Add `ON`-clause join condition suggestions such as `o.user_id = u.id` after `JOIN orders o ON `.
- Export semantic diagnostics from `sql-semantic-context.ts` and merge them into Monaco markers in `SqlEditorPane.tsx`.

</specifics>

<deferred>
## Deferred Ideas

- value-grounded ranking and query memory belong to Phase 51
- local model runtime and generated SQL assistance belong to Phases 52-53
- deeper vendor grammar coverage and richer refactoring actions remain beyond this phase

</deferred>

---

*Phase: 50-add-fk-aware-sql-semantics-join-completion-and-semantic-diagnostics*
*Context gathered: 2026-04-18*
