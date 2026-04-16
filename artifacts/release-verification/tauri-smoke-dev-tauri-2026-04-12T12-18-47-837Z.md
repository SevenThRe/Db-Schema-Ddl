# Tauri Desktop Smoke tauri-smoke-dev-tauri-2026-04-12T12-18-47-837Z

- Generated at: 2026-04-12T12:18:47.837Z
- App version: manual
- Environment: dev-tauri
- Log path: E:\work\Db-Schema-Ddl\artifacts\release-verification\manual-smoke.log
- Overall status: failed

## Steps

| Step | Status | Detail |
|------|--------|--------|
| Tauri startup | failed | Missing Tauri setup or browser window readiness checkpoint. |
| Dashboard ready | failed | Missing dashboard_ready checkpoint from the live Tauri shell. |
| DB workbench surface | failed | Missing db_workbench_surface_ready from the real DB workbench surface. |
| Connection recovery classification | failed | Missing db_workbench_recovery_classified checkpoint. |

## Blockers

| Code | Blocker | Severity | Message |
|------|---------|----------|---------|
| TAURI_STARTUP_CHECKPOINT_MISSING | yes | critical | Release verification did not observe both tauri_setup_ready and browser_window_loaded. |
| DASHBOARD_READY_CHECKPOINT_MISSING | yes | critical | The release-verification run never reached dashboard_ready. |
| DB_WORKBENCH_ENTRY_CHECKPOINT_MISSING | yes | critical | The release-verification run never reached the DB workbench surface. |
| DB_WORKBENCH_RECOVERY_CHECKPOINT_MISSING | yes | critical | The release-verification run never classified connection recovery. |