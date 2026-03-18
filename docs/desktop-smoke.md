# Desktop Smoke Checklist

`v1.3 / Phase 1` introduces a repeatable desktop smoke seam focused on the runtime paths that recently regressed.

## Goals

- Prove Electron startup is stable
- Prove Electron shutdown is calm and logged
- Prove SQLite init/migration runs without compatibility failures
- Prove extension entry/catalog behavior is understandable
- Prove at least one real MySQL DB-management read path works

## Required Steps

1. **应用启动**
   - Run the Electron desktop app
   - Confirm the main window opens
   - Confirm there is no raw startup JavaScript error dialog

2. **SQLite 初始化与迁移**
   - Confirm local SQLite init succeeds
   - Confirm compatibility columns and migrations apply cleanly
   - Check the runtime log for startup checkpoint lines

3. **扩展入口检查**
   - Open the DB 管理 entry
   - Confirm catalog lookup behavior is understandable
   - If official extension assets are unavailable, confirm the UI shows the translated friendly fallback

4. **MySQL 读取链路**
   - Use one reachable real MySQL environment
   - Confirm connection, database selection, and one schema/introspection read path succeeds

5. **应用关闭**
   - Exit the application
   - Confirm no multi-dialog raw JS error spam appears during close
   - Confirm shutdown checkpoint lines exist in the runtime log

## Evidence Format

Produce both:

- JSON artifact
- Markdown summary

Use:

```powershell
npm run smoke:desktop
```

This command writes a structured smoke template under:

```text
artifacts/desktop-smoke/
```

Fill the generated artifact with the actual run details, especially:

- app version
- actual log path
- step statuses
- notable diagnostics

## Expected Log Evidence

The runtime log should include checkpoint-style entries such as:

- `server_bootstrap_started`
- `server_bootstrap_ready`
- `browser_window_creating`
- `browser_window_loaded`
- `shutdown_requested`
- `server_shutdown_complete`

## Notes

- This smoke seam is intentionally lightweight and Windows-first.
- It is acceptable for the first version to be manual or semi-manual as long as the evidence is structured and reusable.
