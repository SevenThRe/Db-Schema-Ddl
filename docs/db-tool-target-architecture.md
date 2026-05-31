# DBTools Target Architecture

This document defines the target architecture for DBTools as a desktop database tool that can replace paid tools such as Navicat in daily enterprise use, while keeping enterprise xlsx schema governance as a first-class workflow.

Runtime code remains the source of truth. This document is a target architecture and migration guide, not a claim that every capability is already release-grade.

## Product Thesis

DBTools should not be an Excel-to-DDL utility with a DB screen attached.

The target product is:

```text
Enterprise xlsx schema governance
  + operator-grade desktop database workbench
  + verified schema/data lifecycle controls
```

The Excel workflow is already the strongest shipped axis. The DB workbench must now be verified as a real database tool against live engines before the product can credibly claim Navicat-class replacement value.

## Current Verification Reality

The current machine can build and package the application, but it does not currently prove DB runtime capability.

Observed local runtime state:

- no local MySQL/PostgreSQL/MSSQL/Oracle listener on common ports
- no `mysql`, `psql`, `mariadb`, `pg_ctl`, or `initdb` CLI found in PATH
- no Docker CLI available
- live verification scripts exist, but require a real reachable database target

Therefore:

- `npm run check`, `cargo check`, `npm run build`, and `npm run tauri:build` prove development/build readiness
- they do not prove connection, introspection, query, edit, export, explain, or sync behavior against a live database
- DB workbench release confidence must be blocked on live MySQL/PostgreSQL evidence

## North Star Workflow

The canonical operator journey is:

```text
Connection Center
  -> Database Workspace
  -> Inspect schema/object
  -> Query and review results
  -> Compare xlsx schema vs live DB
  -> Generate or review DDL change plan
  -> Execute guarded change or export migration package
  -> Audit result and preserve evidence
```

The workbench must make the active connection, schema, environment, readonly state, and source/target roles visible at all times.

## Architecture Principles

1. Runtime proof before product claims.
   A feature is not release-grade until it is reachable, wired through host API and Tauri, and verified against a real or deterministic database target.

2. One canonical workbench.
   Normal DB work must happen in one `Database Workspace`. Compatibility panes may remain, but they must not keep splitting the operator mental model.

3. Excel is governance, not import trivia.
   xlsx definitions should become schema policy inputs: naming, column definitions, comments, enum/code references, diff baselines, and migration review.

4. Safety is part of the architecture.
   Dangerous SQL, data sync, prod targets, cross-connection operations, and row edits require explicit intent capture and server-side enforcement.

5. Modules own behavior end to end.
   A capability module owns UI state, shared contract, bridge invoke, Rust service, tests, and release evidence. It should not be just another block inside a giant layout component.

## Target System Layers

```text
Desktop Shell
  Dashboard, extension workspace host, status bar, activity/sidebar routing

Workbench Kernel
  active connection context, schema context, command bus, safety gates, job/event center

Capability Modules
  connection governance
  schema explorer and object inspection
  SQL editor and execution
  result grid and export
  row editing
  xlsx schema governance
  schema diff and migration planning
  data compare/sync
  ER visualization and schema authoring
  SQL assets and local assistance

Shared Contracts
  shared/schema.ts split by domain and re-exported through a stable public contract

Host Bridge
  capability-scoped APIs instead of one large connections API

Tauri Backend
  Rust services per domain, backed by driver adapters and storage/audit services

Verification Lab
  seeded MySQL/PostgreSQL targets, live verification scripts, packaged smoke evidence, release gates
```

## Frontend Target Shape

The current `WorkbenchLayout.tsx` should become a shell, not the owner of every feature.

Target decomposition:

