# DB Workbench Feature Checklist

This is the working capability checklist for the shipped `DB Workbench` path.

Status meanings:

- `Shipped`: reachable in the canonical workbench path and backed by runtime wiring
- `Preview`: reachable, but still called out as not yet fully hardened/product-finished
- `Partial`: meaningful baseline exists, but important paid-tool expectations are still missing
- `Gap`: not yet implemented as a real shipped capability

The source of truth is runtime code first, then `shared/schema.ts`.

## Workspace Core

| Capability | Status | Current Reality | Verification |
|---|---|---|---|
| Canonical Database Workspace | `Shipped` | One primary workbench route with persistent connection context | `test/client/db-workbench-flow-phase24.test.ts` |
| Connection center | `Shipped` | Save/test/delete/discover direct MySQL/PostgreSQL connections | `test/client/db-management-phase5-ui.test.tsx`, `test/server/db-connection-service.test.ts` |
| Connection governance basics | `Partial` | Environment, readonly, favorite, group, notes, default schema are present | `test/client/db-workbench-surface-labeling-phase21.test.ts` |
| Professional large-scale connection governance | `Gap` | Bulk governance / premium-tool-scale catalog workflows are not finished | Planned in `Phase 37` |
| Live packaged release verification | `Partial` | Verification scripts exist, but live evidence remains blocked externally | `test/server/release-verification-phase26.test.ts`, backlog closure in `Phase 32` |

## SQL Workflow

| Capability | Status | Current Reality | Verification |
|---|---|---|---|
| Query tabs and session restore | `Shipped` | Connection-scoped tabs, drafts, recent queries, and restore | `test/client/db-workbench-session-phase24.test.ts` |
| Monaco SQL editor | `Shipped` | Statement/script execution, format, explain, cancel, autocomplete | `test/client/db-workbench-flow-phase16.test.tsx`, `test/client/db-workbench-autocomplete-phase16.test.tsx` |
| SQL library | `Partial` | Snippets, run history, and recent queries are unified, but full asset organization is not done | `test/client/db-workbench-sql-library-phase16.test.ts`, `test/client/db-workbench-query-history-phase19.test.ts` |
| Parameter review | `Shipped` | Named placeholder review before execution | `test/client/db-workbench-sql-parameters-phase17.test.ts` |
| Script review | `Shipped` | Multi-statement execution review path is wired | `test/client/db-workbench-sql-script-review-phase18.test.ts` |
| Dangerous SQL review | `Shipped` | Runtime-backed dangerous-operation preview and confirmation | `test/client/db-workbench-runtime-phase15.test.tsx`, `test/client/db-workbench-runtime-phase26.test.ts` |

## Results, Export, and Editing

| Capability | Status | Current Reality | Verification |
|---|---|---|---|
| Result grid browsing | `Shipped` | Batch tabs, filtering, column resize, row inspector, incremental load | `test/client/db-workbench-flow-phase24.test.ts` |
| Export | `Shipped` | Current/loaded/full export paths with bounded runtime behavior | `test/client/db-live-export-phase2-ui.test.tsx`, `test/server/db-live-export-phase2.test.ts` |
| Inline update staging | `Shipped` | Safe single-table row edits with prepare/commit review | `test/client/db-workbench-grid-edit-phase17.test.tsx`, `test/client/db-workbench-grid-edit-flow-phase17.test.tsx` |
| Delete staging | `Shipped` | Reviewable row deletes with mixed commit preview | `test/client/db-workbench-grid-delete-phase28.test.ts`, `test/server/db-workbench-grid-delete-phase28.test.ts` |
| Insert-row drafting | `Shipped` | Inline insert drafts, default-value omission semantics, mixed insert/update/delete review | `test/client/db-workbench-grid-insert-phase28.test.ts`, `test/server/db-workbench-grid-insert-phase28.test.ts` |
| Durable edit drafts across restarts | `Gap` | Edit drafts do not yet persist beyond the current runtime/session flow | Planned in `Phase 33` |

## Inspection and Structure Navigation

| Capability | Status | Current Reality | Verification |
|---|---|---|---|
| Deep object inspection | `Shipped` | Tables, views, indexes, foreign keys, triggers, routines, PostgreSQL sequences | `test/client/db-workbench-inspection-phase25.test.ts`, `test/server/db-workbench-release-gates-phase24.test.ts` |
| FK-aware relation navigation | `Shipped` | Foreign keys can jump to referenced-table inspection or open referenced rows from explorer and inspection pane | `test/client/db-workbench-relation-navigation-phase25.test.ts` |
| Schema/object explorer | `Shipped` | Searchable explorer with tables/views/routines/triggers/sequences | `test/client/db-workbench-inspection-phase25.test.ts` |
| ER diagram / relation canvas | `Gap` | Read-only relation graph is not yet a shipped surface | Planned in `Phase 40` |
| Schema design / visual modeling | `Gap` | No object authoring designer or DDL design canvas yet | Planned in `Phases 41-42` |

## Compare, Sync, and Jobs

| Capability | Status | Current Reality | Verification |
|---|---|---|---|
| Schema diff | `Shipped` | Cross-connection schema compare remains reachable | `test/server/db-diff-phase4.test.ts` |
| Data sync compare/apply | `Preview` | Compare/apply pipeline is wired and job-backed, but still explicitly preview-grade | `test/client/db-workbench-data-sync-phase18.test.tsx`, `test/client/db-workbench-data-sync-flow-phase18.test.tsx` |
| Job center | `Shipped` | Persistent recent-job list/detail and reopen actions | `test/client/job-center-phase27.test.ts`, `test/server/job-center-phase27.test.ts` |

## Platform / Connectivity Gaps Against Paid Desktop DB Tools

These are still real gaps if the benchmark is “all major desktop DB tools”:

- `SSH / TLS / enterprise auth`: not product-shipped in the current runtime path
- `ER diagram canvas`: not shipped
- `visual schema authoring / migration designer`: not shipped
- `full SQL asset organization`: only baseline snippet/history support exists
- `durable row-edit drafts`: not shipped
- `broad live packaged verification evidence`: partially blocked on external environments

## Remaining Capability Blocks And Phase Split

| Capability Block | Milestone | Size | Remaining Gap | Phase Split |
|---|---|---|---|---|
| Release proof and ship-gate evidence | `v1.8` | `Small` | Source-level and packaged verification exist, but live publishability evidence is still incomplete | `Phase 32` |
| Editing durability and sync graduation | `v1.9` | `Medium` | Durable edit drafts and a fully trusted release-grade sync flow are not finished | `Phases 33-34` |
| SQL asset depth and repeat execution | `v1.9` | `Medium` | SQL snippets/history exist, but full asset organization and operational runbooks are missing | `Phases 29, 35-36` |
| Connection governance, secure transport, and auth posture | `v1.9` | `Large` | Premium-tool-scale connection cataloging plus SSH/TLS transport and external-secret-friendly auth are not shipped | `Phases 30, 37-39` |
| Structure visualization and schema design | `v1.9` | `Large` | ER graphing, DDL change design, and full visual schema authoring are still absent | `Phases 40-42` |

## Current Priority Direction

The current repo roadmap now points to:

1. finish Phase 28 advanced editing workflows
2. close live release evidence across Phases 26 and 32 inside `v1.8`
3. enter planned `v1.9` with Phases 29-30, then continue by capability block through Phases 33-42
4. leave extension-platform work in Phases 43-48 outside the DB capability parity track

This checklist should be updated whenever a capability becomes truly reachable or a gap is closed end-to-end.
