# Spec: Query Memory Guardrails

## Problem

DB Workbench query browsing still has two memory growth paths. Unsupported result-returning statements such as `SHOW` and `EXPLAIN` can materialize the full result set in Rust before truncating for display, and pageable result browsing keeps every loaded row in React state indefinitely.

## Goal

Bound query-session memory growth without breaking the normal operator workflow for browsing, filtering, and editing results.

## Requirements

### R1. Unsupported Result Queries Must Stay Bounded

Result-returning statements that do not support offset paging must stop collecting rows once the visible limit and `hasMore` signal can be determined.

### R2. Paged Result Retention Must Be Windowed

The workbench must cap how many loaded rows it retains in memory for a pageable result batch while preserving the ability to keep loading newer pages.

### R3. Operators Must See When Windowing Happens

When older loaded rows are discarded to protect memory, the result view must make that state visible so the behavior does not look like silent data loss.

### R4. Existing Query Safety And Checks Must Stay Intact

Dangerous SQL gates, load-more behavior, export wiring, and static checks must continue to work after the memory guardrails land.

## Acceptance Criteria

1. Unsupported result queries no longer call a full `fetch_all` path just to compute the first visible page.
2. Repeated `Load more` actions no longer grow retained frontend rows without bound.
3. The result grid shows when it is retaining only a recent row window.
4. `npm run check` and `cargo check` pass.
