# Phase 1: Cross-Database Compare - Research

**Researched:** 2026-03-18
**Domain:** `DB vs DB` compare, directional preview, graph-linked cross-database review inside `DB 管理`
**Confidence:** MEDIUM-HIGH

## Research Summary

Phase 1 should be built as an extension of the existing DB-management compare stack, not as a second compare subsystem. The repo already has almost all of the required primitives:

- canonical DB schema catalogs
- compare-source unions for `file`, `live`, and `snapshot`
- blocker-aware diffing
- graph DTO generation
- a multi-view `DB 管理` shell

The main implementation change is to safely unlock `live vs live` comparison for this milestone while keeping apply-related live-to-live execution blocked.

**Primary recommendation:** implement `DB vs DB` by extending the current history/compare contracts to allow `live vs live`, introduce a dedicated `db-vs-db` workspace under `DB 管理`, and reuse the same canonical diff + graph services so tree, directional preview, and graph highlighting all come from one compare result.

## Standard Stack

### Core

| Library / Module | Current Version / Source | Purpose | Recommendation |
|---|---|---|---|
| `mysql2` | `3.20.0` | source/target live-schema introspection | Keep using it through existing connection/introspection services |
| `zod` | `3.x` | compare-source and preview contracts | Extend current shared schemas instead of inventing ad hoc request types |
| `@tanstack/react-query` | `5.x` | source/target compare queries, preview loading, graph loading | Reuse for new `DB vs DB` hooks and cache invalidation |
| `@xyflow/react` | `12.x` | graph rendering | Keep as the graph UI layer |
| `elkjs` | `0.10.x` | graph layout | Keep as the layout engine for changed-table highlighting and filtered focus |

### Existing Internal Stack to Reuse

- `server/lib/extensions/db-management/history-service.ts`
- `server/lib/extensions/db-management/db-diff-service.ts`
- `server/lib/extensions/db-management/graph-service.ts`
- `server/routes/db-management-routes.ts`
- `client/src/components/db-management/DbManagementWorkspace.tsx`
- `client/src/components/db-management/DbDiffWorkspace.tsx`
- `client/src/components/db-management/DbSchemaGraph.tsx`
- `client/src/hooks/use-db-management.ts`

## Architecture Patterns

### 1. Extend the existing compare-source model; do not create a separate DB-vs-DB model

Use the current `DbHistoryCompareSource` / `DbGraphRequest` family as the base. Right now the shared schema explicitly blocks `live vs live`; Phase 1 should lift that restriction for compare/graph only.

Use this pattern:

- one compare-source union
- one compare service entry point
- one result shape for tree/summary/blockers
- one graph highlight path

Do **not** create a parallel `DbToDbCompareRequest` unless the existing union truly cannot express the workflow.

Why:

- `shared/schema.ts` already models `file`, `live`, and `snapshot`
- `history-service.ts` already resolves compare sources to canonical catalogs
- `graph-service.ts` already derives changed-table highlights from compare results

### 2. Keep source/target compare state separate from file-vs-DB state

`DB vs DB` should be a new main view inside `DB 管理`, with its own dedicated workspace state. It should not overload the current `DbDiffWorkspace` state object, because the current object is file-centered (`fileId`, `sheetName`, Excel-derived entities).

Recommended split:

- keep current `diff` view for `file vs DB`
- add a new `db-vs-db` view
- inside that view, store:
  - source target
  - target target
  - compare result
  - directional preview
  - graph focus/filter state
  - rename policy decisions

### 3. Directional preview should be derived from compare orientation, not a second SQL generator

The compare request should be explicit about orientation:

- `left = source`
- `right = target`

Directional preview then means:

- which tables/columns are missing in target
- which objects differ
- what changes would be required for target to converge to source

The implementation should reuse the same compare result and transform it into directional artifacts, rather than rerunning a second semantic analysis pass with different rules.

### 4. Store rename-policy settings as DB-management settings, not DDL settings

The repo already has `ddl_settings`, but rename/equivalence auto-accept thresholds are operational compare settings, not DDL generation settings.

Recommended pattern:

- add DB-management-specific settings storage
- keep first-cut settings small:
  - `tableRenameAutoAcceptThreshold?: number`
  - `columnRenameAutoAcceptThreshold?: number`
- default to `undefined` / manual confirmation

This matches the user’s “AI CLI permission” metaphor without over-designing scope matrices too early.

## Don't Hand-Roll

- Do not build a second diff engine just for `DB vs DB`.
- Do not fork graph logic into a separate renderer for cross-database compare.
- Do not stuff rename policy into global DDL settings.
- Do not hand-roll a complex permission DSL for rename policy in Phase 1.
- Do not make `DB vs DB` imply any executable sync or apply path.
- Do not collapse `DB vs DB` into the current file-based `DbDiffWorkspace` without a dedicated main view boundary.

## Common Pitfalls

### 1. Accidentally enabling live-to-live apply when unlocking live-to-live compare

Current shared schemas already defer:

