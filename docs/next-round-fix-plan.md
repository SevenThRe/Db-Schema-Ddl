# Plan

This plan captures the remaining follow-up work for the next hardening and performance pass. The approach is to complete one backend consistency fix, two frontend rendering optimizations, and one cleanup refactor, then validate with targeted regression and performance checks before merge.

## Scope
- In:
  - Atomic dedupe for uploaded files (DB-level uniqueness + conflict-safe flow)
  - Large DDL rendering optimization in `client/src/components/DdlGenerator.tsx`
  - Wide sheet rendering optimization in `client/src/components/SpreadsheetViewer.tsx`
  - Cleanup/deprecation of unused `buildSearchIndex` worker path in excel executor/worker
  - Validation, perf comparison, and rollback notes
- Out:
  - New product features
  - UI redesign unrelated to rendering performance
  - Broad parser algorithm rewrite beyond targeted fallback/read-cost fixes

## Action items
[ ] Add a DB unique constraint for `uploaded_files.file_hash` in schema/migration (`shared/schema.ts` + migration path used by project), and verify existing data compatibility before applying.

[ ] Refactor upload finalize flow in `server/routes.ts` and storage layer (`server/storage.ts`) to be conflict-safe (transaction or upsert-style pattern) so concurrent same-hash uploads do not create duplicate records.

[ ] Add explicit duplicate-conflict handling and cleanup policy (which temp file to delete, which record to keep), and return deterministic API behavior under concurrent identical uploads.

[ ] Introduce large-text render guard in `client/src/components/DdlGenerator.tsx`: when DDL length/token count exceeds threshold, fall back to lightweight plain-text mode or line-based rendering instead of token-level `<span>` for all content.

[ ] Add viewport-based horizontal column slicing or column virtualization in `client/src/components/SpreadsheetViewer.tsx` to complement row virtualization for wide-sheet scenarios.

[ ] Reduce per-cell render cost in `SpreadsheetViewer.tsx` (event handlers/tooltips/title usage) and ensure memoization boundaries are effective for scroll and hover interactions.

[ ] Remove or mark deprecated the unused `buildSearchIndex` worker path (`server/lib/excel-executor.ts`, `server/lib/excel-worker.ts`) after confirming no runtime callers rely on it.

[ ] Add regression tests and scenario checks:
  - concurrent identical upload test
  - duplicate hash conflict behavior test
  - search-index path still correct after cleanup
  - frontend smoke checks for DDL viewer and spreadsheet interactions

[ ] Run performance validation before/after:
  - large DDL render benchmark
  - wide-sheet scroll and interaction profile
  - backend concurrent upload stress check
  Record results in `docs/performance-benchmarks.md`.

[ ] Prepare rollout/rollback notes:
  - migration apply/rollback steps
  - feature threshold toggles for frontend fallback mode
  - monitoring points (error rate, 429/503, frontend render latency)

## Open questions
- Should duplicate upload behavior always preserve the earliest file record, or preserve the latest successful upload metadata?
- Do we want frontend optimization behind a temporary feature flag for staged rollout?
- Can the `buildSearchIndex` task type be fully deleted now, or should it stay one release as deprecated alias for compatibility?
