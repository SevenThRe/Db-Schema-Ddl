# Plan: Query Run History

## Summary

This wave upgrades the SQL Library from a snippet-plus-recent-queries picker into a richer execution memory surface. The workbench session model will gain bounded query-run history entries, `WorkbenchLayout` will write those entries from the existing execution path for statement and script runs, and the SQL Library dialog will render run-history metadata without changing the backend contract.

## Scope

- Extend the connection-scoped workbench session model with bounded query run history.
- Record run history from the existing SQL execution path for success, partial failure, and failure.
- Keep legacy `recentQueries` compatibility so existing sessions still load cleanly.
- Surface run history inside the SQL Library dialog with mode/status metadata.
- Keep all changes client-side for this wave.

## Likely Touchpoints

- `client/src/components/extensions/db-workbench/workbench-session.ts`
- `client/src/components/extensions/db-workbench/sql-library.ts`
- `client/src/components/extensions/db-workbench/SqlLibraryDialog.tsx`
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
- `test/client/db-workbench-session-phase16.test.ts`
- `test/client/db-workbench-query-history-phase19.test.ts`

## Risks

- Session persistence must not accidentally wipe the new history field when other workbench state changes.
- History status classification must distinguish partial script failures from total failures.
- Library UI must stay dense and operator-focused rather than turning into a feed-style timeline.

## Verification

- `npm run check`
- `node --test --experimental-strip-types test/client/db-workbench-session-phase16.test.ts test/client/db-workbench-query-history-phase19.test.ts test/client/db-workbench-sql-library-phase16.test.ts`
- Manual desktop check: run a successful statement and a failing script, then open SQL Library and confirm `Run history` entries are visible with useful metadata.
