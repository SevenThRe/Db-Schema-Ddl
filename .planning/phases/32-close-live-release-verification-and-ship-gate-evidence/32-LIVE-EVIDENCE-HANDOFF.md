# Phase 32 Live Evidence Handoff

This handoff turns the remaining `v1.8` release blocker into one operator-ready checklist.

Phase 32 implementation is already landed. The remaining work is not more release-gate code. The remaining work is to capture current passing live verification artifacts for both supported drivers and rerun the ship gate against the same packaged installer candidate.

## Current Blocked State

As of 2026-04-18, the latest release-exit review is still blocked by these artifacts:

- [release-exit-checklist-2026-04-17T02-31-58-811Z.md](/E:/work/Db-Schema-Ddl/artifacts/release-verification/release-exit-checklist-2026-04-17T02-31-58-811Z.md)
- [ship-gate-2026-04-17T02-31-58-811Z.json](/E:/work/Db-Schema-Ddl/artifacts/release-verification/ship-gate-2026-04-17T02-31-58-811Z.json)

Current blocker codes:

- `MYSQL_LIVE_VERIFICATION_FAILED`
- `POSTGRES_LIVE_VERIFICATION_MISSING`

Current MySQL failure detail from [workbench-live-mysql-2026-04-17T02-31-17-971Z.md](/E:/work/Db-Schema-Ddl/artifacts/release-verification/workbench-live-mysql-2026-04-17T02-31-17-971Z.md):

- `connect` failed with `MySQL 连接失败: pool timed out while waiting for an open connection`
- all later flows were skipped because verification stopped before a working connection existed

## What Must Exist Before Re-Running

1. One current packaged smoke artifact for the installer candidate being reviewed.
2. One reachable MySQL database that is safe to use for verification flows.
3. One reachable PostgreSQL database that is safe to use for verification flows.
4. Connection details for both drivers, either:
   - an existing saved connection inside the app, or
   - a bootstrap connection string passed to the live verifier
5. Databases that can honestly exercise:
   - `connect`
   - `query`
   - `paging`
   - `export`
   - `cancel`
   - `edit`
   - `readonly`
   - `inspection`

## Canonical Command Order

Run these in order from the repo root:

```powershell
npm run verify:desktop:preflight
npm run verify:desktop:smoke:packaged
npm run verify:desktop:live:prereq -- --driver=mysql --connection-string="mysql://USER:PASSWORD@HOST:3306/DB"
npm run verify:desktop:live -- --driver=mysql --connection-string="mysql://USER:PASSWORD@HOST:3306/DB"
npm run verify:desktop:live:prereq -- --driver=postgres --connection-string="postgres://USER:PASSWORD@HOST:5432/DB"
npm run verify:desktop:live -- --driver=postgres --connection-string="postgres://USER:PASSWORD@HOST:5432/DB"
npm run verify:desktop:ship-gate
```

If saved connections already exist on the verification machine, `--connection-id=...` is preferred and `--connection-name="..."` is acceptable.

The prereq probe is optional but recommended whenever the live run uses bootstrap connection strings or a newly provisioned environment. It emits `workbench-live-prereq-*.json/.md` artifacts, which are diagnostic handoff only and are not treated as live release evidence by the ship gate.

Automation note:

- `verify:desktop:live:prereq` now exits non-zero for real prereq failures
- advisory warning-only results such as saved-connection selectors still exit zero because they are not definitive failures before app runtime

Useful optional flags:

- `--readonly`
- `--default-schema=...`

## Success Criteria

The release blocker is cleared only when all of these are true:

1. The latest MySQL live artifact reports `Overall status: passed`.
2. The latest PostgreSQL live artifact reports `Overall status: passed`.
3. Both artifacts contain explicit evidence for the required flows rather than skipped placeholders.
4. `npm run verify:desktop:ship-gate` emits a new checklist with:
   - `Decision: ready`
   - `Blocked: false`
   - no `Ship blockers`

## Review Targets After Re-Run

After a fresh run, review these newest artifacts under `artifacts/release-verification/`:

- `workbench-live-mysql-*.md`
- `workbench-live-postgres-*.md`
- `release-exit-checklist-*.md`
- `ship-gate-*.json`

## Fast Failure Interpretation

Use these heuristics before retrying blindly:

- MySQL or PostgreSQL `connect` fails:
  - verify host, port, credentials, and database name in the connection string
  - confirm the DB server is listening from the verification machine
  - confirm the target user is allowed to open pooled connections
- `readonly` or `edit` fails:
  - verify the chosen database is appropriate for mutation-proof and readonly checks
  - do not reuse a production-only readonly endpoint for the mutable verification run
- `inspection` fails:
  - verify the selected schema actually contains introspectable objects
- Ship gate still says `stale`:
  - rerun packaged smoke first so all evidence is tied to the same installer candidate

## Next Human or Automation Action

The next meaningful release step is not another local feature phase. It is:

1. provision or identify one reachable MySQL verification target
2. provision or identify one reachable PostgreSQL verification target
3. capture fresh passing live artifacts for both
4. rerun the ship gate

Until that happens, `v1.8` remains blocked by external live DB evidence.
