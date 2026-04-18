# Release-Exit Checklist

This document defines the canonical publish-or-block checklist for the DB Workbench release candidate.

The release-exit checklist is not a narrative reminder. It is a typed artifact emitted by `npm run verify:desktop:ship-gate` and stored under `artifacts/release-verification/`.

## Required evidence

The current release-exit gate requires four evidence classes:

1. packaged smoke for the current packaged Tauri executable
2. live MySQL verification
3. live PostgreSQL verification
4. late hardening proof from Phase 31 verification

These are emitted or read from:

- packaged smoke:
  - `npm run verify:desktop:smoke:packaged`
- live verification:
  - `npm run verify:desktop:live -- --driver=mysql --connection-name="..."`
  - `npm run verify:desktop:live -- --driver=postgres --connection-name="..."`
  - if no saved connection exists, add `--connection-string="..."` to bootstrap a deterministic temporary verification connection from the same importer formats supported by Connection Center
- late hardening proof:
  - `.planning/phases/31-db-workbench-runtime-and-sync-hardening/31-VERIFICATION.md`

## Canonical command order

Run these in order:

```powershell
npm run verify:desktop:preflight
npm run verify:desktop:smoke:packaged
npm run verify:desktop:live -- --driver=mysql --connection-name="local mysql"
npm run verify:desktop:live -- --driver=postgres --connection-name="local postgres"
npm run verify:desktop:ship-gate
```

Why this order matters:

- preflight confirms the verification seam still exists
- packaged smoke defines the current installer candidate
- live verification must be newer than that packaged smoke run
- ship gate aggregates everything into one release-exit decision

## Ship blockers

The release-exit checklist blocks publishability when any required evidence is:

- missing
- failed
- stale relative to the current packaged smoke artifact

Typical blocker codes include:

- `PACKAGED_SMOKE_MISSING`
- `PACKAGED_SMOKE_FAILED`
- `PACKAGED_SMOKE_STALE`
- `MYSQL_LIVE_VERIFICATION_MISSING`
- `MYSQL_LIVE_VERIFICATION_FAILED`
- `MYSQL_LIVE_VERIFICATION_STALE`
- `POSTGRES_LIVE_VERIFICATION_MISSING`
- `POSTGRES_LIVE_VERIFICATION_FAILED`
- `POSTGRES_LIVE_VERIFICATION_STALE`
- `LATE_HARDENING_PROOF_MISSING`
- `LATE_HARDENING_PROOF_NOT_PASSED`
- `LATE_HARDENING_PROOF_STALE`

## Post-release backlog

The release-exit checklist also keeps explicit non-blocking backlog items so they do not get blurred into ship blockers.

Current post-release backlog:

- `Data Sync / Job Center` still need dedicated runtime proof before promotion beyond `Preview`

## Artifact outputs

The ship gate writes:

- `release-exit-checklist-*.json`
- `release-exit-checklist-*.md`
- `ship-gate-*.json`

Use the checklist Markdown for human review and the JSON artifacts for regression tests or automation.