```text
db-workbench/
  WorkbenchShell.tsx
  WorkbenchRoute.tsx
  kernel/
    WorkbenchContextProvider.tsx
    useActiveConnection.ts
    useWorkbenchCommandBus.ts
    useWorkbenchSafetyGates.ts
  connections/
    ConnectionCenter.tsx
    connection-contract.ts
  schema/
    SchemaExplorerPane.tsx
    ObjectInspectionPane.tsx
    useSchemaIntrospection.ts
  sql/
    SqlEditorPane.tsx
    QueryTabs.tsx
    useSqlExecution.ts
    useSqlReview.ts
  results/
    ResultGridPane.tsx
    useResultBatches.ts
    useResultExport.ts
  editing/
    GridEditPanel.tsx
    useGridEditSession.ts
  xlsx-governance/
    WorkbookSchemaPanel.tsx
    useWorkbookSchemaBaseline.ts
  migration/
    SchemaComparePanel.tsx
    MigrationPlanReview.tsx
  data-sync/
    DataSyncWorkspace.tsx
    useDataSyncPreview.ts
    useDataApplyJob.ts
  jobs/
    JobCenterPane.tsx
  assistant/
    SqlCopilotDialog.tsx
```

Rules:

- `WorkbenchShell` may coordinate layout and active view only
- feature state must live in feature hooks/providers
- dangerous operation review must be centralized in `useWorkbenchSafetyGates`
- heavy modules should be lazily loaded
- compatibility schema/diff panes must be explicitly marked as compatibility until retired

## Backend Target Shape

The Rust side should expose capability services, not just a flat pile of commands.

Target decomposition:

```text
src-tauri/src/db_connector/
  mod.rs
  commands.rs
  connection/
    service.rs
    storage.rs
    discovery.rs
  drivers/
    mod.rs
    mysql.rs
    postgres.rs
    traits.rs
  schema/
    introspect.rs
    inspect_object.rs
    diff.rs
  query/
    execute.rs
    explain.rs
    paging.rs
    dangerous_sql.rs
  results/
    export.rs
  editing/
    prepare.rs
    commit.rs
  migration/
    plan.rs
    render.rs
  data_sync/
    diff.rs
    apply.rs
    jobs.rs
  audit/
    events.rs
    evidence.rs
```

Command handlers should stay thin:

```text
Tauri command
  -> parse/request validation
  -> service call
  -> response mapping
```

The service layer should own driver behavior, safety checks, and transactional boundaries.

## Contract Model

`shared/schema.ts` can stay as the public re-export, but the source contracts should be split by domain:

```text
shared/
  schema.ts
  contracts/
    connection.ts
    schema-inspection.ts
    query.ts
    result-export.ts
    grid-edit.ts
    workbook-schema.ts
    migration-plan.ts
    data-sync.ts
    jobs.ts
    assistant.ts
```

Every DB capability change must update the same chain:

```text
shared contract
  -> host API
  -> desktop bridge invoke
  -> Rust request/response
  -> Tauri command registration
  -> tests/live verification
```

## Verification Lab

The DB workbench needs a deterministic verification environment before more product expansion.

Minimum lab:

```text
MySQL 8
PostgreSQL 16 or 17
seeded schemas
seeded data
readonly user
writable non-prod user
destructive-operation sandbox
```

Preferred local setup:

```text
Docker Desktop
  npm run db-lab:preflight
  npm run db-lab:up
  npm run verify:desktop:live:lab:mysql:prereq
  npm run verify:desktop:live:lab:postgres:prereq
  npm run verify:desktop:live:lab:mysql
  npm run verify:desktop:live:lab:postgres
```

The local lab is defined by:

- `docker-compose.db-lab.yml`
- `test/db-lab/mysql/001-dbtools-lab.sql`
- `test/db-lab/postgres/001-dbtools-lab.sql`
- `script/db-lab-preflight.ts`

If local containers are not allowed, use a remote enterprise sandbox with masked data and stable credentials. Saved-connection-only verification is advisory; release proof needs a connection string or equivalent environment injection so the prereq probe can confirm TCP reachability.

Required live proof matrix:

