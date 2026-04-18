# Phase 32: Close Live Release Verification And Ship-Gate Evidence - Context

**Gathered:** 2026-04-17
**Status:** Ready for execution

<domain>
## Phase Boundary

Close the remaining release-grade evidence gap by replacing the current loose combination of docs, JSON artifacts, and narrative verification notes with one canonical release-exit checklist.

This phase delivers:
- one typed release-exit checklist artifact that names the current required evidence classes
- one ship-gate evaluation flow that fails closed when required proof is missing, failed, or stale for the current installer build
- maintainer docs that describe the real command sequence and the current expected artifacts

Out of scope in this phase:
- collecting new live MySQL/PostgreSQL proof on machines where those databases are not reachable
- broad changes to desktop smoke/runtime harnesses beyond the evidence contract they emit
- feature work in the DB Workbench itself
- closing the larger v1.9 parity backlog

</domain>

<decisions>
## Implementation Decisions

### Canonical Evidence Shape
- `shared/release-verification.ts` remains the source of truth for release-verification artifacts; Phase 32 extends it with a dedicated `releaseExitChecklistArtifactSchema` rather than hiding checklist state in untyped docs.
- `script/release-ship-gate.ts` stays the canonical release decision entrypoint, but it should now build both a release-exit checklist view and the final ship-gate artifact from the same evaluation pass.
- Existing `releaseShipGateArtifactSchema` fields should remain readable for older phase-26 tests and artifacts; new checklist fields can be additive.

### Current Installer Truth Boundary
- Packaged smoke for the current installer build is the anchor evidence artifact because it names the executable path and generation time for the packaged runtime that maintainers are actually considering for release.
- Live driver artifacts or late-hardening proof older than the latest packaged smoke artifact are treated as stale for release-exit purposes because they predate the current installer candidate.
- Packaged smoke itself is stale if the packaged executable on disk is newer than the artifact that claims to verify it.

### Late Hardening Proof
- Late hardening proof should come from already-written verification artifacts, not from freeform comments. The current minimum hardening proof is the passed verification record for Phase 31 because that phase closed the latest runtime/sync truthfulness seam tied directly to release trust.
- Missing or non-passed late-hardening verification is a release blocker, not a warning.

### Documentation Honesty
- Maintainer runbooks must document the actual CLI surface that exists today. The current live verification script accepts `--driver`, `--connection-id`, and `--connection-name`; docs should stop claiming the manual `--flow=` form is the canonical path.
- The documented release sequence should be: preflight -> packaged smoke -> live verification per driver -> ship gate -> review release-exit checklist.

### External Blockers
- This phase can complete implementation and regression coverage even if live MySQL/PostgreSQL proof remains externally blocked on the current machine.
- If the final release-exit evaluation still blocks because required live artifacts are missing or stale, Phase 32 verification should say so explicitly instead of pretending the release is ready.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `shared/release-verification.ts`
  - already defines the packaged smoke, live verification, and ship-gate artifact contracts.
- `script/release-ship-gate.ts`
  - already aggregates packaged smoke plus live-driver artifacts and fails closed when required proof is missing.
- `script/workbench-live-verification.ts`
  - already emits one driver-specific artifact per run, parses flow checkpoints, and writes structured JSON/Markdown output.
- `.planning/phases/26-release-candidate-verification/26-VERIFICATION.md`
  - already records the current external blocker: live MySQL/PostgreSQL proof is missing on this machine.
- `.planning/phases/31-db-workbench-runtime-and-sync-hardening/31-VERIFICATION.md`
  - already provides a passed hardening verification record that can be lifted into the release-exit checklist.

### Established Patterns
- Release-grade verification work in this repo uses typed shared schemas plus scripts that emit machine-readable JSON artifacts under `artifacts/release-verification/`.
- Phase verification records under `.planning/phases/*/*-VERIFICATION.md` use a simple header shape (`status`, `phase`, `verified_at`) that can be parsed without introducing new infra.
- Docs should describe the real runtime wiring, not design intent or stale historical commands.

### Integration Points
- Release artifact contracts:
  - `shared/release-verification.ts`
- Runtime evidence producers:
  - `script/desktop-packaged-smoke.ts`
  - `script/workbench-live-verification.ts`
- Release decision aggregator:
  - `script/release-ship-gate.ts`
- Maintainer documentation:
  - `docs/release-candidate-verification.md`
  - `docs/desktop-packaged-smoke.md`

</code_context>

<specifics>
## Specific Ideas

- Add a release-exit evidence item model that captures `status`, `generatedAt`, `artifactPath`, and blocker codes per evidence class.
- Record `missingEvidence`, `staleEvidence`, and `shipBlockers` separately so maintainers can see why the gate failed without reading raw JSON by hand.
- Parse Phase 31 verification metadata from `.planning/phases/31-db-workbench-runtime-and-sync-hardening/31-VERIFICATION.md` and classify it as hardening proof.
- Generate a Markdown release-exit checklist alongside JSON so the release decision is readable without custom tooling.

</specifics>

<deferred>
## Deferred Ideas

- Automatic discovery of multiple phase-verification files as hardening proof can wait; one canonical Phase 31 verification record is enough for this release gate.
- Remote artifact storage or CI publishing of release-exit evidence is outside this phase.
- Expanding live verification beyond MySQL/PostgreSQL remains a later product decision, not a release-exit requirement for v1.8.

</deferred>
