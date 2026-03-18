# Phase 02-04 Validation Run

- Generated at: `2026-03-18T15:18:47.978Z`
- Phase: `02-packaged-build-smoke-v1_3`
- Plan: `02-04`
- Overall status: `warning`

## Command Results

- `npm run check` -> passed
- `npm test` -> passed
- `npm run build:electron` -> passed
- `npm run smoke:packaged` -> warning
- `powershell -ExecutionPolicy Bypass -File .\script\desktop-packaged-smoke-installer.ps1 -SemiManual ...` -> passed

## win-unpacked Evidence

- JSON artifact: `artifacts/desktop-smoke/desktop-smoke-packaged-win-unpacked-2026-03-18T15-15-45-672Z.json`
- Markdown summary: `artifacts/desktop-smoke/desktop-smoke-packaged-win-unpacked-2026-03-18T15-15-45-672Z.md`
- Bootstrap log: `artifacts/desktop-smoke/desktop-smoke-packaged-win-unpacked-2026-03-18T15-15-45-672Z.bootstrap.log`
- Screenshot: `artifacts/desktop-smoke/desktop-smoke-packaged-win-unpacked-2026-03-18T15-15-45-672Z.png`

Observed evidence in the bootstrap log:

- `server_bootstrap_ready`
- `browser_window_loaded`
- `smoke_screenshot_written`
- `server_shutdown_complete`

The runner still returned `PACKAGED_READINESS_FAILED` and `PACKAGED_SHUTDOWN_FAILED`. Because the checkpoint log, screenshot file, and process state disagree with that result, treat this as a false-negative packaged smoke runner blocker that must be fixed before phase-close can be considered fully clean.

## NSIS Coverage

- JSON artifact: `artifacts/desktop-smoke/desktop-smoke-packaged-nsis-2026-03-18T15-18-08-264Z.json`
- Markdown summary: `artifacts/desktop-smoke/desktop-smoke-packaged-nsis-2026-03-18T15-18-08-264Z.md`
- Status: `semi-manual`
- Manual note: `Semi-manual on 2026-03-19: installer UI and first-launch steps require operator confirmation on this machine.`

## Review Outcome

- Build and test gates passed.
- Structured packaged evidence exists for both `win-unpacked` and `NSIS`.
- Installer manual-only coverage is explicit.
- Remaining blocker: the current `win-unpacked` runner reports a failure despite captured readiness and screenshot evidence.
