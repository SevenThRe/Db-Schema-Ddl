# Phase 53: Ship Natural-Language-To-SQL And Generated SQL Completion With Safety Gates - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning and execution

<domain>
## Phase Boundary

Phase 53 turns the Phase 52 local runtime foundation into a real generated-SQL workflow. The product target is not “autonomous execution.” The product target is a reviewable operator-assist loop where the local model can draft SQL from natural language, intent refinement, or partial SQL, but execution still flows through the workbench's existing review and safety gates.

This phase delivers:
- generated-SQL prompt packaging that makes output contract, mode, and safety posture explicit
- generated draft parsing plus semantic risk detection for hallucination and unsafe write patterns
- a reachable workbench review surface for assumptions, safety notes, draft SQL acceptance, and safety-gated execution
- evaluation artifacts for representative MySQL and PostgreSQL generation cases

Out of scope in this phase:
- remote hosted models or cloud routing
- silent auto-execution of model-authored SQL
- raw result-row memorization
- provider packaging/download UX beyond the Phase 52 local runtime substrate

</domain>

<decisions>
## Implementation Decisions

### Reuse The Existing Safety Model
- Generated SQL must not invent a second execution path.
- Accepted drafts should flow back into the same `handleExecute` / script-review / dangerous-SQL preview / readonly runtime checks the workbench already trusts.

### Strict JSON Draft Contract
- Prompt generation should demand a strict JSON envelope with `sql`, `summary`, `assumptions`, and `safetyNotes`.
- Parsing can still fall back to fenced SQL or raw SQL because local models are imperfect, but the primary contract stays structured and reviewable.

### Semantic Risk Detection Before Acceptance
- Draft review should not depend only on model self-reporting.
- The Phase 49-50 semantic engine should inspect generated SQL and surface unknown relations or columns, missing join conditions, and unsafe `UPDATE` / `DELETE` patterns as explicit draft-review signals.

### Evaluation Is Part Of The Feature
- Phase 53 is not complete without reproducible evaluation artifacts.
- A small representative MySQL/PostgreSQL corpus is enough for this phase as long as it records pass rate, hallucination rate, and safety-regression rate.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning anchors
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `AGENTS.md`

### Existing SQL intelligence layers
- `client/src/components/extensions/db-workbench/sql-semantic-context.ts`
- `client/src/components/extensions/db-workbench/sql-autocomplete.ts`
- `client/src/components/extensions/db-workbench/sql-memory.ts`
- `client/src/components/extensions/db-workbench/sql-copilot-grounding.ts`

### Reachable workbench surfaces
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
- `client/src/components/extensions/db-workbench/SqlCopilotDialog.tsx`
- `client/src/components/extensions/db-workbench/SqlEditorPane.tsx`

### Runtime and contract references
- `shared/schema.ts`
- `client/src/extensions/host-api.ts`
- `client/src/lib/desktop-bridge.ts`
- `src-tauri/src/db_connector/sql_copilot.rs`

### Regression anchors
- `test/client/db-workbench-sql-copilot-grounding-phase52.test.ts`
- `test/client/db-workbench-sql-memory-phase51.test.ts`
- `test/client/db-workbench-sql-semantic-context-phase49.test.ts`
- `test/client/db-workbench-sql-semantics-phase50.test.ts`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `sql-copilot-grounding.ts`
  - already packages grounded schema, driver rules, current SQL, and safe SQL memory for local runtime prompts
- `sql-semantic-context.ts`
  - already exposes diagnostics we can reuse to score hallucination and risky DML output
- `WorkbenchLayout.tsx`
  - already owns the real execution path, parameter review, dangerous-SQL preview, script review, and readonly-safe runtime flow
- `SqlCopilotDialog.tsx`
  - already exists as the reachable operator surface for runtime configuration, prompt preview, and advisory probe output

### Known Gaps Before This Phase
- the copilot dialog could only warm up the runtime or run grounded advisory probes
- there was no generated-draft parsing or review contract
- model output was not evaluated against representative tasks
- no UI path existed to accept a generated draft into the active editor or run it through existing safety gates

### Integration Points
- generated prompt and parsing module:
  - `client/src/components/extensions/db-workbench/sql-copilot-generation.ts`
- workbench generation flow:
  - `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
  - `client/src/components/extensions/db-workbench/SqlCopilotDialog.tsx`
- evaluation evidence:
  - `script/sql-copilot-evaluate-phase53.ts`
  - `test/client/db-workbench-sql-copilot-generation-phase53.test.ts`

</code_context>

<specifics>
## Specific Ideas

- Derive generation mode from current editor SQL plus optional operator prompt:
  - natural language
  - intent refinement
  - partial SQL completion
- Add a generated-draft review panel to the existing dialog with:
  - summary
  - assumptions
  - safety notes
  - raw draft SQL
  - replace active tab
  - open in new tab
  - run with safety gates
- Emit evaluation artifacts as both JSON and Markdown so the output is usable by scripts and humans.

</specifics>

<deferred>
## Deferred Ideas

- richer AST-parser replacement beyond the current semantic engine
- inline ghost text or token-by-token generated completion
- learned ranking from larger approved corpora
- provider-specific quality tuning and benchmark expansion

</deferred>

---

*Phase: 53-ship-natural-language-to-sql-and-generated-sql-completion-with-safety-gates*
*Context gathered: 2026-04-18*
