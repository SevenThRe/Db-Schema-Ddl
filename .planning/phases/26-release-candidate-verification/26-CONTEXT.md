# Phase 26: Release Candidate Verification - Context

**Gathered:** 2026-04-12
**Mode:** Smart Discuss (autonomous defaults, non-interactive)
**Status:** Ready for planning

<domain>
## Phase Boundary

Turn release verification from stale historical evidence into a truthful, current, repeatable gate for the Tauri DB Workbench.

This phase delivers:
- verification flows that match the current Tauri product shape rather than old Electron-era assumptions
- runtime behavior fixes where verification uncovered misleading operator semantics
- packaged and live-database evidence artifacts that can explicitly block or permit a release decision

Out of scope in this phase:
- new operator productivity surfaces such as job center, script libraries, or broader editing throughput improvements
- full GUI automation of every packaged installer interaction on every machine
- broadening engine support beyond the current MySQL/PostgreSQL release target

</domain>

<decisions>
## Implementation Decisions

### Verification Scope
- Phase 26 covers three release-grade evidence lanes: live MySQL/PostgreSQL workbench verification, packaged desktop smoke evidence, and an explicit ship gate artifact.
- Verification artifacts must be current-run artifacts, not inherited historical proof from older milestones.
- Semi-manual evidence is acceptable where full GUI automation is impractical, but the artifact must remain structured and must never imply success when evidence is missing.

### Tauri-Native Baseline
- Existing Electron-era smoke, preflight, and packaged-review assets are treated as stale and must be ported to the current Tauri runtime and bundle layout.
- Packaged smoke targets the current Tauri release executable and NSIS bundle paths from `src-tauri`, not removed `dist-electron` outputs.
- Release scripts and docs should talk about Tauri, bundled NSIS output, and Rust/runtime wiring rather than Electron bootstrap assumptions.

### Truthful Runtime Semantics
- If verification reveals currently shipped behavior that is misleading for operators, fix it inside this phase instead of merely documenting the gap.
- Two currently discovered blockers are in-scope to fix now:
  - `Ctrl+Enter` statement-under-cursor execution must honor cursor offset end-to-end instead of silently running the full script.
  - Cancelled query/export work must not allow late responses to overwrite UI state or trigger stale downloads.

### Recovery And Smoke Evidence
- Smoke evidence should prove the app can reach the canonical DB workspace path and truthfully report remembered-connection recovery outcomes.
- Recovery evidence is acceptable in three explicit states:
  - restored previous connection/session
  - missing remembered connection fell back with explicit notice
  - no remembered connection existed
- The packaged smoke artifact must classify those states explicitly rather than collapsing them into a vague startup result.

### Ship Gate
- Release readiness must end in a single gate artifact that classifies blockers, warnings, missing evidence, and final decision.
- The gate should fail closed: missing required evidence keeps the build blocked rather than silently passing.
- A human maintainer still owns the final publish choice, but the repo must expose one canonical decision file/command instead of tribal review.

### the agent's Discretion
- Small supporting refactors across shared contracts, workbench runtime state, and verification scripts are allowed if they remove stale architecture assumptions.
- Legacy Electron-named verification assets may be rewritten in place if that keeps historical paths stable while correcting runtime meaning.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone and requirement anchors
- `.planning/ROADMAP.md` — Phase 26 goal and success criteria
- `.planning/PROJECT.md` — publishable DB Workbench goal and release-readiness constraints
- `.planning/REQUIREMENTS.md` — `QUAL-01` through `QUAL-03`
- `.planning/STATE.md` — active milestone state and current blockers
- `.planning/phases/24-canonical-workbench-flow/24-VERIFICATION.md` — canonical route baseline
- `.planning/phases/25-deep-inspection-coverage/25-VERIFICATION.md` — current inspection coverage baseline

### Repo operating rules
- `AGENTS.md` — source-of-truth order and DB Workbench contract discipline

