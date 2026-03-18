---
phase: 02-packaged-build-smoke-v1_3
slug: packaged-build-smoke-v1_3
status: planned
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
updated: 2026-03-18
---

# Phase 2 - Validation Strategy

> Per-phase validation contract for proving packaged Windows builds can be smoke-tested with structured evidence and explicit blocker policy.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node test + tsx + npm scripts |
| **Config file** | none - existing package scripts |
| **Quick run command** | `npm run check` |
| **Focused commands** | packaged-smoke unit tests plus focused script/helper tests |
| **Full suite command** | `npm test` |
| **Packaged build command** | `npm run build:electron` |
| **Estimated runtime** | ~180-300 seconds plus optional manual installer smoke |

---

## Sampling Rate

- **After shared artifact/helper tasks:** Run focused packaged-smoke tests
- **After win-unpacked helper wave:** Run focused runner/helper tests and `npm run build:electron`
- **After installer/helper wave:** Run focused installer-path tests and targeted packaged smoke template generation
- **Before phase close:** Run `npm run check`, `npm test`, `npm run build:electron`, and at least one structured packaged smoke evidence pass

---

## Validation Architecture

Phase 2 needs validation in five layers:

1. **Packaged artifact validation**
   - packaged smoke artifacts stay schema-backed, stable, and MCP-friendly
2. **Runner/helper validation**
   - `win-unpacked` and installer helper logic classify blockers/warnings predictably
3. **Build validation**
   - packaged build scripts still produce a runnable Windows deliverable
4. **Evidence validation**
   - Markdown and JSON reports point at the same screenshots/log excerpts/blocker findings
5. **Packaged smoke validation**
   - at least one repeatable packaged run path exists with concrete evidence expectations

---

## Wave 0 Test Targets

| Area | Expected coverage |
|------|-------------------|
| Shared contracts | packaged run modes, screenshot/log evidence refs, and blocker findings remain typed and stable |
| Win-unpacked helper | path resolution, readiness/checkpoint handling, and blocker classification behave deterministically |
| Installer helper | installer-path evidence model and blocker policy stay explicit |
| Report generation | Markdown and JSON outputs reference the same packaged run |

---

## Exit Conditions

- [ ] `npm run check`
- [ ] Focused packaged-smoke phase tests green
- [ ] `npm test`
- [ ] `npm run build:electron`
- [ ] one packaged smoke evidence path exists for `win-unpacked`
- [ ] installer-path coverage is either evidenced or explicitly marked manual-only

---

## Manual-Only Coverage

- NSIS install/uninstall proof may remain semi-manual, but its evidence must still be captured in the same structured artifact family.

---

## Phase-Close Execution Order

Run the packaged validation in this order when closing Phase 2:

1. `npm run check`
2. `npm test`
3. `npm run build:electron`
4. `npm run smoke:packaged`
5. `powershell -ExecutionPolicy Bypass -File .\script\desktop-packaged-smoke-installer.ps1 -SemiManual`

If the current machine can complete the NSIS UI end to end, replace `-SemiManual` with a normal run and attach the resulting evidence references. If elevation, local policy, or sticky installer state blocks full automation, the installer run may stay manual-only, but that status must be written explicitly into both the generated artifact and the phase-close summary.

---

## Evidence Contract

Phase 2 closes only when `artifacts/desktop-smoke/` contains reviewable packaged evidence for the current validation pass.

Required evidence for `win-unpacked`:

- JSON artifact written by `npm run smoke:packaged`
- Markdown summary written beside the JSON artifact
- screenshots captured from the packaged app when the main window is ready
- log excerpts showing readiness checkpoints and close behavior

Required evidence for `NSIS`:

- JSON artifact written by `script/desktop-packaged-smoke-installer.ps1`
- Markdown summary written beside the JSON artifact
- installer UI screenshot
- first-launch screenshot
- packaged log excerpts or an explicit note naming the missing log and why it could not be attached
- operator note stating whether the run was semi-manual

---

## Blocker Classification Review

Treat these packaged outcomes as release blockers for phase-close validation:

- startup failure
- native module load failure
- migration failure
- raw close error spam or unclean close
- extension catalog failure that exposes raw transport or IPC text
- `DB 管理` entry failure

Treat these as warnings only when the main packaged flow is otherwise healthy:

- optional real MySQL read was skipped
- NSIS evidence is still semi-manual but the missing screenshots or notes are called out explicitly
- minor visual rough edges that do not block startup, `DB 管理`, or clean close

---

## Review Checklist

Before declaring the phase complete, review the latest files under `artifacts/desktop-smoke/` and confirm:

- the latest `win-unpacked` artifact pair references the same screenshots and log excerpts
- the latest `NSIS` artifact pair names the installer artifact path, install directory, and manual-only status if applicable
- blocker findings and warning findings match the packaged release policy
- no packaged gap is left implicit or "to be remembered later"
