# DB Workbench Operator Journey

This document defines the canonical release-verification journey for the current DB workbench.

## Canonical Journey

`Connection Center -> Database Workspace -> inspect/query -> guarded edit/apply -> audit`

This is the path release verification should protect first. The goal is not to prove every reachable screen in isolation. The goal is to prove that one real operator flow remains coherent across the modern extension-shell route.

## Journey Stages

### 1. Connection Center

Operator can:

- find or create the intended saved connection
- understand environment and readonly posture
- enter the DB tool without ambiguous route switching

Evidence lanes:

- static tests for shell wording and route ownership
- desktop preflight for the extension-shell verification seam

### 2. Database Workspace Entry

Operator can:

- land in the canonical DB workspace through the extension shell
- see active connection context
- recover or classify missing saved-connection state honestly

Evidence lanes:

- packaged smoke checkpoints
- preflight checks for dashboard + workspace checkpoint wiring

### 3. Inspect And Query

Operator can:

- inspect objects from the canonical route
- run SQL and review results without stale-response drift
- page, export, cancel, and reopen the session coherently

Evidence lanes:

- targeted client/runtime tests
- live verification flows for `connect`, `query`, `paging`, `export`, `cancel`, and `inspection`

### 4. Guarded Edit Or Apply

Operator can:

- review edit or apply intent before mutating data
- see readonly and blocker handling honestly
- keep preview-grade workflows labeled as preview until promotion proof exists

Evidence lanes:

- targeted edit/runtime tests
- live verification flow for `edit`
- preview-only wording for `Data Sync` until later promotion proof exists

### 5. Audit And Reopen

Operator can:

- understand whether the operation completed, failed, or still needs review
- reopen the relevant result, job, or recovery surface without guessing

Evidence lanes:

- packaged smoke recovery checkpoints
- job/history tests where the surface is already shipped
- release-exit blocker classification when live DB proof is still missing

## Current Blocking Truth

The journey contract does not mean the release is currently clear.

Current blocker:

- live MySQL/PostgreSQL evidence is still not current enough to clear the release-exit gate for the packaged candidate

This document exists to keep the gate anchored to the right path while those external proofs are still missing.

## Related Files

- `docs/release-candidate-verification.md`
- `docs/release-exit-checklist.md`
- `.specify/specs/020-db-workbench-productization/contracts/runtime-reliability-gates.md`
- `script/desktop-preflight.ts`
