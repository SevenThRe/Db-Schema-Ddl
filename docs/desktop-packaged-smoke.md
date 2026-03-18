# Desktop Packaged Smoke Checklist

`v1.3 / Phase 2` extends the desktop smoke seam from development Electron runs to the real packaged Windows deliverables.

## Scope

- `win-unpacked` remains the fast primary path for repeated packaged checks.
- The `NSIS installer` path is still required because it is the real release surface.
- Installer proof may stay `semi-manual`, but it must still emit the same JSON artifact and Markdown summary structure used for packaged review.

## Goals

- Prove the packaged app installs from the NSIS installer.
- Prove the first launch reaches the interactive main window.
- Prove SQLite initialization and migration succeed on the installed build.
- Prove the user can enter `DB 管理`.
- Prove close behavior stays calm and logged.
- Encode packaged release blocker policy as explicit evidence, not tribal knowledge.

## Primary Run Modes

1. `win-unpacked`
   - Use for fast iteration.
   - Reuse the packaged smoke runner from plan `02-02`.
   - Run:

```powershell
npm run smoke:packaged
```

2. `NSIS installer`
   - Use for install -> first launch -> close proof.
   - Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\script\desktop-packaged-smoke-installer.ps1 `
  -SemiManual `
  -InstallerScreenshotPath "C:\evidence\nsis-installer-ui.png" `
  -FirstLaunchScreenshotPath "C:\evidence\nsis-first-launch.png" `
  -PackagedLogPath "C:\Users\<you>\AppData\Roaming\DBSchemaExcel2DDL\logs\main.log" `
  -InstallStatus pending `
  -FirstLaunchStatus pending `
  -DbEntryStatus pending `
  -CloseStatus pending `
  -ManualEvidence "Waiting for operator confirmation of install -> first launch -> `DB 管理` -> close."
```

Add `-InstallerArtifactPath` or `-InstallDirectory` when the defaults are not correct.
Re-run the helper with `pass` or `fail` for each step after the real install path is observed so the artifact does not imply a successful run without proof.

All packaged smoke review artifacts are expected under `artifacts/desktop-smoke/`.

## Required Evidence

Every installer smoke run must produce both:

- `JSON artifact`
- `Markdown summary`

The artifact must capture:

- installer path
- install directory
- started/finished timestamps
- evidence refs for installer UI screenshot, first-launch screenshot, packaged log excerpt, installed executable, and notes
- explicit step results for install, first launch, `DB 管理`, and close
- `proofStatus` showing whether the installer evidence is `complete`, `incomplete`, or `failed`
- blocker findings and warning policy

If the run is semi-manual, attach at least:

- installer UI screenshot
- first-launch screenshot
- packaged log excerpts or a written note explaining why the excerpt could not be captured
- operator note describing what was manually confirmed

For the `win-unpacked` run, keep at least:

- the generated JSON artifact
- the generated Markdown summary
- screenshots written by the packaged smoke runner
- log excerpts showing readiness checkpoints and close behavior

If any screenshot, packaged log excerpt, or step outcome is missing, the helper must leave a warning or blocker finding in the artifact instead of producing blank success metadata.

## Release Blocker Policy

The following failures are `release blocker` conditions for packaged runs:

- startup failure
- native module load failure
- migration failure
- raw close error spam or unclean close
- extension catalog failure that shows raw transport or IPC text
- `DB 管理` entry failure

These are still warnings when the primary packaged flow is otherwise healthy:

- `win-unpacked` succeeded but the optional real MySQL read was skipped
- semi-manual installer proof is waiting on screenshots or written notes
- minor visual rough edges that do not block use of the packaged app

## NSIS Installer Notes

- The repo already customizes `build/installer.nsh`.
- Previous install location reuse and delayed uninstall cleanup mean installer state can stay sticky between runs.
- Review the generated artifact before assuming a path mismatch is a new blocker.

## Review Steps

1. Run `npm run check`, `npm test`, and `npm run build:electron`.
2. Run `npm run smoke:packaged` for fast `win-unpacked` feedback.
3. Run the `NSIS installer` helper.
4. Complete any semi-manual installer UI steps if Windows elevation or local policy blocks full automation.
5. Re-run the helper with the installer UI screenshot, first-launch screenshot, packaged log excerpt path, and explicit `install` / `first launch` / `DB 管理` / `close` statuses.
6. Mark any manual-only installer gap explicitly in the generated artifact instead of leaving it implied.
7. Review blocker findings before calling the packaged build release-ready.