### Runtime truth surfaces
- `client/src/components/extensions/db-workbench/SqlEditorPane.tsx` — cursor-offset execution intent
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx` — actual query/export/cancel behavior and recovery UI
- `client/src/components/extensions/DbConnectorWorkspace.tsx` — remembered connection recovery behavior
- `client/src/pages/Dashboard.tsx` — dedicated database surface routing
- `client/src/lib/desktop-bridge.ts` — Tauri invoke contract surface
- `shared/schema.ts` — shared DB/query request contracts
- `src-tauri/src/db_connector/query.rs` — query execution, cancellation, and readonly semantics
- `src-tauri/src/db_connector/object_inspect.rs` — live inspection coverage
- `src-tauri/src/lib.rs` — Tauri command registration and app lifecycle entry
- `src-tauri/src/tauri.conf.json` — current Tauri bundle/product baseline

### Existing but stale verification assets
- `script/desktop-smoke.ts`
- `script/desktop-packaged-smoke.ts`
- `script/desktop-packaged-smoke-installer.ps1`
- `script/desktop-preflight.ts`
- `docs/desktop-smoke.md`
- `docs/desktop-packaged-smoke.md`
- `artifacts/desktop-smoke/*`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `script/desktop-smoke.ts` already defines a useful artifact pattern: structured steps, findings, summaries, Markdown/JSON dual output.
- `script/desktop-packaged-smoke-installer.ps1` already models semi-manual packaged proof with explicit pass/fail/pending outcomes.
- `shared/desktop-runtime.ts` already contains checkpoint-format helpers that can be reused for Tauri smoke logging.
- `DbConnectorWorkspace.tsx` already emits truthful missing-remembered-connection recovery copy that can be promoted into smoke evidence.

### Current Gaps
- Verification scripts and tests still assume removed Electron build/runtime paths.
- `package.json` has no current release-verification scripts, so the evidence seam is not runnable as a canonical workflow.
- `SqlEditorPane.tsx` calculates cursor offsets, but `WorkbenchLayout.tsx` discards them and `shared/schema.ts` has no cursor-offset request field.
- Query/export cancel paths in `WorkbenchLayout.tsx` do not reject stale late responses after cancellation.
- Current packaged smoke assets do not prove the Tauri app can reach the dedicated DB workspace or classify connection recovery explicitly.

### Integration Points
- DB runtime truth fixes:
  - `shared/schema.ts`
  - `client/src/extensions/host-api.ts`
  - `client/src/extensions/host-api-runtime.ts`
  - `client/src/lib/desktop-bridge.ts`
  - `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
  - `src-tauri/src/db_connector/mod.rs`
  - `src-tauri/src/db_connector/query.rs`
- Packaged smoke and ship gate:
  - `src-tauri/src/lib.rs`
  - `client/src/pages/Dashboard.tsx`
  - `client/src/components/extensions/DbConnectorWorkspace.tsx`
  - `script/desktop-smoke.ts`
  - `script/desktop-packaged-smoke.ts`
  - `script/desktop-packaged-smoke-installer.ps1`
  - `script/desktop-preflight.ts`
  - `package.json`
  - `docs/desktop-smoke.md`
  - `docs/desktop-packaged-smoke.md`

</code_context>

<specifics>
## Specific Ideas

- Add a small shared verification-contract module rather than overloading DB host contracts with release-review-only types.
- Re-export those verification schemas from `shared/schema.ts` to keep existing scripts/tests from importing dead symbols.
- Add smoke-only Tauri checkpoints for:
  - app setup ready
  - browser window loaded
  - database surface opened
  - connection recovery state classified
- Add a canonical release ship-gate artifact that aggregates:
  - packaged smoke
  - NSIS semi-manual proof
  - live MySQL evidence
  - live PostgreSQL evidence

</specifics>

<deferred>
## Deferred Ideas

- Full installer UI automation beyond the structured semi-manual evidence helper
- Rich telemetry dashboards for verification history
- Broader CI/CD integration after the local release gate is trustworthy

</deferred>

---

*Phase: 26-release-candidate-verification*
*Context gathered: 2026-04-12*
