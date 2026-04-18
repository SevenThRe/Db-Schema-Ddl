## 32-01 Summary

Objective completed: release-exit evidence is now consolidated into one checklist-first ship gate instead of being split across independent docs and artifact types.

What landed:

1. `shared/release-verification.ts` now defines `releaseExitChecklistArtifactSchema`, typed release-exit evidence items, and additive `v2` ship-gate fields for `missingEvidence`, `staleEvidence`, `shipBlockers`, and the embedded checklist payload.
2. `script/release-ship-gate.ts` now builds one `release-exit-checklist-*.json/.md` plus one `ship-gate-*.json`, evaluates packaged smoke, MySQL live proof, PostgreSQL live proof, and late hardening proof from Phase 31, and fails closed on missing, failed, or stale evidence.
3. `script/workbench-live-verification.ts` now accepts `--connection` as a compatibility alias for `--connection-name` and labels the generated Markdown output with its driver-specific evidence class.
4. `docs/release-candidate-verification.md`, `docs/desktop-packaged-smoke.md`, and the new `docs/release-exit-checklist.md` now describe the actual maintainer workflow: preflight -> packaged smoke -> live verification -> ship gate -> checklist review.
5. `test/server/release-exit-phase32.test.ts` now locks the new checklist contract, missing-proof blockers, and stale-evidence behavior, while the existing Phase 26 release-verification tests still pass against the additive `v2` gate artifact.

Validation:

- `npm run check`
- `node --import=tsx --test test/server/release-verification-phase26.test.ts test/server/release-exit-phase32.test.ts`
- `npm run verify:desktop:ship-gate`

Observed release-exit result:

- `artifacts/release-verification/release-exit-checklist-2026-04-17T02-11-01-818Z.json`
- `artifacts/release-verification/release-exit-checklist-2026-04-17T02-11-01-818Z.md`
- `artifacts/release-verification/ship-gate-2026-04-17T02-11-01-818Z.json`

The implementation is in place, but the current release-exit decision remains blocked because:

- `MYSQL_LIVE_VERIFICATION_FAILED` — the latest MySQL live artifact failed before connection because no matching saved connection was found
- `POSTGRES_LIVE_VERIFICATION_MISSING` — no PostgreSQL live artifact exists for the current checklist run

Remaining work outside this plan:

- capture a current MySQL live verification run against a real saved connection
- capture a current PostgreSQL live verification run
- rerun `npm run verify:desktop:ship-gate` after both live artifacts exist and pass
