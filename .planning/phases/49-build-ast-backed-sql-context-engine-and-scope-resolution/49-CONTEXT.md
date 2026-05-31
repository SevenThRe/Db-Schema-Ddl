# Phase 49: Build AST-Backed SQL Context Engine And Scope Resolution - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 49 is the semantic-foundation pass for SQL authoring. It upgrades the editor from a useful autocomplete helper into a shared statement-analysis layer that completion and hover can both trust.

This phase delivers:
- one shared SQL semantic-context module that resolves the active statement, clause, and cursor slot for common MySQL/PostgreSQL authoring flows
- structured handling for alias scope, CTE scope, and nested subquery projections so editor consumers stop reparsing the same SQL independently
- Monaco consumer wiring that proves the shared contract is real by feeding both completion and hover from the same analysis path
- regression coverage for `SELECT`, `INSERT`, `UPDATE`, `DELETE`, and `WITH` statement contexts

Out of scope in this phase:
- semantic diagnostics and warnings for invalid table/column usage
- deeper driver builtin catalogs and function/type ranking
- query-memory personalization or any generated SQL assistance

</domain>

<decisions>
## Implementation Decisions

### Shared Semantic Contract
- The semantic layer should live in its own workbench module instead of staying buried inside `sql-autocomplete.ts`.
- The shared contract should expose statement kind, clause spans, visible bindings, CTE relations, and active member-access binding for the current cursor.
- This phase should use a token-stream AST-style analyzer for the common SQL forms already supported in the workbench rather than trying to import a heavyweight external parser midstream.

### Consumer Wiring
- `buildCompletionItems(...)` should consume the shared semantic analysis instead of deriving clause/scope locally.
- Monaco hover should be added as the second real consumer so Phase 49 proves the semantic contract is reusable beyond autocomplete.
- Existing public autocomplete helpers should remain source-compatible where practical so current tests and workbench wiring do not need a wider rewrite.

### Scope Coverage
- The semantic engine must explicitly cover `SELECT`, `INSERT`, `UPDATE`, `DELETE`, and `WITH` statement families because those are called out by the roadmap success criteria.
- Alias lookup must work even when the alias declaration appears later in the statement, because the current editor allows column completion in `SELECT u. FROM users u`.
- CTE and subquery projections should resolve through the same binding model rather than special-case hacks in completion only.

### Claude's Discretion
- The semantic module may duplicate some low-level tokenizer helpers initially if that keeps the extraction safe and avoids destabilizing the rest of the workbench.
- Hover content can stay concise and schema-aware; this phase does not need a rich documentation UI.
- Verification should stay fast and local: focused client semantic tests plus `npm run check`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning anchors
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `AGENTS.md`

### Current SQL editor implementation
- `client/src/components/extensions/db-workbench/sql-autocomplete.ts`
- `client/src/components/extensions/db-workbench/SqlEditorPane.tsx`
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`

### Existing regression anchors
- `test/client/db-workbench-autocomplete-phase16.test.tsx`
- `test/client/db-workbench-sql-library-phase16.test.ts`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `sql-autocomplete.ts`
  - already contains the shipped tokenization, alias resolution, CTE parsing, and FK-aware suggestion logic that should be elevated into a shared analyzer
- `SqlEditorPane.tsx`
  - already centralizes Monaco provider registration, making it the right place to prove multi-consumer reuse through hover
- `buildAutocompleteContext(...)`
  - already builds the schema-scoped relation catalog needed by the semantic layer

### Current Gaps
- semantic clause and scope inference currently lives inside autocomplete-specific helpers instead of a shared editor contract
- Monaco has no SQL hover provider yet, so autocomplete is still the only visible consumer of semantic scope analysis
- Phase 16 tests prove completion behavior, but there is no direct regression surface for statement kind, clause spans, or hover symbol resolution

### Integration Points
- semantic analysis extraction:
  - `client/src/components/extensions/db-workbench/sql-semantic-context.ts`
  - `client/src/components/extensions/db-workbench/sql-autocomplete.ts`
- editor consumers:
  - `client/src/components/extensions/db-workbench/SqlEditorPane.tsx`
- verification:
  - `test/client/db-workbench-autocomplete-phase16.test.tsx`
  - `test/client/db-workbench-sql-semantic-context-phase49.test.ts`

</code_context>

<specifics>
## Specific Ideas

- Add a dedicated `analyzeSqlContext(...)` function that returns statement kind, clause spans, visible relation bindings, and active alias/member-access state.
- Repoint completion ranking to the shared analysis result instead of `resolveCursorContext(...)`.
- Add `resolveSemanticHoverSymbol(...)` so hovering `u` or `u.email` surfaces relation/column metadata from the same semantic contract.
- Keep the semantic engine scoped to the forms already exercised by the workbench instead of pretending to solve arbitrary SQL grammar in one phase.

</specifics>

<deferred>
## Deferred Ideas

- driver-aware builtin function catalogs and richer diagnostics belong to Phase 50
- query-memory grounding belongs to Phase 51
- local-model and NL-to-SQL assistance belong to Phases 52-53

</deferred>

---

*Phase: 49-build-ast-backed-sql-context-engine-and-scope-resolution*
*Context gathered: 2026-04-18*
