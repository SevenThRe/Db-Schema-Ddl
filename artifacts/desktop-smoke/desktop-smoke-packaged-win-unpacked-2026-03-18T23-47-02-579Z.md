# Desktop Smoke Run desktop-smoke-packaged-win-unpacked-2026-03-18T23-47-02-579Z

- Generated at: 2026-03-18T23:47:02.579Z
- App version: packaged-smoke
- Environment: packaged-electron
- Run mode: packaged-win-unpacked
- Log path: C:\Users\ISI202502\Downloads\Db-Schema-Ddl\artifacts\desktop-smoke\desktop-smoke-packaged-win-unpacked-2026-03-18T23-47-02-579Z.bootstrap.log
- Executable path: C:\Users\ISI202502\Downloads\Db-Schema-Ddl\dist-electron\win-unpacked\DBSchemaExcel2DDL.exe
- Overall status: warning

## Steps

| Step | Status | Detail |
|------|--------|--------|
| 应用启动 | passed | Observed checkpoints: server_bootstrap_started, server_bootstrap_ready, smoke_sqlite_init_ready, browser_window_creating, browser_window_loaded, smoke_db_management_entry_requested, smoke_db_management_ready, smoke_screenshot_written |
| SQLite 初始化与迁移 | passed | Observed packaged SQLite initialization and migration readiness checkpoint. |
| 扩展入口检查 | passed | Observed the packaged DB 管理 entry flow reaching the real workspace path. |
| MySQL 读取链路 | warning | Live MySQL proof remains optional for packaged smoke and was not required in this run. |
| 应用关闭 | passed | Packaged app exited cleanly after the smoke-mode DB 管理 proof path. |

## Screenshots

- C:\Users\ISI202502\Downloads\Db-Schema-Ddl\artifacts\desktop-smoke\desktop-smoke-packaged-win-unpacked-2026-03-18T23-47-02-579Z.png

## Log Excerpt

- Source: C:\Users\ISI202502\Downloads\Db-Schema-Ddl\artifacts\desktop-smoke\desktop-smoke-packaged-win-unpacked-2026-03-18T23-47-02-579Z.bootstrap.log
- Lines: 1-11

```text
[2026-03-18T23:47:03.203Z] [checkpoint:server_bootstrap_started] {"startPort":5000}
[2026-03-18T23:47:04.401Z] [checkpoint:server_bootstrap_ready] {"port":5000}
[2026-03-18T23:47:04.402Z] [checkpoint:smoke_sqlite_init_ready] {"port":5000,"dbPath":"C:\\Users\\ISI202502\\AppData\\Roaming\\db-schema-excel-2-ddl\\data"}
[2026-03-18T23:47:04.402Z] [checkpoint:browser_window_creating]
[2026-03-18T23:47:04.793Z] [checkpoint:browser_window_loaded] {"port":5000}
[2026-03-18T23:47:04.930Z] [checkpoint:smoke_db_management_entry_requested]
[2026-03-18T23:47:04.954Z] [checkpoint:smoke_db_management_ready]
[2026-03-18T23:47:05.085Z] [checkpoint:smoke_screenshot_written] {"path":"C:\\Users\\ISI202502\\Downloads\\Db-Schema-Ddl\\artifacts\\desktop-smoke\\desktop-smoke-packaged-win-unpacked-2026-03-18T23-47-02-579Z.png"}
[2026-03-18T23:47:06.457Z] [checkpoint:smoke_auto_close_requested] {"delayMs":1500,"reason":"db-management-ready"}
[2026-03-18T23:47:06.457Z] [checkpoint:shutdown_requested] {"activeSocketCount":7}
[2026-03-18T23:47:06.459Z] [checkpoint:server_shutdown_complete]
```