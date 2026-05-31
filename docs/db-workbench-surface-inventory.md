# DB Workbench Surface Inventory

This document is the compact ownership map for DB workbench surfaces that are reachable today.

Runtime code stays the primary source of truth. Use this inventory to answer:

- which route is the daily-driver path
- which route is support-only
- which retained routes are compatibility-only
- what must be true before a compatibility route is removed

## Surface Matrix

| Surface | Role | Current purpose | Default operator expectation |
|---|---|---|---|
| `Database Workspace` | `Primary` | Daily-driver DB route for inspect, query, results, explain, edit, and preview-grade sync/jobs | Start here for normal database work |
| `Connection Center` | `Primary Support` | Save, test, discover, organize, and recover connections before entering the workbench | Configure or recover connection context, then return to `Database Workspace` |
| `Compatibility Schema Browser` | `Compatibility` | Retained schema-only browse path for parity checks and migration-era comparison | Use only when checking parity against the canonical route |
| `Compatibility Schema Diff` | `Compatibility` | Retained cross-connection diff path for parity review and regression coverage | Use only when the compatibility-only diff workflow is specifically needed |

## Compatibility Notes

- Compatibility surfaces are real and reachable.
- They are not co-equal product routes with `Database Workspace`.
- They must not be described as the normal daily-driver DB workflow in release notes, docs, or UI copy.

## Retirement criteria

Compatibility surfaces may only be removed when all of the following are true:

1. Canonical parity is proven.
   The canonical workbench route covers the operator job that previously required the compatibility surface.
2. Regression coverage exists.
   Focused tests or release-gate checks lock the behavior that the compatibility surface used to protect.
3. Operator wording is updated first.
   UI and docs no longer point users toward the compatibility route as if it were still a primary path.
4. Recovery or audit gaps are closed.
   If the compatibility surface still carries unique recovery, diff, or audit value, that value is preserved elsewhere before removal.

## Regression Handoff

Use these files as the current proof anchors before retiring a compatibility surface:

- `test/client/db-workbench-flow-phase24.test.ts`
- `test/client/db-workbench-surface-labeling-phase21.test.ts`
- `test/server/db-workbench-release-gates-phase24.test.ts`
- `docs/db-workbench-feature-checklist.md`

## Related Truth Sources

- `client/src/components/extensions/DbConnectorWorkspace.tsx`
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx`
- `docs/db-workbench-feature-checklist.md`
- `docs/db-workbench-operator-journey.md`