| Flow | MySQL | PostgreSQL | Release meaning |
|---|---:|---:|---|
| connect/test | required | required | driver target is reachable |
| introspect | required | required | schema explorer is real |
| inspect object | required | required | object details are trustworthy |
| query | required | required | SQL editor core works |
| paging/load more | required | required | large result handling works |
| export | required | required | data extraction works |
| cancel | required | required | long-running query control works |
| dangerous SQL preview | required | required | safety gate is real |
| readonly enforcement | required | required | operator safety is backend-backed |
| grid edit prepare/commit | required on writable sandbox | required on writable sandbox | editing is real |
| schema diff | required | required | compare works |
| xlsx to live DB compare | required | required | enterprise xlsx value is proven |
| data sync preview/apply | preview evidence only | preview evidence only | cannot graduate until hardened |

## Navicat-Class Capability Map

### Must Be Release-Grade

- connection catalog with grouping, environment labels, readonly state, notes, and favorites
- MySQL/PostgreSQL direct connection
- schema explorer and object inspection
- SQL editor with tabs, history, explain, cancel, and formatting
- result grid with filtering, paging, export, and row inspector
- guarded data editing for deterministic single-table result sets
- schema diff and migration review
- xlsx schema baseline import, validation, and DDL generation
- audit trail for risky operations

### Must Be Preview Before Being Promoted

- data sync apply
- SQL Copilot generation
- migration execution against production-like targets
- bulk object changes

### Still Missing For Paid-Tool Replacement

- SSH tunnel and TLS profile management
- enterprise secret handling
- ER diagram and relationship canvas
- visual schema authoring
- migration plan authoring with rollback
- table data browsing as a first-class mode, separate from arbitrary SQL result editing
- durable edit drafts across restart
- release evidence against real DB engines

## Migration Plan

### Phase 0: Establish DB Runtime Proof

Goal: stop debating whether DB features work by creating a real verification target.

Tasks:

- install or provide Docker/Podman or remote sandbox DBs
- create seeded MySQL and PostgreSQL schemas
- add deterministic setup/teardown scripts
- run prereq and live verification for both drivers
- mark release gate blocked until evidence exists

Acceptance:

- MySQL and PostgreSQL prereq probes pass
- packaged or dev-tauri live verification emits evidence artifacts
- failures identify product defects, not missing environment

### Phase 1: Split The Workbench Shell

Goal: reduce `WorkbenchLayout.tsx` from a feature owner into a layout coordinator.

Tasks:

- extract query execution state into `useSqlExecution`
- extract result/export state into `useResultBatches` and `useResultExport`
- extract grid editing into `useGridEditSession`
- extract Data Sync into `useDataSyncPreview` and `useDataApplyJob`
- extract Copilot into assistant module
- preserve behavior with focused tests

Acceptance:

- no behavior regression in existing tests
- main layout no longer owns all feature states directly
- bundle can code-split heavy workbench modules

### Phase 2: Make Xlsx Governance Meet Live DB

Goal: prove the unique enterprise value beyond generic DB tools.

Tasks:

- define workbook schema baseline model
- compare workbook definitions against live DB introspection
- show naming/type/comment/index/FK drift
- generate migration plan preview from workbook-to-live drift
- keep execution behind review gates

Acceptance:

- operator can answer: "Does this live database still match our enterprise workbook definition?"
- generated DDL is linked to exact workbook source cells and live DB objects

### Phase 3: Graduate DB Workbench Core

Goal: make the core DB tool credible against Navicat-class daily workflows.

Tasks:

- connection governance hardening
- object explorer completeness
- table browsing mode
- ER read-only canvas
- migration review and rollback package
- SSH/TLS/secret posture

Acceptance:

- one canonical workspace supports daily connection, inspect, query, export, edit, compare, and audit
- live verification covers both MySQL and PostgreSQL
- preview features are visually and technically blocked from being marketed as release-grade

## Immediate Architectural Decision

The next serious work should not add more DB features into the current layout. The next work should create the DB verification lab and split the workbench into capability modules.

Until a real database target exists, the product can honestly say:

- Excel-to-DDL is implemented
- DB workbench code paths exist and compile
- DB core is not yet proven on this machine
