# Release Exit Checklist

- Run id: release-exit-checklist-2026-04-17T02-31-58-811Z
- Generated at: 2026-04-17T02:31:58.811Z
- Installer path: E:\work\Db-Schema-Ddl\src-tauri\target\release\db-schema-ddl-tauri.exe
- Installer mtime: 2026-04-12T06:29:15.368Z
- Decision: blocked
- Blocked: true

## Required evidence

| Evidence | Status | Generated at | Artifact | Notes |
|----------|--------|--------------|----------|-------|
| Packaged smoke | current | 2026-04-12T06:30:19.330Z | E:\work\Db-Schema-Ddl\artifacts\release-verification\tauri-packaged-smoke-2026-04-12T06-30-19-330Z.json |  |
| MySQL live verification | failed | 2026-04-17T02:31:17.971Z | E:\work\Db-Schema-Ddl\artifacts\release-verification\workbench-live-mysql-2026-04-17T02-31-17-971Z.json | Live verification stopped before query flows because the connection could not be established. |
| PostgreSQL live verification | missing |  |  | Run `npm run verify:desktop:live -- --driver=postgres` for the current installer candidate. |
| Late hardening proof | current | 2026-04-15 | E:\work\Db-Schema-Ddl\.planning\phases\31-db-workbench-runtime-and-sync-hardening\31-VERIFICATION.md | 31-db-workbench-runtime-and-sync-hardening status: passed |

## Ship blockers

- MYSQL_LIVE_VERIFICATION_FAILED: MySQL live verification contains failed flows.
- POSTGRES_LIVE_VERIFICATION_MISSING: Missing PostgreSQL live verification artifact.

## Post-release backlog

- Data Sync / Job Center still need dedicated runtime proof before promotion beyond Preview.