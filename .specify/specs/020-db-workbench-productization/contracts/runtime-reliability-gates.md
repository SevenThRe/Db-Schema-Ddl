# Contract: Runtime Reliability And Release Gates

## Purpose

Define the product-level non-functional gates that determine whether DB Workbench features are release-worthy.

## Core Principle

Reliability is part of the product, not a post-feature cleanup track.

A workbench surface cannot be treated as `Primary` unless its runtime behavior is bounded, recoverable, and observable.

## Gate Categories

### G1. Reachability And Wiring

Every product claim must be backed by:

- reachable frontend surface
- shared contract coverage
- host API or bridge coverage
- registered Tauri command coverage

### G2. Memory Safety

Primary result-browsing paths must:

- avoid unbounded growth for unsupported result queries
- avoid unbounded retained-row growth for pageable results
- make row-window truncation visible to operators

### G3. Stale Response And Cancellation Correctness

Primary execution/export flows must:

- ignore stale responses after newer requests supersede them
- expose cancel behavior honestly
- avoid applying late results to the wrong workbench state

### G4. Session Recoverability

Primary daily-driver flows must preserve:

- tabs and drafts
- selected connection context
- active schema
- primary result/inspection context
- relevant sync and job context where designed

### G5. Audit Visibility

Higher-risk flows must keep:

- persisted job history
- visible failure/partial status
- reopenable context where recovery is part of the workflow

### G6. Desktop Verification

Primary workbench release candidates must be covered by:

- static checks
- targeted tests
- desktop smoke verification for canonical flows

## Canonical Release Checklist

No `Primary` or `Primary With Constraints` surface is release-ready unless all of the following are true:

1. the runtime path is reachable from the canonical workbench
2. end-to-end contract layers match
3. unsafe or incomplete cases are labeled honestly
4. memory and stale-response behavior are bounded
5. cancel/recovery behavior is verified where applicable
6. smoke verification covers the operator-critical path

## Primary Surface Gate Matrix

### Connection Center (`Primary Support`)

- required checks:
  - `npm run check`
  - `test/client/db-workbench-flow-phase24.test.ts`
  - `test/client/db-connection-platform-phase22.test.ts`
  - `npm run verify:desktop:preflight`
- runtime truth being gated:
  - canonical shell route still exposes Connection Center instead of duplicating product entry points
  - dashboard/workbench smoke hooks still point at the real `db-connector` workspace

### SQL Daily-Driver (`Primary`)

- required checks:
  - `npm run check`
  - `test/client/db-workbench-sql-library-phase16.test.ts`
  - `test/client/db-workbench-sql-script-review-phase18.test.ts`
  - `test/client/db-workbench-runtime-phase15.test.tsx`
  - `test/client/db-workbench-runtime-phase19.test.ts`
  - `test/client/db-workbench-runtime-phase26.test.ts`
  - `npm run verify:desktop:live -- --driver=mysql ...`
  - `npm run verify:desktop:live -- --driver=postgres ...`
- runtime truth being gated:
  - connection-scoped session, library, history, and execution-review path remain coherent
  - paging, export, cancel, and stale-response protection remain real runtime behaviors

### Results / Inspection / Edit Guardrails (`Primary`)

- required checks:
  - `npm run check`
  - `cargo check`
  - `test/client/db-workbench-runtime-phase15.test.tsx`
  - `test/client/db-workbench-runtime-phase26.test.ts`
  - `test/server/release-verification-phase26.test.ts`
  - live verification flows `edit`, `readonly`, and `inspection`
- runtime truth being gated:
  - result window bounds stay explicit
  - late query/export responses do not corrupt active workbench state
  - inspection and review-only edit paths remain covered by live verification evidence

## Preview Promotion Criteria

### Data Sync / Job Center

These surfaces remain `Preview` until all of the following are true:

- preview labeling can be removed without hiding material operator risk
- release verification includes a real runtime flow for compare, preview apply, execute, and job reopen
- audit visibility and blocker handling are covered by targeted tests plus live or packaged evidence
- release notes can describe the flow without cautionary scope language

## Preview Promotion Rule

A `Preview` surface may only be promoted to `Primary` when:

- operator constraints are explicit and stable
- verification covers real runtime behavior
- product docs no longer need cautionary scope language

Until then, the feature may stay shipped, but it must remain labeled as preview.
