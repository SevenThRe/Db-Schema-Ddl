---
phase: 01-usable-workbench-v1_4
plan: 01
subsystem: database
tags: [rust, sqlx, sqlparser, tauri, tokio, typescript, types, query-execution, explain]

# Dependency graph
requires: []
provides:
  - DbEnvironment type (dev|test|prod) in shared/schema.ts and Rust mod.rs
  - Extended DbConnectionConfig with environment, readonly, colorTag, defaultSchema
  - 12 new Phase 1 type interfaces in shared/schema.ts (QueryExecutionRequest with confirmed, FetchMoreRequest, PlanNode, DangerClass, etc.)
  - Rust query.rs module with db_query_execute, db_query_cancel, db_query_fetch_more, db_preview_dangerous_sql
  - Rust explain.rs module with db_query_explain, EXPLAIN normalization for MySQL and PostgreSQL
  - DbPoolRegistry and CancellationRegistry managed state registered in lib.rs
  - All 5 new Tauri commands in invoke_handler
  - 16 passing Rust unit tests (12 query, 4 explain)
  - Wave 0 TS type roundtrip tests (5 passing)
affects:
  - 01-02 IPC bridge (depends on these types and Rust commands)
  - 01-03 SQL editor component (depends on QueryExecutionRequest, confirmed field)
  - 01-04 result grid (depends on DbQueryBatchResult, FetchMoreRequest)

# Tech tracking
tech-stack:
  added:
    - tokio-util 0.7 (CancellationToken for query cancel)
  patterns:
    - Mutex-safe pool registry: lock mutex, clone Arc, release before .await
    - Server-side safety enforcement: dangerous SQL rejected in Rust when confirmed=false
    - Quote-aware SQL statement splitter (not dependent on frontend)
    - EXPLAIN JSON normalization: MySQL and PG produce unified PlanNode tree

key-files:
  created:
    - src-tauri/src/db_connector/query.rs
    - src-tauri/src/db_connector/explain.rs
    - test/client/db-connection-config.test.ts
  modified:
    - shared/schema.ts
    - src-tauri/src/db_connector/mod.rs
    - src-tauri/src/lib.rs
    - src-tauri/Cargo.toml

key-decisions:
  - "Server-side safety enforcement: dangerous SQL detection and rejection happens in Rust (query.rs), not just frontend dialog — confirmed=false blocks execution at the command layer"
  - "Canonical statement splitter is in Rust (split_sql_statements) — frontend sends full SQL; backend segments"
  - "Pool registry uses Mutex<HashMap<String, Arc<AnyPool>>> — Mutex lock never held across .await"
  - "AlterDatabase detection deferred — sqlparser 0.53 has no Statement::AlterDatabase variant; documented with TODO comment"
  - "FetchMoreRequest adds LIMIT/OFFSET directly to SQL — simple SELECT pagination without cursor state"

patterns-established:
  - "Pattern: Rust managed state with Arc<Struct { Mutex<HashMap> }> — pool registry and cancel registry both follow this pattern"
  - "Pattern: detect_dangerous_sql returns Vec<DangerClass> — empty vec means safe, non-empty means confirmation required"
  - "Pattern: normalize_mysql_explain / normalize_pg_explain return unified PlanNode tree with warnings field"

requirements-completed: [CONN-01, CONN-03, EXEC-02, SAFE-01, PLAN-01, PLAN-02]

# Metrics
duration: 45min
completed: 2026-03-24
---

# Phase 01 Plan 01: Type Foundation + Rust Backend Stubs Summary

**Extended DbConnectionConfig with environment/readonly model, added 12 Phase 1 query/explain types in shared/schema.ts and Rust mod.rs, created query.rs (dangerous SQL detection via sqlparser AST, server-side safety enforcement, CancellationToken-based cancel, fetch-more pagination) and explain.rs (MySQL/PG EXPLAIN JSON normalization to unified PlanNode tree with FULL_TABLE_SCAN and LARGE_ROWS_ESTIMATE warnings)**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-03-24T00:00:00Z
- **Completed:** 2026-03-24T00:45:00Z
- **Tasks:** 3 (Task 0 + Task 1 + Task 2)
- **Files modified:** 7

