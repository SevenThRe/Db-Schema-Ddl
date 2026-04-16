# Tauri Packaged Smoke

Phase 26 packaged smoke now targets the current Tauri release executable instead of the removed Electron bundle.

## Goal

Produce one structured packaged artifact that proves:

- the current Tauri release executable launches
- the main window reaches the dashboard
- the DB workbench surface mounts in the live packaged app
- remembered-connection recovery is classified

## Command

```powershell
npm run verify:desktop:smoke:packaged
```

The runner resolves the executable from:

```text
src-tauri/target/release/DBSchemaExcel2DDL.exe
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

## Blockers

Packaged smoke is blocking when:

- the executable is missing
- required checkpoints never arrive
- the artifact contains failed steps or blocker findings

Warnings are allowed only for non-fatal recovery outcomes or intentionally incomplete live DB proof.
