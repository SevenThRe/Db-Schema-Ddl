# Desktop Smoke Run desktop-smoke-packaged-win-unpacked-2026-03-18T15-15-45-672Z

- Generated at: 2026-03-18T15:15:45.672Z
- App version: packaged-smoke
- Environment: packaged-electron
- Run mode: packaged-win-unpacked
- Log path: C:\Users\ISI202502\Downloads\Db-Schema-Ddl\artifacts\desktop-smoke\desktop-smoke-packaged-win-unpacked-2026-03-18T15-15-45-672Z.bootstrap.log
- Executable path: C:\Users\ISI202502\Downloads\Db-Schema-Ddl\dist-electron\win-unpacked\DBSchemaExcel2DDL.exe
- Overall status: failed

## Steps

| Step | Status | Detail |
|------|--------|--------|
| 应用启动 | failed | Packaged readiness failed: Timed out waiting for checkpoints: server_bootstrap_ready, browser_window_loaded |
| SQLite 初始化与迁移 | skipped | 确认本地数据库初始化成功，兼容列和迁移能正常执行。 |
| 扩展入口检查 | skipped | 确认 DB 管理入口、catalog 检查和未发布提示表现正常。 |
| MySQL 读取链路 | skipped | 确认至少一条真实 MySQL 连接、database 选择和 schema 读取链路可用。 |
| 应用关闭 | failed | Packaged shutdown failed: Timed out waiting for packaged app to exit after smoke-mode auto-close. |

## Log Excerpt

- Source: C:\Users\ISI202502\Downloads\Db-Schema-Ddl\artifacts\desktop-smoke\desktop-smoke-packaged-win-unpacked-2026-03-18T15-15-45-672Z.bootstrap.log
- Lines: 1-8

```text
[2026-03-18T15:15:46.439Z] [checkpoint:server_bootstrap_started] {"startPort":5000}
[2026-03-18T15:15:47.771Z] [checkpoint:server_bootstrap_ready] {"port":5000}
[2026-03-18T15:15:47.772Z] [checkpoint:browser_window_creating]
[2026-03-18T15:15:48.289Z] [checkpoint:browser_window_loaded] {"port":5000}
[2026-03-18T15:15:48.743Z] [checkpoint:smoke_screenshot_written] {"path":"C:\\Users\\ISI202502\\Downloads\\Db-Schema-Ddl\\artifacts\\desktop-smoke\\desktop-smoke-packaged-win-unpacked-2026-03-18T15-15-45-672Z.png"}
[2026-03-18T15:15:50.256Z] [checkpoint:smoke_auto_close_requested] {"delayMs":1500}
[2026-03-18T15:15:50.256Z] [checkpoint:shutdown_requested] {"activeSocketCount":7}
[2026-03-18T15:15:50.266Z] [checkpoint:server_shutdown_complete]
```

## Blocker Findings

| Code | Blocker | Severity | Message |
|------|---------|----------|---------|
| PACKAGED_READINESS_FAILED | yes | critical | Packaged readiness failed: Timed out waiting for checkpoints: server_bootstrap_ready, browser_window_loaded |
| PACKAGED_SHUTDOWN_FAILED | yes | critical | Packaged shutdown failed: Timed out waiting for packaged app to exit after smoke-mode auto-close. |