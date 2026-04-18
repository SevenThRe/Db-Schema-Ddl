# Tauri Packaged Smoke

Phase 26 packaged smoke now targets the current Tauri release executable instead of the removed Electron bundle.

## Goal

Produce one structured packaged artifact that proves:

- the current Tauri release executable launches
- the main window reaches the dashboard
- the DB workbench surface mounts in the live packaged app
- remembered-connection recovery is classified
- the current installer candidate has an anchor artifact for the release-exit checklist

## Command

```powershell
npm run verify:desktop:smoke:packaged
```

The runner resolves the executable from:

```text
src-tauri/target/release/DBTools.exe
```

and launches it with:

- `DBSCHEMA_SMOKE_LOG_PATH`
- `DBSCHEMA_SMOKE_AUTO_OPEN_DB_WORKBENCH=1`

## Output

The run writes:

- a packaged smoke JSON artifact
- a packaged smoke Markdown summary
- a smoke log file with observed checkpoints

under:

```text
artifacts/release-verification/
```

The packaged smoke artifact is the baseline timestamp for release exit. Live driver artifacts and late-hardening proof that predate this packaged smoke run are treated as stale for publishability.

## Blockers

Packaged smoke is blocking when:

- the executable is missing
- required checkpoints never arrive
- the artifact contains failed steps or blocker findings

Warnings are allowed only for non-fatal recovery outcomes or intentionally incomplete live DB proof.

## Release-Exit Relationship

`npm run verify:desktop:ship-gate` consumes the latest packaged smoke artifact as the current installer anchor and emits:

- `release-exit-checklist-*.json`
- `release-exit-checklist-*.md`
- `ship-gate-*.json`

If the executable on disk is newer than the packaged smoke artifact that claims to verify it, the release-exit checklist marks packaged smoke as stale and blocks publishability.