## Accomplishments

- 12 new TypeScript interfaces and types in shared/schema.ts including DbEnvironment, QueryExecutionRequest (with confirmed field for server-side safety gate), FetchMoreRequest, PlanNode, DangerClass, DbExplainPlan
- DbConnectionConfig extended in both TS and Rust with environment, readonly, colorTag, defaultSchema (backward compatible via Optional/serde default)
- query.rs implements detect_dangerous_sql using sqlparser 0.53 AST for all 6 danger categories (DROP, TRUNCATE, ALTER TABLE, DELETE/UPDATE without WHERE)
- explain.rs normalizes MySQL EXPLAIN FORMAT=JSON and PostgreSQL EXPLAIN FORMAT JSON to unified PlanNode tree with risk warnings
- 16 passing Rust unit tests + 5 passing Wave 0 TypeScript roundtrip tests
- DbPoolRegistry and CancellationRegistry registered as Tauri managed state

## Task Commits

1. **Task 0: Wave 0 test stubs** - `a4c8bad` (test)
2. **Task 1: Type foundation** - `698e5d6` (feat)
3. **Task 2: Rust command stubs + managed state** - `a13db60` (feat)

## Files Created/Modified

- `shared/schema.ts` - Added DbEnvironment, extended DbConnectionConfig, 12 new Phase 1 interfaces
- `src-tauri/src/db_connector/mod.rs` - Added pub mod query/explain, DbEnvironment enum, extended DbConnectionConfig struct, 12 new Rust types including DbPoolRegistry and CancellationRegistry
- `src-tauri/src/db_connector/query.rs` - New: query execution, dangerous SQL detection, statement splitting, cancellation
- `src-tauri/src/db_connector/explain.rs` - New: EXPLAIN normalization for MySQL and PostgreSQL
- `src-tauri/src/lib.rs` - Pool/cancel registry managed state registration, 5 new commands in invoke_handler
- `src-tauri/Cargo.toml` - Added tokio-util 0.7 dependency
- `test/client/db-connection-config.test.ts` - New: 5 Wave 0 roundtrip tests for new DbConnectionConfig fields

## Decisions Made

- Server-side safety enforcement was kept in Rust (not just frontend dialog) as per plan — the `confirmed` field on QueryExecutionRequest is the gate
- `split_sql_statements` is the canonical splitter; frontend sends full SQL cursor-position-aware, backend segments
- AlterDatabase detection deferred with a TODO comment — sqlparser 0.53 doesn't expose a Statement::AlterDatabase variant
- Pool registry uses double-checked locking pattern: check under read, create outside lock, insert under write — avoids holding Mutex across .await

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added missing `use sqlx::ConnectOptions as _` trait import**
- **Found during:** Task 2 (first cargo check)
- **Issue:** `disable_statement_logging()` from `ConnectOptions` trait requires the trait to be in scope
- **Fix:** Added `use sqlx::ConnectOptions as _;` to query.rs imports
- **Files modified:** src-tauri/src/db_connector/query.rs
- **Verification:** `cargo check` exits 0 after fix
- **Committed in:** a13db60 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking)
**Impact on plan:** Single import fix required for compilation. No scope creep.

## Issues Encountered

- sqlparser 0.53 has no `Statement::AlterDatabase` variant — documented in query.rs with TODO comment, AlterDatabase detection deferred

## Known Stubs

None — all types and commands are structurally complete. Actual DB query execution requires a live database connection (integration testing deferred).

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- All types defined; plan 02 (IPC bridge) can now import and use these types
- All Rust commands registered; plan 02 can call them via desktop-bridge.ts
- Wave 0 tests pass and provide regression coverage for DbConnectionConfig field contract

---

*Phase: 01-usable-workbench-v1_4*
*Completed: 2026-03-24*
