---
phase: 32-close-live-release-verification-and-ship-gate-evidence
plan: 03
subsystem: release-evidence-discovery-guard
tags: [db-workbench, release-verification, ship-gate, prereq-probe, regression]
completed: 2026-05-10T20:57:00+08:00
---

# Phase 32 Plan 03 Summary

Phase 32 follow-up added a fail-closed regression guard so prereq-only helper artifacts cannot be mistaken for real live verification evidence.

## Accomplishments

- Exported [collectReleaseVerificationArtifacts](/E:/work/Db-Schema-Ddl/script/release-ship-gate.ts) from [release-ship-gate.ts](/E:/work/Db-Schema-Ddl/script/release-ship-gate.ts) so release-evidence discovery is testable as a typed seam instead of being hidden inside the CLI entrypoint.
- Added a new regression in [release-exit-phase32.test.ts](/E:/work/Db-Schema-Ddl/test/server/release-exit-phase32.test.ts) that writes a packaged smoke artifact plus a `workbench-live-prereq-*.json` artifact into a temp directory and proves the ship gate still reports `MYSQL_LIVE_VERIFICATION_MISSING`.
- Kept the prereq-probe helper honest: it can reduce wasted verification attempts, but it still cannot satisfy `QUAL-01` or clear the ship gate on its own.

## Verification

- `node .\\node_modules\\typescript\\bin\\tsc`
- `node --import=tsx --test test/server/release-exit-phase32.test.ts test/server/release-verification-live-runner.test.ts test/server/release-verification-phase26.test.ts`

## Self-Check

PASS
