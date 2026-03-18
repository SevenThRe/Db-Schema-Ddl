---
phase: 02-packaged-build-smoke-v1_3
plan: 02
subsystem: testing
tags: [electron, packaged-smoke, win-unpacked, electron-builder, better-sqlite3]
requires:
  - phase: 01-electron-stability-and-real-env-smoke-v1_3
    provides: checkpoint logging, desktop smoke artifact schema, desktop preflight guards
provides:
  - win-unpacked packaged smoke runner with dedicated log and screenshot capture
  - checkpoint-driven readiness detection for packaged startup
  - preflight guard that keeps packaged smoke on the Electron-native rebuild path
affects: [phase-2-packaged-review, installer-smoke, release-gating]
tech-stack:
  added: []
  patterns: [env-driven Electron smoke hooks, checkpoint-based packaged readiness, ABI-specific preflight guards]
key-files:
  created: [script/desktop-packaged-smoke.ts]
  modified: [package.json, electron/main.ts, test/electron/packaged-smoke-phase2.test.ts, script/desktop-preflight.ts]
key-decisions:
  - "Packaged smoke drives the real win-unpacked executable through env-based smoke hooks instead of a separate automation stack."
  - "Readiness is gated by server_bootstrap_ready and browser_window_loaded checkpoints, not fixed startup sleeps."
  - "Desktop preflight treats smoke:packaged as an Electron-native path and rejects rebuild:native:node drift."
patterns-established:
  - "Packaged smoke runner: emit a dedicated bootstrap log path and screenshot path per run so packaged evidence stays isolated."
  - "Smoke-mode Electron hooks: capture evidence and auto-close from the app process instead of forcing external shutdown."
  - "Preflight ABI separation: Node test flows and packaged Electron flows remain explicitly distinct."
requirements-completed: [STAB-05, STAB-06]
duration: 11 min
completed: 2026-03-18
---

# Phase 2 Plan 02: Packaged Smoke Runner Summary

**A repeatable win-unpacked packaged smoke runner now launches the real exe, waits for bootstrap checkpoints, captures screenshot and log evidence, and guards against Node/Electron native-module ABI drift**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-18T14:36:23.8182626Z
- **Completed:** 2026-03-18T14:48:08.4229298Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Added `script/desktop-packaged-smoke.ts` as the main `win-unpacked` smoke seam for `dist-electron/win-unpacked/DBSchemaExcel2DDL.exe`.
- Added lightweight Electron smoke-mode hooks for dedicated packaged log output, screenshot capture, and auto-close after readiness.
- Extended desktop preflight so `smoke:packaged` remains tied to the Electron-native rebuild path instead of regressing to the Node ABI path.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add a lightweight packaged smoke runner for `win-unpacked`** - `cea692a` (test), `d2c91f6` (feat)
2. **Task 2: Keep packaged build flows and Node test flows safely separated** - `ed5808a` (fix)

## Files Created/Modified
- `script/desktop-packaged-smoke.ts` - Launches the packaged exe, waits for readiness checkpoints, collects screenshot/log evidence, and writes Markdown/JSON artifacts.
- `electron/main.ts` - Adds smoke-mode log override, screenshot capture, and auto-close hooks after the packaged window finishes loading.
- `package.json` - Adds `smoke:packaged` as a repeatable packaged smoke entrypoint.
- `test/electron/packaged-smoke-phase2.test.ts` - Covers win-unpacked path resolution, checkpoint-driven readiness, and packaged failure blocker findings.
- `script/desktop-preflight.ts` - Adds a guard ensuring packaged smoke uses the Electron-native build path and avoids `rebuild:native:node`.

## Decisions Made
- Used environment-driven smoke hooks in the packaged app so the runner can gather evidence without introducing Playwright, WinAppDriver, or other heavy packaged-E2E infrastructure.
- Kept packaged readiness tied to existing runtime checkpoints from Phase 1, which makes startup proof deterministic and phase-aligned.
- Guarded `smoke:packaged` at preflight time instead of relying on convention, because `better-sqlite3` ABI drift is a known regression seam in this repo.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `gsd-tools init execute-phase 02-packaged-build-smoke-v1_3` resolved the stale historical `.planning/phases/02-github-delivery-and-lifecycle` directory. Execution and summary creation were explicitly scoped to `.planning/phases/02-packaged-build-smoke-v1_3` to avoid corrupting older history.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `win-unpacked` packaged smoke is now repeatable with structured evidence and blocker findings.
- Phase 2 can build installer-path coverage and broader packaged release policy on top of this seam in `02-03`.

## Self-Check
PASSED
- Found `.planning/phases/02-packaged-build-smoke-v1_3/02-02-SUMMARY.md`
- Found `script/desktop-packaged-smoke.ts`
- Verified task commits `cea692a`, `d2c91f6`, and `ed5808a` in git history

---
*Phase: 02-packaged-build-smoke-v1_3*
*Completed: 2026-03-18*
