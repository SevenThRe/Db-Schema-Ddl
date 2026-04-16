# Contract: Data Operations And Audit Platform

## Purpose

Define one coherent product contract for result editing, transactional commit review, live data compare/apply, and persisted audit recovery.

## Product Position

DB Workbench data operations should prioritize correctness and auditability over breadth.

The product promise is not "edit anything anywhere." The promise is:

- edit only when the runtime can prove enough context
- review before mutation
- execute transactionally
- keep an audit trail for higher-risk workflows

## Editable Result Contract

### P0 Supported Editability

Editable results are allowed only when the runtime can map the result set back to a safe single-table mutation target.

P0-supported sources:

- table-open
- starter-select
- starter-columns

P0 exclusions:

- custom SQL editability by default
- joined result sets
- aggregate/count results
- missing-primary-key results
- readonly connections

### Mutation Types

P0 real support:

- update
- delete

P1 candidate support:

- row insert
- controlled import/paste pathways

## Mutation Review Contract

- edits stage locally first
- prepare-commit generates a reviewable mutation plan
- commit executes transactionally in the backend
- any failure must roll back the transaction and report failure honestly

This flow is part of the primary operator trust model and must not regress.

## Data Sync And Apply Contract

### Product Role

Live data compare/apply is part of the differentiated schema-workbench story, but it should remain honestly labeled until product validation is broader.

### Workflow Contract

1. compare preview
2. per-table detail inspection
3. apply preview with blockers
4. execute apply
5. persisted job audit
6. reopen sync context from job history

### Safety Contract

- readonly target blocks execution
- target snapshot drift blocks execution
- high delete volume requires explicit confirmation
- sensitive target confirmation remains explicit

## Audit And Recovery Contract

- background jobs are not optional bookkeeping; they are part of the product audit surface
- operators must be able to reopen the relevant sync context from persisted job detail
- failures and partial outcomes must remain visible after the original screen state is gone

## Surface Status

- grid edit review flow: `Primary With Constraints`
- data sync apply and job-center audit: `Preview` until broader product hardening and validation are complete

## Release Gate

No data-operations feature may be promoted beyond `Preview` unless:

- safety blockers are fail-closed
- transaction semantics are verified
- audit visibility is persistent
- recovery from prior execution state is demonstrably real
