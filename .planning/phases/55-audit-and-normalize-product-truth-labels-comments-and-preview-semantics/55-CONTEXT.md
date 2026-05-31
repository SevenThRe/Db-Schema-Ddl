# Phase 55: Audit And Normalize Product-Truth Labels, Comments, And Preview Semantics - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Make operator-facing labels, code comments, and design guidance describe the real shipped DB workbench accurately so future work is anchored to runtime truth instead of migration-era assumptions.

This phase delivers:
- explicit normalization of compatibility vs preview vs shipped wording
- cleanup of stale implementation comments that still talk like the workbench is an early scaffold
- docs and guard tests that keep product-truth wording aligned with current runtime behavior

Out of scope in this phase:
- changing actual capability maturity where the runtime proof is still intentionally incomplete
- promoting `Data Sync` or `Job Center` beyond preview
- broad repo-wide doc rewrite unrelated to DB workbench truth surfaces

</domain>

<decisions>
## Implementation Decisions

### Product-Truth Semantics
- `Compatibility` should describe retained schema/diff routes that are still real but no longer first-class.
- `Preview` should remain reserved for advanced workflows whose runtime is reachable but not yet promoted, especially `Data Sync / Job Center`.
- `Shipped` should describe canonical or support surfaces that are both reachable and product-claimed today.

### Code And Comment Cleanup
- stale phase-number comments and "planned later" comments in current runtime files should be removed or rewritten when the capability is already live.
- high-signal shell and workbench files should stop reading like migration notes unless the migration constraint still affects runtime truth.
- historical design docs may stay historical, but they must clearly declare when they are no longer the runtime source of truth.

### Regression Guarding
- focused text-search tests are acceptable here because the defect is semantic drift between wording and runtime truth.
- docs should point readers to runtime truth files such as the feature checklist and surface inventory rather than pretending one old design note is the product contract.

### Claude's Discretion
- if a label is already truthful and deliberately preview-bound, keep it.
- concise clarifying notes at the top of historical docs are better than silently rewriting every historical section.

</decisions>

<specifics>
## Specific Ideas

- replace the top-of-file `Plan 04` / `Phase 2 planned` comments in current workbench files
- add a runtime-truth note to the DB workbench design doc so readers do not misread it as a shipped-capability contract
- keep `Data Sync / Job Center` preview wording explicit while cleaning compatibility-surface wording elsewhere

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Runtime truth and capability taxonomy
- `docs/db-workbench-feature-checklist.md` — current shipped/preview/partial/gap status
- `docs/db-workbench-surface-inventory.md` — canonical/support/compatibility surface ownership
- `docs/release-candidate-verification.md` — current preview-promotion language for release gating

### Current source files that still carry product wording
- `client/src/components/extensions/DbConnectorWorkspace.tsx`
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
- `client/src/components/extensions/db-workbench/ConnectionSidebar.tsx`
- `docs/db-workbench-extension-design.md`

### Repo operating rules
- `AGENTS.md` — runtime code first, docs second, design docs are not capability contracts
- `.planning/db-workbench-operator-grade-plan.md` — defect framing for stale labels/comments

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `docs/db-workbench-feature-checklist.md`
  - already expresses the current maturity taxonomy and can serve as the truth anchor
- focused tests under `test/client` and `test/server`
  - already protect wording-dependent product semantics with file-content assertions

### Established Patterns
- the repo accepts doc-and-copy-focused regression tests when wording itself is part of the product contract
- `Preview` is already used deliberately in the workbench for `Data Sync` and `Job Center`

### Integration Points
- current migration-era wording is concentrated in shell copy, top-of-file comments, and the DB workbench design doc
- release docs and reliability contracts should reuse the same maturity vocabulary instead of inventing a second taxonomy

</code_context>

<deferred>
## Deferred Ideas

- full capability promotion for `Data Sync` belongs to Phase 34
- broader design-doc modernization for non-DB areas is outside this phase

</deferred>

---

*Phase: 55-audit-and-normalize-product-truth-labels-comments-and-preview-semantics*
*Context gathered: 2026-04-18*
