# Desktop Smoke Run desktop-smoke-packaged-win-unpacked-2026-03-18T23-41-33-011Z

- Generated at: 2026-03-18T23:41:33.011Z
- App version: packaged-smoke
- Environment: packaged-electron
- Run mode: packaged-win-unpacked
- Log path: C:\Users\ISI202502\Downloads\Db-Schema-Ddl\artifacts\desktop-smoke\desktop-smoke-packaged-win-unpacked-2026-03-18T23-41-33-011Z.bootstrap.log
- Executable path: C:\Users\ISI202502\Downloads\Db-Schema-Ddl\dist-electron\win-unpacked\DBSchemaExcel2DDL.exe
- Overall status: failed

## Steps

| Step | Status | Detail |
|------|--------|--------|
| 应用启动 | passed | Observed checkpoints: server_bootstrap_started, server_bootstrap_ready, smoke_sqlite_init_ready, browser_window_creating, browser_window_loaded, smoke_db_management_entry_requested, smoke_db_management_blocked |
| SQLite 初始化与迁移 | passed | Observed packaged SQLite initialization and migration readiness checkpoint. |
| 扩展入口检查 | failed | Packaged DB 管理 entry was blocked during the smoke-only real entry flow. |
| MySQL 读取链路 | warning | Live MySQL proof remains optional for packaged smoke and was not required in this run. |
| 应用关闭 | passed | Packaged app exited cleanly after the smoke-mode DB 管理 proof path. |

## Screenshots

- C:\Users\ISI202502\Downloads\Db-Schema-Ddl\artifacts\desktop-smoke\desktop-smoke-packaged-win-unpacked-2026-03-18T23-41-33-011Z.png

## Log Excerpt

- Source: C:\Users\ISI202502\Downloads\Db-Schema-Ddl\artifacts\desktop-smoke\desktop-smoke-packaged-win-unpacked-2026-03-18T23-41-33-011Z.bootstrap.log
- Lines: 1-11

```text
[2026-03-18T23:41:33.843Z] [checkpoint:server_bootstrap_started] {"startPort":5000}
[2026-03-18T23:41:35.226Z] [checkpoint:server_bootstrap_ready] {"port":5000}
[2026-03-18T23:41:35.227Z] [checkpoint:smoke_sqlite_init_ready] {"port":5000,"dbPath":"C:\\Users\\ISI202502\\AppData\\Roaming\\db-schema-excel-2-ddl\\data"}
[2026-03-18T23:41:35.227Z] [checkpoint:browser_window_creating]
[2026-03-18T23:41:35.744Z] [checkpoint:browser_window_loaded] {"port":5000}
[2026-03-18T23:41:35.960Z] [checkpoint:smoke_db_management_entry_requested]
[2026-03-18T23:41:35.974Z] [checkpoint:smoke_db_management_blocked] {"reason":"not-installed"}
[2026-03-18T23:41:36.220Z] [checkpoint:smoke_screenshot_written] {"path":"C:\\Users\\ISI202502\\Downloads\\Db-Schema-Ddl\\artifacts\\desktop-smoke\\desktop-smoke-packaged-win-unpacked-2026-03-18T23-41-33-011Z.png"}
[2026-03-18T23:41:37.482Z] [checkpoint:smoke_auto_close_requested] {"delayMs":1500,"reason":"not-installed"}
[2026-03-18T23:41:37.483Z] [checkpoint:shutdown_requested] {"activeSocketCount":4}
[2026-03-18T23:41:37.486Z] [checkpoint:server_shutdown_complete]
```

## Blocker Findings

| Code | Blocker | Severity | Message |
|------|---------|----------|---------|
| PACKAGED_EXTENSION_ENTRY_FAILED | yes | critical | Packaged DB 管理 entry was blocked during the smoke-only real entry flow. |