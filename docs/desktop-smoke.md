# Tauri Desktop Smoke

Phase 26 replaces the old Electron smoke seam with a Tauri-native one.

## Goal

Capture one structured artifact proving that the current Tauri app can:

- reach `tauri_setup_ready`
- load the browser window
- render the dashboard
- mount the real DB workbench surface
- classify remembered-connection recovery as `restored`, `missing-fallback`, or `none`

## Commands

Run preflight first:

```powershell
npm run verify:desktop:preflight
```

Then generate or classify a smoke artifact:

```powershell
npm run verify:desktop:smoke -- --mode=dev-tauri --log=artifacts/release-verification/manual-smoke.log --app-version=1.1.4
```

Artifacts are written under:

```text
artifacts/release-verification/
```

## Required Checkpoints

The smoke log is expected to contain these checkpoints from the live Tauri app:

- `tauri_setup_ready`
- `browser_window_loaded`
- `dashboard_ready`
- `db_workbench_surface_ready`
- `db_workbench_recovery_classified`

## Evidence Rules

- Missing startup, dashboard, workbench-entry, or recovery checkpoints is a blocker.
- `missing-fallback` recovery is allowed but must remain explicit in the artifact.
- The smoke artifact is current only when it comes from the Tauri app, not from old Electron scripts.
