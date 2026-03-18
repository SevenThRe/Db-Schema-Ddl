---
phase: 01-snapshot-compare-and-reports-v1_2
milestone: v1.2
updated: 2026-03-18
status: discussed
---

# Phase 1 Context

## Phase

**Phase 1: Snapshot Compare and Reports**

Goal: Users can compare historical DB states directly, including arbitrary snapshot pairs and live-vs-snapshot, and can export those findings for review.

Requirements in scope:
- HIST-01
- HIST-02
- HIST-03

## Fixed Boundary

This phase clarifies **how** snapshot/history comparison and reporting should work.

It does **not** add:
- cross-environment apply or sync
- `live DB -> XLSX`
- Oracle reverse import
- SQL bundle reverse import

Those remain in later `v1.2` phases.

## Reused Product Context

Existing reusable assets already in the codebase:

- History list/detail/compare infrastructure already exists in:
  - `client/src/components/db-management/DbHistoryPanel.tsx`
  - `server/lib/extensions/db-management/history-service.ts`
  - `server/routes/db-management-routes.ts`
- Snapshot persistence already exists through:
  - `server/lib/extensions/db-management/snapshot-service.ts`
  - `shared/schema.ts` (`dbSchemaSnapshots`, `dbSchemaScanEvents`)
- Graph and compare artifacts already exist for other DB flows and should be reused where possible:
  - `server/lib/extensions/db-management/graph-service.ts`
  - `server/lib/extensions/db-management/db-diff-service.ts`

Important current limitation:
- Existing history comparison is still shaped around the currently selected connection/database and does not yet support arbitrary cross-history source pairing.

## Locked Decisions

### 1. Workspace model

- `Snapshot Compare` will be a **new main view** inside `DB 管理`.
- Existing `History` stays focused on:
  - a single DB's timeline
  - scan events
  - selected snapshot detail
- The new `Snapshot Compare` view handles:
  - arbitrary source/target snapshot comparison
  - `live vs snapshot`
  - `snapshot vs snapshot`
  - future-friendly report export

Rationale:
- Keep timeline browsing separate from arbitrary compare work.
- Avoid overloading the current `History` tab with dual-source logic.
- Stay consistent with the earlier `db-vs-db` dedicated-view decision from `v1.1`.

### 2. Source selection model

- The compare workspace is a **dual-source** workspace.
- Left and right sides must be independently selectable.
- Each side should support:
  - connection
  - database
  - source kind (`live` or `snapshot`)
  - snapshot selection where relevant
- The view should also support a **swap source/target** action.

### 3. Live freshness behavior

- `live` comparison does **not** always force a refresh by default.
- The workspace must provide an explicit freshness control:
  - `使用最近 snapshot`
  - `比较前刷新 live`
- This decision applies at compare time so the user can choose speed vs freshness intentionally.

Rationale:
- Avoid making every compare slow or noisy by default.
- Preserve explicit operator control over whether “live” means cached/latest-known or freshly rescanned.

### 4. Reporting outputs

- This phase must support report export for review and handoff.
- Primary human-facing report format: **Markdown**
- The Markdown report structure should be:
  - summary first
  - then table-level and column-level detail
- A machine-facing **JSON** output should also exist.

### 5. JSON design for MCP / AI use

- JSON output should be **task-friendly**, not merely raw internal dumps.
- It should be designed for future MCP / agent / automation consumption.
- It should include stable, machine-usable fields such as:
  - source
  - target
  - compare context
  - summary
  - table changes
  - column changes
  - blockers / warnings
  - stable ids / stable entity keys

Rationale:
- The product is expected to grow more MCP/AI behavior later.
- Compare artifacts must be reusable by automation, not just by UI rendering.

### 6. AI/MCP-friendly data model constraint

This phase introduces a milestone-wide design constraint:

- Snapshot compare results must be modeled as a **stable compare artifact**, not just a UI tree.
- Stable identifiers should exist for:
  - connection
  - database
  - snapshot
  - table
  - column
  - compare entities
- Human-facing render structures can be derived from the artifact, but the artifact should remain the source of truth.

This constraint is intended to support future:
- MCP actions
- agent-readable compare summaries
- report generation
- graph linking
- automation and scripted review flows

## Proposed UX Shape

The accepted direction for the new `Snapshot Compare` main view is:

- Top bar:
  - left source summary
  - right source summary
  - live freshness choice
  - swap action
  - compare action
- Left column:
  - source selectors (`connection / database / live-or-snapshot / snapshot`)
- Middle column:
  - compare summary and diff tree
  - filters / table narrowing
- Right column:
  - selected table/field detail
  - report export actions
  - Markdown preview / export entry
  - JSON export entry

## Open Implementation Guidance For Research/Planning

Downstream research and planning should investigate:

- how much of the current `DbHistoryPanel` compare logic can be extracted and reused
- whether the existing history compare response can be generalized into a dual-source compare artifact
- the cleanest route/API shape for Markdown + JSON report export
- how to preserve stable compare IDs across:
  - live-vs-snapshot
  - snapshot-vs-snapshot
  - future snapshot cross-connection cases

## Deferred Ideas Not In This Phase

These were explicitly kept out of Phase 1:

- `live DB -> XLSX`
- Oracle reverse import
- SQL bundle reverse import
- richer report publishing or external sharing channels beyond the initial report export seam
