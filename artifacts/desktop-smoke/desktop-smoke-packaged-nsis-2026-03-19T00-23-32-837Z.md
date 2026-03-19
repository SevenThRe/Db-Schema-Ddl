# Desktop Packaged Smoke Run desktop-smoke-packaged-nsis-2026-03-19T00-23-32-837Z

- Run mode: packaged-nsis
- Installer artifact: C:\Users\ISI202502\Downloads\Db-Schema-Ddl\dist-electron\DBSchemaExcel2DDL-Setup-1.1.4.exe
- Install directory: E:\Tools\DBSchemaExcel2DDL
- Semi-manual: True
- Proof status: failed
- Started at: 2026-03-19T00:23:32.8416245Z
- Finished at: 2026-03-19T00:23:32.9084179Z
- artifactJsonPath: C:\Users\ISI202502\Downloads\Db-Schema-Ddl\artifacts\desktop-smoke\desktop-smoke-packaged-nsis-2026-03-19T00-23-32-837Z.json
- artifactMarkdownPath: C:\Users\ISI202502\Downloads\Db-Schema-Ddl\artifacts\desktop-smoke\desktop-smoke-packaged-nsis-2026-03-19T00-23-32-837Z.md

## Step Results

- install: pass :: User-confirmed NSIS install completed successfully to E:\Tools\DBSchemaExcel2DDL. :: required evidence = installer, installer-ui-screenshot
- first-launch: pass :: User-confirmed first launch succeeded from the installed app before attempting DB 管理. :: required evidence = installed-executable, first-launch-screenshot
- db-entry: fail :: DB 管理 failed: SqliteError: no such table: extension_lifecycle_states :: required evidence = first-launch-screenshot, packaged-log
- close: pass :: User-confirmed the installed app closed cleanly after the DB 管理 failure. :: required evidence = packaged-log

## Evidence References

- [installer] C:\Users\ISI202502\Downloads\Db-Schema-Ddl\dist-electron\DBSchemaExcel2DDL-Setup-1.1.4.exe :: Resolved NSIS installer artifact.
- [install-directory] E:\Tools\DBSchemaExcel2DDL :: Expected install directory. Existing NSIS config may reuse a sticky prior path.
- [installed-executable] E:\Tools\DBSchemaExcel2DDL\DBSchemaExcel2DDL.exe :: Expected installed app path for first-launch evidence.
- [packaged-log] C:\Users\ISI202502\AppData\Roaming\db-schema-excel-2-ddl\logs\dbschemaexcel2ddl-bootstrap.log :: Packaged log excerpt or path captured from the same installer run.
- [manual-step] C:\Users\ISI202502\Downloads\Db-Schema-Ddl\artifacts\desktop-smoke\desktop-smoke-packaged-nsis-2026-03-19T00-23-32-837Z.md :: Semi-manual run: attach screenshots, log excerpts, and operator notes without changing the artifact/report structure.

## Release Blocker Policy

- release blocker: STARTUP_FAILURE - Packaged startup failure or first window never becomes interactive.
- release blocker: NATIVE_MODULE_LOAD_FAILURE - better-sqlite3 or another native module fails to load.
- release blocker: MIGRATION_FAILURE - SQLite init or migration fails during first launch.
- release blocker: RAW_CLOSE_ERROR - Close flow shows raw JavaScript error spam or exits uncleanly.
- release blocker: CATALOG_FAILURE - Extension catalog flow exposes raw transport or IPC errors to the user.
- release blocker: DB_ENTRY_FAILURE - DB 邂｡逅・main entry does not open.

## Warning Policy

- warning: MYSQL_CHECK_SKIPPED - A given packaged smoke run skipped the optional real MySQL read path.
- warning: MANUAL_EVIDENCE_PENDING - Semi-manual proof still needs screenshots or notes attached before review.

## Findings

- INSTALLER_UI_SCREENSHOT_MISSING | blocker=False | Installer UI screenshot evidence is missing for the NSIS run.
- FIRST_LAUNCH_SCREENSHOT_MISSING | blocker=False | First-launch screenshot evidence is missing for the NSIS run.
- DB_ENTRY_FAILURE | blocker=True | Installer step 'db-entry' failed. Detail: DB 管理 failed: SqliteError: no such table: extension_lifecycle_states

## Manual Evidence

- User provided install=pass, first-launch=pass, db-entry=fail, close=pass from the 2026-03-19 NSIS run.
- Installer UI screenshot path unavailable; evidence intentionally omitted and treated as incomplete proof.
- First-launch screenshot path unavailable; evidence intentionally omitted and treated as incomplete proof.
