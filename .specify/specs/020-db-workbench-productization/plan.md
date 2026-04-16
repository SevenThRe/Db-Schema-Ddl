# Plan: DB Workbench Productization

## Summary

This is a product-architecture wave, not an implementation wave. Its purpose is to turn the existing DB Workbench feature set into a product-level contract with clear support tiers, workstreams, and release gates.

The plan assumes the current runtime code is the source of truth and uses the existing 001-019 specs as already-landed foundations rather than reopening them. The output of this wave should guide the next implementation specs so the workbench stops growing as loosely related features and starts converging on one operator-grade desktop product.

## Product Position

DB Workbench should be positioned as a desktop-first schema and database operations workbench, not as a generic SQL IDE.

Its differentiated value is the closed loop between:

- workbook-based schema definition
- DDL generation and import
- live database inspection and execution
- schema diff and rename workflows
- controlled data sync and audit

The product should borrow quality expectations from professional database tools while keeping this repository's schema-workbench loop as the center of gravity.

## Scope

- Define the product-grade target state for DB Workbench.
- Consolidate existing implementation waves into coherent product workstreams.
- Identify product-critical gaps between current runtime reality and a release-worthy operator tool.
- Establish phased delivery tiers and verification gates.
- Preserve current architecture constraints:
  - runtime truth first
  - shared contract first
  - desktop operator UI baseline
  - fail-closed safety behavior

## Out Of Scope

- Implementing new driver support in this wave.
- Shipping diagrams, object dependency graphs, or advanced enterprise auth in this wave.
- Rewriting the workbench shell wholesale.
- Claiming benchmark parity with DataGrip, DBeaver, or TablePlus in one release.

## Existing Foundations To Preserve

- Canonical desktop workbench path in `DbConnectorWorkspace.tsx` and `WorkbenchLayout.tsx`
- Shared contract discipline through `shared/schema.ts`
- Host API and Tauri command wiring for query, explain, inspection, grid edit, data diff/apply, and background jobs
- Operator safety mechanisms such as readonly enforcement, dangerous SQL review, apply blockers, and transactional commit review
- Result memory guardrails, stale-response handling, and connection-scoped session persistence

## Product Workstreams

### W1. Information Architecture And Capability Truth

Purpose:
Define the canonical workbench surface, the role of legacy paths, and honest capability labeling.

Key outcomes:

- one primary daily-driver route
- explicit secondary/migration-only surfaces
- a capability matrix tied to runtime reachability

### W2. Connection And Support Platform

Purpose:
Turn connection handling from a basic CRUD surface into a product contract covering driver tiers, secure connectivity expectations, governance metadata, and environment safety.

Key outcomes:

- support-tier matrix for drivers and transports
- connection-governance contract
- release stance for readonly, prod confirmation, and dangerous execution

### W3. Object And Schema Platform

Purpose:
Define the product model for object explorer breadth, inspection depth, schema diff, and future diagram/dependency surfaces.

Key outcomes:

- product-critical object family matrix
- inspection depth tiers
- schema lifecycle boundaries
- explicit later-stage scope for ER and dependency modeling

### W4. SQL Productivity Platform

Purpose:
Make query authoring and execution feel like a daily-driver professional workflow rather than a set of isolated tools.

Key outcomes:

- query/session model
- SQL reuse model
- parameter and script review model
- explain and execution ergonomics
- long-running query behavior and cancellation expectations

### W5. Data Operations And Audit Platform

Purpose:
Define one coherent product model for result editing, mutation review, data sync/apply, and audit/recovery.

Key outcomes:

- editable-result contract
- transaction preview and commit semantics
- future insert/import pathway definition
- unified job-center and audit expectations

### W6. Runtime Reliability And Release Gates

Purpose:
Make reliability, recoverability, and verification product requirements rather than cleanup tasks.

Key outcomes:

- bounded-memory release gates
- stale-response and cancellation gates
- desktop smoke coverage
- phase-level verification matrix

## Phased Delivery Model

### P0. Product Truth And Daily-Driver Baseline

- canonical route and capability matrix
- connection governance completeness
- reachability and honest labeling
- SQL authoring/execution flows already in place made consistent
- release verification and smoke gating

### P1. Product-Grade Depth

- broader object inspection coverage and richer schema workflows
- improved connection/security support
- stronger data editing and data movement flows
- clearer job-center and audit ergonomics

### P2. Strategic Differentiators

- diagram and dependency surfaces
- expanded driver coverage
- higher-end enterprise connectivity
- deeper schema lifecycle tooling

## Likely Touchpoints

- `client/src/components/extensions/DbConnectorWorkspace.tsx`
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
- `client/src/components/extensions/db-workbench/ConnectionSidebar.tsx`
- `client/src/components/extensions/db-workbench/SqlEditorPane.tsx`
- `client/src/components/extensions/db-workbench/ResultGridPane.tsx`
- `client/src/components/extensions/db-workbench/ObjectInspectionPane.tsx`
- `client/src/components/extensions/db-workbench/JobCenterPane.tsx`
- `client/src/components/extensions/db-workbench/workbench-session.ts`
- `client/src/extensions/host-api.ts`
- `client/src/extensions/host-api-runtime.ts`
- `client/src/lib/desktop-bridge.ts`
- `shared/schema.ts`
- `src-tauri/src/db_connector/mod.rs`
- `src-tauri/src/db_connector/commands.rs`
- `src-tauri/src/db_connector/query.rs`
- `src-tauri/src/db_connector/explain.rs`
- `src-tauri/src/db_connector/introspect.rs`
- `src-tauri/src/db_connector/object_inspect.rs`
- `src-tauri/src/db_connector/grid_edit.rs`
- `src-tauri/src/db_connector/data_diff.rs`
- `src-tauri/src/db_connector/data_apply.rs`
- `docs/`
- `.specify/specs/`

## Risks

- Productization could become a vague umbrella unless every claim is tied back to reachable runtime code.
- The team could overreact to benchmark gaps and drift into building a generic SQL IDE instead of a schema workbench.
- Driver and secure-connectivity expansion can easily cause shared-contract churn across frontend, bridge, and backend layers.
- Diagram and schema-lifecycle aspirations can create roadmap noise if they are not clearly labeled as later-stage.
- Legacy-path coexistence can keep confusing users if the product architecture does not define retirement criteria.

## Verification

- Review this productization spec set against the current constitution and 001-019 specs for consistency.
- Validate every product claim against actual runtime surfaces and registered commands before promoting it to P0 or P1.
- Use future implementation waves to require:
  - `npm run check`
  - `cargo check`
  - targeted client/server tests for each workstream
  - desktop smoke verification for canonical workbench flows
- Treat release notes and docs as gated deliverables once a capability crosses from preview/internal to primary product surface.