- `live-to-live DB comparison` in `dbHistoryCompareRequestSchema`
- `live-to-live` graph comparison constraints
- `live-to-live` apply semantics

Phase 1 should only relax compare/graph constraints where needed. Apply-related guards must remain intact.

### 2. Leaking source/target semantics in the UI

If the UI does not keep source and target visually explicit, directional preview becomes confusing fast. This is especially risky once swap is supported.

Recommendation:

- keep fixed source/target badges
- keep preview wording explicit as `make target match source`
- add a one-click swap action instead of letting users mentally reinterpret columns

### 3. Pre-filtering tables before compare

The user already decided whole-database compare first, table filtering second. If planning drifts back to “pick tables before compare,” the graph and summary experience will feel fragmented.

Recommendation:

- compare whole database first
- filter in results/tree/graph afterward

### 4. Treating rename policy as automatic truth

Even with configurable thresholds, Phase 1 should still treat auto-accept as a settings-based override, not as default behavior. Confidence scoring and equivalence heuristics are inherently imperfect.

Recommendation:

- keep manual-by-default
- expose low-complexity thresholds
- record when auto-accepted decisions are applied to a compare session

### 5. Recomputing graph and tree from different compare logic

If the graph highlight path and tree diff path diverge, users will see inconsistencies immediately.

Recommendation:

- compute one compare result
- derive tree, preview, and graph highlights from that same result object or a direct typed transform

## Code Examples

### Example 1: Safe live-vs-live compare contract extension

```typescript
const dbHistoryCompareRequestSchema = z.object({
  left: dbHistoryCompareSourceSchema,
  right: dbHistoryCompareSourceSchema,
  scope: dbHistoryCompareScopeSchema.default("database"),
  tableName: z.string().min(1).optional(),
  refreshLiveSchema: z.boolean().default(false),
  mode: z.enum(["generic", "directional"]).default("generic"),
  direction: z.enum(["left_to_right", "right_to_left"]).default("left_to_right"),
});

// Keep apply schemas unchanged.
// Only compare/graph request schemas gain live-vs-live support.
```

### Example 2: Dedicated main view in DB 管理

```typescript
type DbManagementViewMode =
  | "diff"
  | "db-vs-db"
  | "history"
  | "apply"
  | "graph";

// DbManagementWorkspace owns the active top-level mode.
// DB-vs-DB then renders its own dedicated workspace with:
// - source / target selectors
// - diff tree
// - directional preview
// - graph linkage
```

### Example 3: Low-complexity rename policy

```typescript
type DbCompareRenamePolicy = {
  tableRenameAutoAcceptThreshold?: number;
  columnRenameAutoAcceptThreshold?: number;
};

function resolveRenameDecision(
  kind: "table" | "column",
  confidence: number,
  policy: DbCompareRenamePolicy,
): "accept" | "pending" {
  const threshold =
    kind === "table"
      ? policy.tableRenameAutoAcceptThreshold
      : policy.columnRenameAutoAcceptThreshold;

  return threshold != null && confidence >= threshold ? "accept" : "pending";
}
```

### Example 4: Graph highlight derived from one compare result

```typescript
const changedTableNames = new Set(
  compareResult.tableChanges.map((change) =>
    normalizeName(change.fileTable?.physicalTableName ?? change.dbTable?.name ?? change.entityKey),
  ),
);

const graph = buildGraphFromCatalog(sourceCatalog, {
  changedTableNames,
  selectedTableNames,
  includeNeighbors,
});
```

## Prescriptive Implementation Guidance

### Use

- existing canonical compare-source resolution in `history-service.ts`
- existing DB diff semantics as the basis for `DB vs DB`
- existing `DbManagementWorkspace` tabbed shell
- existing graph rendering stack `@xyflow/react + elkjs`
- a new dedicated `db-vs-db` workspace component

### Avoid

- new standalone compare storage models unless the existing compare-source union truly blocks the design
- coupling Phase 1 to apply/deploy state
- introducing a deep settings matrix for rename policy
- overloading `DbDiffWorkspace` with both file-first and DB-vs-DB state if it makes the mental model muddy

## Confidence and Unknowns

### High Confidence

- Reusing the canonical compare + graph stack is the right architecture for this phase.
- `DB vs DB` should be a new main view under `DB 管理`.
- Rename policy should be low-complexity and settings-driven.

### Medium Confidence

- The current history-service and diff-service seams are close to reusable as-is, but planner should verify whether directional preview needs a thin transform layer or a dedicated artifact builder.
- Settings persistence location for rename policy should be extension-specific; planner should confirm whether to extend existing settings tables or add a dedicated DB-management settings record.

### Needs Planning Attention

- The phase directory naming now has a milestone-collision issue because `v1.0` already used `01-*`; planning should account for that before relying on stock GSD phase-path assumptions.
- Future tools may need a milestone-aware phase-directory convention if `v1.1` is going to keep using standard GSD flows alongside preserved `v1.0` artifacts.

---

*Phase: 01-cross-database-compare-v1_1*
*Research complete: 2026-03-18*
