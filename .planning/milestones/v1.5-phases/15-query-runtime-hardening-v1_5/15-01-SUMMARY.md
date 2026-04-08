---
phase: 15-query-runtime-hardening-v1_5
plan: 01
subsystem: database
tags: [db-workbench, runtime-contract, paging, tauri, schema]
requires:
  - phase: 14
    provides: DB Workbench query/explain bridge baseline
provides:
  - Explicit paging metadata contract for query batches
  - Schema-aware query/fetch/explain/export request types
  - Typed frontend bridge wiring for schema listing and backend export
  - Tauri invoke registration entries for export/schema command surface
affects: [phase-15-plan-02, runtime-query-execution, db-workbench-ui]
tech-stack:
  added: []
  patterns: [shared-contract-first, bridge-command-lockstep]
key-files:
  created:
    - .planning/phases/15-query-runtime-hardening-v1_5/15-01-SUMMARY.md
  modified:
    - shared/schema.ts
    - client/src/extensions/host-api.ts
    - client/src/extensions/host-api-runtime.ts
    - client/src/lib/desktop-bridge.ts
    - src-tauri/src/db_connector/mod.rs
    - src-tauri/src/lib.rs
key-decisions:
  - "Kept QueryExecutionRequest/FetchMoreRequest/ExplainRequest schema as optional runtime context fields for backward compatibility."
  - "Switched export bridge typing to BinaryCommandResult to align with backend-produced artifact downloads."
  - "Registered db_list_schemas and db_export_rows in Tauri invoke surface before behavior-level implementation hardening."
patterns-established:
  - "Paging metadata is explicit (returnedRows/hasMore/pagingMode/nextOffset) instead of inferred from array length."
  - "Frontend contract additions are mirrored through host API and desktop bridge in the same plan."
requirements-completed: [RUN-01, RUN-03, RUN-04, RUN-05]
duration: 26 min
completed: 2026-04-07
---

# Phase 15 Plan 01: Query Runtime Contract Foundation Summary

**DB Workbench runtime contracts now expose explicit paging metadata, schema-aware request context, binary export typing, and registered schema/export command paths across shared types, host APIs, bridge, and Tauri invoke wiring.**

## Performance

- **Duration:** 26 min
- **Started:** 2026-04-07T09:46:31+09:00
- **Completed:** 2026-04-07T10:12:31+09:00
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added explicit paging metadata fields (`returnedRows`, `hasMore`, `pagingMode`, `pagingReason`, `nextOffset`) and schema context fields to shared runtime request/response contracts.
- Replaced legacy export request shape with runtime-oriented fields (`connectionId`, `requestId`, `sql`, `scope`, optional batch/rows/limits) and defined `ExportRowsResponse` as `BinaryCommandResult`.
- Added `listSchemas` flow through host runtime and desktop bridge, and added Tauri command registrations for `db_list_schemas` and `db_export_rows`.
- Added Rust-side matching enums/aliases for paging/export/schema-list contract vocabulary in `db_connector/mod.rs`.

## Task Commits

No commits were created in this execution run.

## Files Created/Modified

- `.planning/phases/15-query-runtime-hardening-v1_5/15-01-SUMMARY.md` - Plan outcome and deviation record.
- `shared/schema.ts` - Shared paging/schema/export contract updates.
- `client/src/extensions/host-api.ts` - Connections API signature updates for schema listing and binary export.
- `client/src/extensions/host-api-runtime.ts` - Capability-gated `listSchemas` runtime implementation.
- `client/src/lib/desktop-bridge.ts` - Typed IPC wrappers for `db_list_schemas` and `db_export_rows`.
- `src-tauri/src/db_connector/mod.rs` - Rust serde contract updates for paging/export/schema context.
- `src-tauri/src/lib.rs` - Tauri command registration updates for export/schema surface.

## Decisions Made

- Kept `schema` fields optional across query/fetch/explain/export requests to remain compatible with existing call sites while introducing explicit schema context.
- Added command registration entries now to keep invoke surface and bridge contracts synchronized before later behavior-focused plans.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `npm run check` failed after making `totalRows` optional-nullable**
- **Found during:** Task 1 (shared runtime contract update)
- **Issue:** Existing UI files outside this plan’s ownership rely on `totalRows` as a definite number and failed strict TypeScript checks.
- **Fix:** Kept `totalRows` as `number` for compatibility and used new explicit paging metadata fields (`hasMore`, `pagingMode`, `pagingReason`, `nextOffset`) to carry first-page/runtime paging semantics.
- **Files modified:** `shared/schema.ts`
- **Verification:** `npm run check` passed after adjustment.
- **Committed in:** Not committed in this run.

**2. [Rule 3 - Blocking] `ConnectionsApi` fallback implementation lacked `listSchemas` in an out-of-scope file**
- **Found during:** Task 2 (host API wiring)
- **Issue:** A fallback host context object outside owned files does not provide `listSchemas`, causing type-check failure when the method is required.
- **Fix:** Declared `listSchemas` as optional in `ConnectionsApi` while still implementing the method in runtime/bridge and capability-gating it behind `db.schema.read`.
- **Files modified:** `client/src/extensions/host-api.ts`, `client/src/extensions/host-api-runtime.ts`, `client/src/lib/desktop-bridge.ts`
- **Verification:** `npm run check` passed with no type errors.
- **Committed in:** Not committed in this run.

**3. [Rule 3 - Blocking] Rust compile requires coordinated updates in non-owned backend files**
- **Found during:** Post-task verification (`cargo check --manifest-path src-tauri/Cargo.toml`)
- **Issue:** New contracts in `db_connector/mod.rs` and command registration in `src-tauri/src/lib.rs` require matching command/initializer updates in `src-tauri/src/db_connector/commands.rs`, `src-tauri/src/db_connector/introspect.rs`, and `src-tauri/src/db_connector/query.rs`.
- **Fix:** Not applied in this run because those files are outside the user-specified ownership boundary.
- **Files modified:** None (documented blocker only)
- **Verification:** `cargo check` fails with missing `db_list_schemas`/`db_export_rows` commands and missing new struct fields in Rust initializers.
- **Committed in:** Not committed in this run.

---

**Total deviations:** 3 (2 auto-fixed blocking, 1 documented blocking follow-up)
**Impact on plan:** Type-level and bridge-level contract foundation is implemented and TypeScript passes, but Rust runtime compilation remains blocked pending coordinated changes in non-owned backend files.

## Issues Encountered

- Initial `npm run check` failed due strict-null and interface completeness errors after first-pass contract hardening; resolved via compatibility-safe contract adjustments documented above.
- `cargo check --manifest-path src-tauri/Cargo.toml` fails because matching command implementations and result initializers are not yet updated in out-of-scope Rust files.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Shared contract vocabulary for runtime paging/schema/export is now present and wired through host/bridge/registration layers.
- Next runtime hardening steps can focus on command implementation behavior and UI adoption of new paging semantics.
- Follow-up implementation is required in `db_connector/commands.rs`, `db_connector/introspect.rs`, and `db_connector/query.rs` to restore Rust compile integrity with the new contract.
- Follow-up cleanup is recommended to make `listSchemas` required everywhere and to fully migrate `totalRows` to optional-nullable once dependent UI paths are updated.

---
*Phase: 15-query-runtime-hardening-v1_5*
*Completed: 2026-04-07*
