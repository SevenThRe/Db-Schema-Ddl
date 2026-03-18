# Desktop Packaged Smoke Run desktop-smoke-packaged-nsis-2026-03-18T15-18-08-264Z

- Run mode: packaged-nsis
- Installer artifact: C:\Users\ISI202502\Downloads\Db-Schema-Ddl\dist-electron\DBSchemaExcel2DDL-Setup-1.1.4.exe
- Install directory: C:\Program Files\DBSchemaExcel2DDL
- Semi-manual: True
- Started at: 2026-03-18T15:18:08.2682402Z
- Finished at: 2026-03-18T15:18:08.3055033Z
- artifactJsonPath: C:\Users\ISI202502\Downloads\Db-Schema-Ddl\artifacts\desktop-smoke\desktop-smoke-packaged-nsis-2026-03-18T15-18-08-264Z.json
- artifactMarkdownPath: C:\Users\ISI202502\Downloads\Db-Schema-Ddl\artifacts\desktop-smoke\desktop-smoke-packaged-nsis-2026-03-18T15-18-08-264Z.md

## Evidence References

- [installer] C:\Users\ISI202502\Downloads\Db-Schema-Ddl\dist-electron\DBSchemaExcel2DDL-Setup-1.1.4.exe :: Resolved NSIS installer artifact.
- [install-directory] C:\Program Files\DBSchemaExcel2DDL :: Expected install directory. Existing NSIS config may reuse a sticky prior path.
- [installed-executable] C:\Program Files\DBSchemaExcel2DDL\DBSchemaExcel2DDL.exe :: Expected installed app path for first-launch evidence.
- [manual-step] C:\Users\ISI202502\Downloads\Db-Schema-Ddl\artifacts\desktop-smoke\desktop-smoke-packaged-nsis-2026-03-18T15-18-08-264Z.md :: Semi-manual run: attach screenshots, log excerpts, and operator notes without changing the artifact/report structure.

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

## Manual Evidence

- Semi-manual on 2026-03-19: installer UI and first-launch steps require operator confirmation on this machine.
