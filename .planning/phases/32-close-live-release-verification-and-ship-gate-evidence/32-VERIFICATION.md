status: blocked
phase: 32-close-live-release-verification-and-ship-gate-evidence
verified_at: 2026-05-10

# Phase 32 Verification

## Scope

Verified the Phase 32 release-exit consolidation work:

- one typed release-exit checklist contract now exists
- the ship gate now aggregates packaged smoke, live MySQL proof, live PostgreSQL proof, and late hardening proof from one evaluation path
- maintainer docs now describe the real command flow and artifact outputs

The release-exit implementation is complete, but the current release decision remains blocked because required live DB proof is still missing or failed on this machine.

On 2026-05-10, a follow-up prereq probe was added to reduce repeated failed live runs before Tauri startup. This does not close the blocker by itself, but it makes the remaining `QUAL-01` handoff more operator-grade.

Later on 2026-05-10, a second follow-up regression guard was added so prereq-only artifacts cannot be mistaken for real live evidence by release-exit discovery.

Still later on 2026-05-10, a third follow-up tightened prereq-probe exit semantics so failed prereq checks now stop unattended workflows earlier, while advisory warnings remain non-blocking.

## Verification Commands

2026-04-17 baseline verification:

- `npm run check`
- `node --import=tsx --test test/server/release-verification-phase26.test.ts test/server/release-exit-phase32.test.ts`
- `npm run verify:desktop:ship-gate`

2026-05-10 prereq-probe follow-up:

- `node .\\node_modules\\typescript\\bin\\tsc`
- `node --import=tsx --test test/server/release-verification-live-runner.test.ts test/server/release-exit-phase32.test.ts test/server/release-verification-phase26.test.ts`

The baseline ship gate intentionally exited blocked and wrote the current release-exit artifacts. The 2026-05-10 follow-up did not rerun the ship gate because the blocker state was unchanged; it validated the new prereq-probe support layer locally instead.

## Requirement Evidence

### QUAL-01

Requirement: live MySQL and PostgreSQL verification is gathered through one current release-exit flow and remains visible as a blocking release requirement.

Evidence:

- `script/release-ship-gate.ts` now embeds one `releaseExitChecklist` that names `mysql-live` and `postgres-live` explicitly as required evidence classes.
- `docs/release-candidate-verification.md` and `docs/release-exit-checklist.md` now document the canonical order and actual live verification CLI surface.
- `artifacts/release-verification/release-exit-checklist-2026-04-17T02-31-58-811Z.json` currently reports:
  - `MYSQL_LIVE_VERIFICATION_FAILED`
  - `POSTGRES_LIVE_VERIFICATION_MISSING`
- `.planning/phases/32-close-live-release-verification-and-ship-gate-evidence/32-LIVE-EVIDENCE-HANDOFF.md` now records the exact rerun order, required preconditions, and artifact review targets for clearing the blocker.
- `script/workbench-live-verification.ts` now also supports `--prereq-only`, which emits typed prereq artifacts before the full live verifier runs.
- `script/release-ship-gate.ts` now exposes typed release-evidence discovery, and `test/server/release-exit-phase32.test.ts` proves that `workbench-live-prereq-*.json` helper artifacts do not satisfy MySQL or PostgreSQL live evidence.
- `script/workbench-live-verification.ts` now returns a non-zero exit code for true prereq failures while keeping saved-connection advisory warnings non-blocking for automation.

Verdict: **Blocked on current live DB evidence**

### QUAL-02

Requirement: packaged desktop smoke evidence is part of the same current release-exit bundle rather than living in a disconnected artifact lane.

Evidence:

- `releaseExitChecklistArtifactSchema` now includes `packaged-smoke` as a first-class evidence item.
- `artifacts/release-verification/release-exit-checklist-2026-04-17T02-31-58-811Z.json` classifies packaged smoke as:
  - `status: current`
  - artifact path `artifacts/release-verification/tauri-packaged-smoke-2026-04-12T06-30-19-330Z.json`

Verdict: **Complete**

### QUAL-03

Requirement: publishability is decided from one explicit ship gate that classifies blockers versus backlog.

Evidence:

- `script/release-ship-gate.ts` now emits:
  - `release-exit-checklist-*.json`
  - `release-exit-checklist-*.md`
  - `ship-gate-*.json`
- `docs/release-exit-checklist.md` defines:
  - `## Required evidence`
  - `## Ship blockers`
  - `## Post-release backlog`
- `artifacts/release-verification/ship-gate-2026-04-17T02-31-58-811Z.json` contains:
  - `shipBlockers`
  - `missingEvidence`
  - `staleEvidence`
  - `releaseExitChecklistPath`

Verdict: **Complete**

## Goal Assessment

Phase 32 implementation is in place and the release-exit package is now real, current, and machine-readable. The phase is still blocked as a release gate because the current live driver evidence set is not yet sufficient to clear publishability.

## Residual Risk

- The latest MySQL live artifact is not a passing proof run; its `connect` flow failed with `pool timed out while waiting for an open connection`.
- PostgreSQL live verification has not been captured for the current release-exit review.
- Until both live artifacts exist and pass, the release-exit checklist must remain `blocked` even though the consolidation work itself is complete.
- The current unblock sequence is documented in `.planning/phases/32-close-live-release-verification-and-ship-gate-evidence/32-LIVE-EVIDENCE-HANDOFF.md`.
