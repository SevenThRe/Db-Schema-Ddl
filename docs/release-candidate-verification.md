# Release Candidate Verification

Phase 26 defines one Tauri-native verification flow for the DB workbench release candidate.

The release candidate gate is product-aware:

- `Connection Center` is a `Primary Support` surface
- `SQL Daily Driver` is the main `Primary` surface
- `Data Sync / Job Center` remain `Preview` and are not allowed to silently inherit `Primary` claims

## 1. Preflight

```powershell
npm run verify:desktop:preflight
```

This checks that the repo still exposes:

- Tauri verification scripts
- smoke checkpoint command wiring
- dashboard/workbench smoke entry hooks
- NSIS bundle configuration

## 2. Packaged Smoke

```powershell
npm run verify:desktop:smoke:packaged
```

This launches the current Tauri release executable and captures packaged checkpoint evidence.

## 3. Live DB Verification

Run once per driver.

MySQL example:

```powershell
npm run verify:desktop:live -- --driver=mysql --connection="local mysql" --database=app --flow=connect:passed --flow=query:passed --flow=paging:passed --flow=export:passed --flow=cancel:passed --flow=edit:passed --flow=readonly:passed --flow=inspection:passed
```

PostgreSQL example:

```powershell
npm run verify:desktop:live -- --driver=postgres --connection="local postgres" --database=app --flow=connect:passed --flow=query:passed --flow=paging:passed --flow=export:passed --flow=cancel:passed --flow=edit:passed --flow=readonly:passed --flow=inspection:passed
```

Every required flow must be explicit:

- `connect`
- `query`
- `paging`
- `export`
- `cancel`
- `edit`
- `readonly`
- `inspection`

## 4. Ship Gate

```powershell
npm run verify:desktop:ship-gate
```

The ship gate blocks release when any of the following is missing or failing:

- packaged smoke artifact
- MySQL live verification artifact
- PostgreSQL live verification artifact

Warnings remain visible, but blockers keep the decision at `blocked`.

## 5. Primary Surface Gate Matrix

### Connection Center (`Primary Support`)

- required evidence:
  - `npm run check`
  - `test/client/db-workbench-flow-phase24.test.ts`
  - `test/client/db-connection-platform-phase22.test.ts`
  - `npm run verify:desktop:preflight`
- what this protects:
  - canonical DB entry routing
  - smoke checkpoint wiring
  - honest connection support scope

### SQL Daily Driver (`Primary`)

- required evidence:
  - `npm run check`
  - `test/client/db-workbench-sql-library-phase16.test.ts`
  - `test/client/db-workbench-sql-script-review-phase18.test.ts`
  - `test/client/db-workbench-runtime-phase15.test.tsx`
  - `test/client/db-workbench-runtime-phase19.test.ts`
  - `test/client/db-workbench-runtime-phase26.test.ts`
  - MySQL live verification artifact with `connect/query/paging/export/cancel/edit/readonly/inspection`
  - PostgreSQL live verification artifact with `connect/query/paging/export/cancel/edit/readonly/inspection`
- what this protects:
  - connection-scoped SQL session recovery
  - script/parameter/dangerous-SQL review path
  - honest paging/export/cancel behavior
  - stale-response protection

### Result Guardrails And Inspection (`Primary`)

- required evidence:
  - `npm run check`
  - `cargo check`
  - `test/server/release-verification-phase26.test.ts`
  - live verification evidence for `edit`, `readonly`, and `inspection`
- what this protects:
  - review-only edit safety
  - inspection reachability
  - release-gate artifact evaluation

## 6. Preview Promotion Rule

`Data Sync / Job Center` stay `Preview` until the release process gains real runtime proof for:

- compare preview -> apply preview -> execute
- persisted job reopen and audit review
- blocker handling for readonly, snapshot drift, and unsafe delete confirmation

Until that proof exists, release notes and in-product labeling must keep the preview language explicit.
