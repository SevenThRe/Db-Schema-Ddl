# Phase 25: Deep Inspection Coverage - Context

**Gathered:** 2026-04-12
**Mode:** Smart Discuss (autonomous defaults, non-interactive)
**Status:** Ready for planning

<domain>
## Phase Boundary

Make object inspection coverage credible for daily DB work by ensuring the canonical explorer and inspection pane support the object families operators actually need.

This phase covers:
- searchable explorer coverage for tables, views, indexes, foreign keys, routines, triggers, and PostgreSQL sequences
- direct inspection entry from the explorer into the canonical workbench inspection pane
- honest driver-aware definition/DDL coverage messaging for supported and unsupported cases

Out of scope in this phase:
- brand-new object families beyond the currently supported MySQL/PostgreSQL catalog surfaces
- SQL productivity or job-center work (later phases)
- workbook-oriented schema diff or Excel authoring flows

</domain>

<decisions>
## Implementation Decisions

### Explorer Coverage Model
- Deep inspection stays inside the canonical workbench explorer and inspection pane; there is no second standalone inspection workspace.
- The object tree remains grouped by tables, views, routines, triggers, and sequences, with indexes and foreign keys nested under tables.
- Search/filter must continue to work across object names plus nested columns/indexes/foreign keys so larger catalogs stay usable.

### Inspection Resolution
- Tables, views, indexes, foreign keys, functions, procedures, triggers, and PostgreSQL sequences are treated as supported inspection targets.
- Index and foreign-key inspection continues to resolve through parent-table context rather than new catalog-query families.
- Routine inspection must remain signature-aware, and trigger inspection must remain parent-table-aware, so same-name objects do not resolve ambiguously.

### Honest Coverage Messaging
- Coverage copy must explicitly reflect the supported object families already wired in the backend and sidebar.
- Unsupported driver/object combinations, such as non-PostgreSQL sequence inspection, must remain explicit instead of pretending support exists.
- This phase can formalize already-implemented inspection coverage by locking it with focused tests rather than re-implementing the same behavior.

### the agent's Discretion
- Minor copy updates are allowed if they make supported inspection coverage clearer to operators.
- Static source-level tests are acceptable in this phase because Phase 26 is the later live verification gate.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone and requirements
- `.planning/ROADMAP.md` — Phase 25 goal, dependencies, and success criteria
- `.planning/PROJECT.md` — release-grade DB workbench product goal
- `.planning/REQUIREMENTS.md` — `INSP-01` through `INSP-03`
- `.planning/STATE.md` — current milestone state after Phase 24 completion
- `.planning/phases/24-canonical-workbench-flow/24-CONTEXT.md` — canonical-shell decisions that inspection must remain inside

### Prior object-inspection specs
- `.specify/specs/002-db-object-ddl-inspection/spec.md` — original table/view inspection and honest-coverage scope
- `.specify/specs/004-db-object-deep-inspection/spec.md` — routine/trigger/sequence coverage intent
- `.specify/specs/005-db-index-fk-inspection/spec.md` — index/foreign-key inspection intent

### Runtime truth surfaces
- `shared/schema.ts` — object-kind and inspection response contract
- `client/src/components/extensions/db-workbench/ConnectionSidebar.tsx` — explorer coverage, search behavior, and inspection entry points
- `client/src/components/extensions/db-workbench/ObjectInspectionPane.tsx` — inspection pane copy and DDL/metadata presentation
- `src-tauri/src/db_connector/object_inspect.rs` — backend inspection dispatch and DDL/definition fetch logic

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ConnectionSidebar.tsx`
  - already catalogs tables, views, routines, triggers, sequences, indexes, and foreign keys and exposes clickable inspection entry points.
- `ObjectInspectionPane.tsx`
  - already renders DDL and metadata in a dense operator-style pane and shows coverage notes.
- `object_inspect.rs`
  - already dispatches inspection across table/view/index/foreign-key/function/procedure/trigger/sequence and includes driver-specific DDL fetchers.

### Current Opportunity
- Most Phase 25 capability appears to already exist from earlier implementation waves outside the current GSD milestone bookkeeping.
- What is still missing is milestone-grade verification and guardrails that lock the support matrix and prevent future regression or misleading copy drift.

### Integration Points
- Explorer/UI surface:
  - `client/src/components/extensions/db-workbench/ConnectionSidebar.tsx`
  - `client/src/components/extensions/db-workbench/ObjectInspectionPane.tsx`
- Backend coverage:
  - `src-tauri/src/db_connector/object_inspect.rs`
- Shared contract:
  - `shared/schema.ts`

</code_context>

<specifics>
## Specific Ideas

- Add a focused Phase 25 test file that reads both frontend and backend sources to assert the supported inspection matrix.
- Tighten inspection copy to mention `functions/procedures` explicitly where generic `routines` wording hides the real support set.
- Use this phase to formalize that index/foreign-key and routine/trigger/sequence coverage is now part of the release-grade baseline, not a side experiment.

</specifics>

<deferred>
## Deferred Ideas

- New object families such as materialized views, event schedulers, or engine-specific admin objects belong in later roadmap work if needed.
- Live driver-by-driver click-through of every supported inspection case belongs to Phase 26 release verification.

</deferred>

---

*Phase: 25-deep-inspection-coverage*
*Context gathered: 2026-04-12*
