## 31-01 Summary

Objective completed: sync compare in the canonical DB Workbench now derives its table context from the selected source and target connections, and operators can override the runtime key/compare/filter contract before previewing a diff.

What landed:

1. `WorkbenchLayout` now loads source and target schema snapshots independently for sync compare when either endpoint differs from the active workbench connection.
2. Sync table choices now come from the union of the selected source/target schema snapshots instead of only from the active connection snapshot.
3. Selected sync tables now retain per-table draft configuration for key columns, compare columns, and row filters, and stale drafts are pruned when the available table set changes.
4. `previewDataDiff` requests now forward `keyColumns`, `compareColumns`, and `whereClause` overrides from the operator-facing sync controls.
5. The sync pane now surfaces runtime defaults, source/target existence, available columns, and missing stable-key warnings before compare.
6. Compare summary cards now show the resolved key and compare-column scope so apply blockers are easier to interpret before execution.
7. Client regression coverage now locks the independent source/target schema hydration and override-forwarding behavior.

Validation:

- `npm run check`
- `node --test --import=tsx test/client/db-workbench-data-sync-flow-phase18.test.tsx`
- `node --test --import=tsx test/client/db-workbench-data-sync-phase18.test.tsx`

Remaining scope outside this plan:

- large-table diff/apply scaling and artifact-lifetime hardening
- true driver-level cancel semantics for long-running queries
- broader sync/runtime hardening beyond compare-context truthfulness
