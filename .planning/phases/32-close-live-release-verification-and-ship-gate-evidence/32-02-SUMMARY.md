---
phase: 32-close-live-release-verification-and-ship-gate-evidence
plan: 02
subsystem: release-verification-prereq-probe
tags: [db-workbench, release-verification, prereq-probe, live-evidence, handoff]
completed: 2026-05-10T20:48:00+08:00
---

# Phase 32 Plan 02 Summary

Phase 32 follow-up reduced friction around the still-blocked live-evidence step by adding a prereq probe before the full Tauri live verifier.

## Accomplishments

- Extended [workbench-live-verification.ts](/E:/work/Db-Schema-Ddl/script/workbench-live-verification.ts) with a `--prereq-only` mode that resolves bootstrap connection-string inputs, probes TCP reachability when host and port are known, and emits separate prereq JSON/Markdown artifacts.
- Added [workbenchLiveVerificationPrereqArtifactSchema](/E:/work/Db-Schema-Ddl/shared/release-verification.ts) so prereq results are typed and do not get confused with true live-evidence artifacts that the ship gate consumes.
- Added a maintainer-facing npm entrypoint `verify:desktop:live:prereq` in [package.json](/E:/work/Db-Schema-Ddl/package.json) for the new prereq probe path.
- Expanded [release-verification-live-runner.test.ts](/E:/work/Db-Schema-Ddl/test/server/release-verification-live-runner.test.ts) to cover bootstrap resolution, saved-connection warning behavior, TCP prereq probing, and prereq artifact markdown rendering.
- Updated [release-candidate-verification.md](/E:/work/Db-Schema-Ddl/docs/release-candidate-verification.md), [release-exit-checklist.md](/E:/work/Db-Schema-Ddl/docs/release-exit-checklist.md), and [32-LIVE-EVIDENCE-HANDOFF.md](/E:/work/Db-Schema-Ddl/.planning/phases/32-close-live-release-verification-and-ship-gate-evidence/32-LIVE-EVIDENCE-HANDOFF.md) so the next live-verification attempt has a lower-friction command sequence.

## Verification

- `node .\\node_modules\\typescript\\bin\\tsc`
- `node --import=tsx --test test/server/release-verification-live-runner.test.ts test/server/release-exit-phase32.test.ts test/server/release-verification-phase26.test.ts`

## Self-Check

PASS
