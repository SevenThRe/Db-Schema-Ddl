# Release Candidate Verification

Phase 26 introduced the Tauri-native verification seam. Phase 32 closes the release-exit gap by making one checklist the canonical publish-or-block decision input.

Use `docs/db-workbench-operator-journey.md` as the journey anchor for this release flow. The gate protects one modern operator path through the extension shell, not a disconnected list of legacy surfaces.

The release candidate gate is product-aware:

- `Connection Center` is a `Primary Support` surface
- `SQL Daily Driver` is the main `Primary` surface
- compatibility-only schema browse / diff paths are not part of the primary publish claim
- `Data Sync` remains `Preview`
- `Job Center` is a shipped audit/support surface, not a second primary route

The canonical maintainer sequence is now:

1. preflight
2. packaged smoke
3. live verification per driver
4. ship gate
5. review the generated release-exit checklist

That sequence should always be interpreted through the canonical operator journey:

`Connection Center -> Database Workspace -> inspect/query -> guarded edit/apply -> audit`

## 1. Preflight

```powershell
npm run verify:desktop:preflight
```

This confirms the repo still exposes the current release-verification seam:

- package scripts for preflight / smoke / live / ship gate
- Tauri smoke checkpoint command wiring
- dashboard and DB Workbench checkpoint emitters
- NSIS bundle configuration

## 2. Packaged Smoke

```powershell
npm run verify:desktop:smoke:packaged
```

This launches the current packaged Tauri executable, captures real checkpoints, and writes the packaged smoke artifact under `artifacts/release-verification/`.

Packaged smoke is the anchor artifact for the current installer candidate. Other evidence is treated as stale when it predates this packaged smoke run.

## 3. Optional Live Prereq Probe

If you are using a bootstrap connection string or are unsure whether the target host and port are even reachable from the verification machine, run the prereq probe first:

```powershell
npm run verify:desktop:live:prereq -- --driver=mysql --connection-string="mysql://root:secret@127.0.0.1:3306/app"
```

or:

```powershell
npm run verify:desktop:live:prereq -- --driver=postgres --connection-string="postgres://app:secret@127.0.0.1:5432/workbench"
```

This prereq mode:

- resolves the bootstrap connection using the same importer-style parsing rules accepted by Connection Center
- probes TCP reachability when host and port can be resolved ahead of app runtime
- emits prereq Markdown/JSON artifacts under `artifacts/release-verification/`
- does **not** count as live release evidence for the ship gate

Exit behavior:

- returns non-zero when the prereq result is truly `failed` such as parse failure or TCP reachability failure
- stays zero for advisory-only `warning` results such as saved-connection selectors that cannot be fully inspected outside app runtime

If you only provide `--connection-id` or `--connection-name`, the prereq probe stays advisory and warns that saved-connection reachability cannot be fully checked before the app runtime starts.

## 4. Live DB Verification

Run once per driver against a connection that the packaged candidate is supposed to support.

MySQL example:

```powershell
npm run verify:desktop:live -- --driver=mysql --connection-name="local mysql"
```

PostgreSQL example:

```powershell
npm run verify:desktop:live -- --driver=postgres --connection-name="local postgres"
```

If the connection id is known, `--connection-id=...` is preferred. `--connection=...` is accepted as a compatibility alias for `--connection-name=...`.

If no saved connection exists on the verification machine, the live runner can now bootstrap a deterministic temporary verification connection from the same importer formats accepted by Connection Center paste-import:

```powershell
npm run verify:desktop:live -- --driver=mysql --connection-name="ci mysql" --connection-string="mysql://root:secret@127.0.0.1:3306/app"
```

Optional bootstrap flags:

- `--readonly`
- `--default-schema=...`

The bootstrap path still uses the real saved-connection runtime seam inside the app; it only removes the manual pre-save requirement from the verification operator workflow.

Every live artifact must cover the same required flow set:

- `connect`
- `query`
- `paging`
- `export`
- `cancel`
- `edit`
- `readonly`
- `inspection`

The live runner records these flows from the real app runtime. The docs should not be updated to a manual `--flow=` shape unless the script itself changes to match.

## 5. Late Hardening Proof

Release exit also requires the current late-hardening verification record:

- `.planning/phases/31-db-workbench-runtime-and-sync-hardening/31-VERIFICATION.md`

That record must exist and remain `status: passed`. If packaged smoke for the current installer is newer than the hardening verification record, the release-exit checklist will classify the hardening proof as stale.

## 6. Ship Gate

```powershell
npm run verify:desktop:ship-gate
```

The ship gate now writes:

- `release-exit-checklist-*.json`
- `release-exit-checklist-*.md`
- `ship-gate-*.json`

under:

```text
artifacts/release-verification/
```

The ship gate blocks release when required proof is:

- missing
- failed
- stale for the current packaged installer candidate

## 7. Release-Exit Checklist Review

Use the generated checklist as the human-readable source of truth:

- `## Required evidence` shows the status of packaged smoke, MySQL live verification, PostgreSQL live verification, and late hardening proof
- `## Ship blockers` lists the exact blocking codes and messages
- `## Post-release backlog` names items that stay outside the current publish gate

See:

- `docs/release-exit-checklist.md`
- `docs/db-workbench-operator-journey.md`

## 8. Primary Surface Gate Matrix

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
  - late hardening proof from Phase 31
  - live verification evidence for `edit`, `readonly`, and `inspection`
- what this protects:
  - review-only edit safety
  - inspection reachability
  - release-gate artifact evaluation

## 9. Preview Promotion Rule

`Data Sync` stays `Preview` until the release process gains real runtime proof for:

- compare preview -> apply preview -> execute
- persisted job reopen and audit review for sync-related work
- blocker handling for readonly, snapshot drift, and unsafe delete confirmation

Until that proof exists, release notes and in-product labeling must keep the preview language explicit for `Data Sync`.
