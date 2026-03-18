# Phase 5: Apply, History, and Visualization - Research

**Researched:** 2026-03-17
**Domain:** MySQL safe-apply orchestration, immutable schema history, ER-style graph visualization inside `DB 管理`
**Confidence:** MEDIUM

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- The main day-to-day reference should be the user-selected xlsx version, not only the most recent successful apply result.
- Users should be able to compare `A.xlsx` or `A-v2.xlsx` against the current live DB and decide whether the document or the DB is newer.
- “Baseline” in this phase should therefore not be modeled only as “last successful deployment state.”
- DB snapshots should not be manual.
- Each DB scan or refresh should automatically run the diff/hash logic against the latest stored snapshot for the same connection and database.
- A new snapshot version should be created only when the scanned DB schema actually changed.
- If a scan finds no structural change, the system should update recent scan state but should not add a duplicate history version.
- The product should provide a dedicated DB history panel, not just hidden stored snapshots.
- That history view should default to showing what changed relative to the previous changed snapshot.
- Users should also be able to switch comparison targets and compare the current live DB against any stored snapshot.
- `snapshot <=> snapshot` comparison should be supported, not just `live DB <=> snapshot`.
- Phase 5 apply should execute only safe, automatically executable schema changes.
- High-risk and destructive changes should still be surfaced in diff, history, and SQL review, but should remain blocked from execution in this phase.
- The user explicitly does not want risky changes to become executable merely through a confirmation dialog.
- After apply completes, the user should first see an execution summary.
- From there, they should be able to drill down into per-table and per-SQL execution details.
- Execution results should behave like a traceable job record, not a simple toast-level success/failure message.
- Users should be allowed to select only some tables from the current safe diff result for execution.
- Tables with blockers should be visibly disabled in the selection UI.
- Blocked tables should clearly display the reason they cannot be applied.
- The preferred schema view should render the whole currently selected database graph, not only the changed subset.
- Changed tables should be visually highlighted within that full-database view.
- For larger schemas, users should be able to filter or check only selected tables to render.
- A focused “changed tables plus neighboring relations” slice is acceptable as a filter mode, but not as the only visualization.
- `DB 管理` should offer both diff/history-oriented views and the graph view.
- Initial default should stay on the diff/history list experience.
- Afterward, the product should remember the user’s last active view.

### Claude's Discretion
- Exact labeling for “history,” “snapshot,” and “drift” as long as the workflow is understandable
- Exact execution summary layout, as long as summary-first and drilldown behavior remain intact
- Exact graph filtering controls, as long as full-database view and changed-table highlighting both exist
- Exact wording for blocked-table explanations, as long as users can immediately understand why selection is disabled

### Deferred Ideas (OUT OF SCOPE)
- Direct `DB <=> DB` schema comparison between two live databases
- Pre-stored xlsx templates and future `DDL -> XLSX` generation
- Risky/destructive apply flows guarded only by confirmation dialogs
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DIFF-02 | User can compare the last deployed baseline snapshot with the live target DB schema | Use one diff engine over canonical `DbSchemaCatalog` with compare-source unions for `file`, `live`, and `snapshot`; keep immutable snapshots plus per-scan events so live-vs-snapshot and snapshot-vs-snapshot both reuse the same diff pipeline. |
| DEPL-03 | User can apply approved non-destructive schema changes to the target DB and see per-object execution results | Reuse Phase 4 preview artifacts as the apply plan, gate execution by plan hash plus current snapshot hash, run one statement at a time on a leased `mysql2` connection, and persist job/table/statement results. |
| DEPL-04 | App records deployment jobs and baseline snapshots per target connection and schema | Keep content-addressed `db_schema_snapshots` immutable; add scan-event and deploy-job tables that reference connection, schema, baseline snapshot, and post-apply snapshot. |
| VIZ-02 | User can open an ER-style schema diagram that highlights changed tables and relationships | Build a graph DTO from canonical schema FKs, render it with `@xyflow/react`, lay it out with `elkjs`, and support full-db plus changed-neighbors filter modes. |
</phase_requirements>

## Summary

Phase 5 should not introduce a second deployment subsystem or a second diff engine. The repo already has the correct seams: canonical live-schema snapshots, blocker-aware diffing, typed route contracts, SQLite-backed desktop state, and a DB-focused workspace. The right move is to extend those seams into three immutable records: changed-only schema snapshots, scan/apply event history, and per-statement deployment jobs.

The most important unknown for planning is MySQL execution behavior. MySQL 8.4 documents that DDL statements cause implicit commits, while atomic DDL is scoped to a single statement, not an entire multi-statement batch. That means Phase 5 cannot honestly promise transactional rollback for an apply job. The safe architecture is therefore preview-hash-gated execution, one statement at a time, stop on failure, persist every result row, and always re-introspect after the job to record the resulting live state.

For visualization, current React Flow guidance is to use the v12 `@xyflow/react` package and pair it with an external layout engine. Its own docs explicitly say React Flow does not ship layouting; for full-schema FK graphs, `elkjs` is the better fit than `dagre` because React Flow also documents that dagre does not route edges and has a known sub-flow limitation. Build the graph as another `DB 管理` mode, default to the existing list/diff workflow, and remember the last active view.

**Primary recommendation:** Implement Phase 5 as `preview -> plan hash -> apply job -> post-apply re-scan`, backed by immutable snapshots plus scan/deploy event tables, and render schema graphs with `@xyflow/react` plus `elkjs` rather than custom SVG/layout code.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `mysql2` | 3.20.0 | Lease one MySQL connection per apply job and execute statements sequentially | Already in the repo; official Promise wrapper supports pools, `getConnection`, `query`, and `execute` |
| `drizzle-orm` | 0.45.1 | Persist snapshots, scan events, deploy jobs, and statement results in the local app database | Already the repo’s typed persistence layer |
| `better-sqlite3` | 12.6.2 | Desktop-local durable store for operational history | Already the Electron-mode storage backend |
| `@tanstack/react-query` | 5.60.5 | Drive compare/apply/history/graph queries and mutation invalidation | Already the repo’s server-state pattern |
| `@xyflow/react` | 12.x | Interactive ER-style canvas with controlled nodes/edges, utilities, minimap, and viewport tools | Current React Flow v12 package; suited to in-app graph workflows |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `elkjs` | 0.10.0 | Layered graph layout for full-schema FK diagrams | Use for initial graph layout and filter-mode re-layouts |
| `zod` | 3.24.2 | Typed contracts for new history/apply/graph APIs | Use for every new route and persisted record schema |
| `date-fns` | 3.6.0 | Format scan/apply timestamps and durations | Use in job history and snapshot history lists |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@xyflow/react` + `elkjs` | Mermaid | Mermaid is faster to start but too static for full-db pan/zoom, highlight, filter, and drilldown workflows |
| `elkjs` | `@dagrejs/dagre` | Dagre is simpler but React Flow documents no edge routing and a sub-flow limitation, which is a bad fit for dense FK graphs |
| Preview-artifact execution | Knex/Umzug/Flyway | Migration frameworks are good for authored migrations, not for on-demand diff-generated plans with per-table safe gating |

**Installation:**
```bash
npm install @xyflow/react elkjs
```

## Architecture Patterns

### Recommended Project Structure
```text
server/lib/extensions/db-management/
├── apply-service.ts          # plan-hash validation, statement execution, job recording
├── history-service.ts        # snapshot history, scan events, snapshot-to-live compare
├── graph-service.ts          # canonical schema -> graph DTO transformation
├── db-diff-service.ts        # existing compare/preview seam, extended for snapshot sources
└── snapshot-service.ts       # existing hash/dedupe seam, extended with scan-event writes

server/routes/
└── db-management-routes.ts   # new history/apply/graph endpoints beside existing preview routes

client/src/components/db-management/
├── DbManagementWorkspace.tsx # view-mode shell and last-view persistence
├── DbDiffWorkspace.tsx       # existing default operational list/diff view
├── DbHistoryPanel.tsx        # snapshot/deploy history and drilldown
├── DbApplyPanel.tsx          # selectable safe changes and execution summary
└── DbSchemaGraph.tsx         # React Flow graph mode

client/src/hooks/
└── use-db-management.ts      # new history/apply/graph hooks using typed routes

shared/
├── schema.ts                 # snapshot event, deploy job, graph DTO schemas
└── routes.ts                 # typed history/apply/graph endpoints
```

### Pattern 1: Immutable Snapshots Plus Event Tables
**What:** Keep `db_schema_snapshots` content-addressed and append-only, and add separate event tables for scans and deploy jobs.
**When to use:** Always. Requirement DEPL-04 needs both deduped schema versions and a visible operational history.
**Example:**
```typescript
// Source: repository patterns in shared/schema.ts + server/lib/extensions/db-management/snapshot-service.ts
type DbSchemaScanEvent = {
  id: string;
  connectionId: number;
  databaseName: string;
  previousSnapshotId?: number;
  currentSnapshotId: number;
  changed: boolean;
  trigger: "manual_refresh" | "post_apply" | "compare_refresh";
  createdAt: string;
};

type DbDeployJob = {
  id: string;
  connectionId: number;
  databaseName: string;
  baselineSnapshotId: number;
  resultSnapshotId?: number;
  planHash: string;
  status: "pending" | "running" | "completed" | "failed" | "partial";
  createdAt: string;
  finishedAt?: string;
};
```

### Pattern 2: One Diff Engine With Typed Compare Sources
**What:** Extend the current canonical-schema diff path so file-vs-live, live-vs-snapshot, and snapshot-vs-snapshot all use the same matching and blocker logic.
**When to use:** For DIFF-02, DEPL-03 preconditions, history compare, and graph highlighting.
**Example:**
```typescript
// Source: repository pattern in shared/routes.ts and shared/schema.ts
const dbCompareSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("file"), fileId: z.number(), sheetName: z.string(), tableName: z.string().optional() }),
  z.object({ kind: z.literal("live"), connectionId: z.number(), databaseName: z.string(), refresh: z.boolean().default(false) }),
  z.object({ kind: z.literal("snapshot"), snapshotId: z.number() }),
]);

const dbHistoryCompareRequestSchema = z.object({
  left: dbCompareSourceSchema,
  right: dbCompareSourceSchema,
});
```

### Pattern 3: Preview Artifacts Become the Execution Plan
**What:** Apply must consume the exact statement list produced during preview, not regenerate SQL from scratch at click time.
**When to use:** Every apply flow.
**Example:**
```typescript
// Source: repository pattern in server/lib/extensions/db-management/db-diff-service.ts
type DbApplyRequest = {
  planHash: string;
  compareHash: string;
  selectedEntityKeys: string[];
  statements: DbSqlPreviewStatement[];
};

// Apply service responsibilities:
// 1. Verify current live snapshot hash still matches compareHash
// 2. Filter statements by selectedEntityKeys
// 3. Execute each statement in order
// 4. Persist per-statement result rows
// 5. Re-introspect and persist the resulting live snapshot
```

### Pattern 4: Dedicated Connection Per Apply Job
**What:** Lease one MySQL connection from the pool for the full job and execute statements sequentially on that session.
**When to use:** Every apply job.
**Example:**
```typescript
// Source: https://sidorares.github.io/node-mysql2/docs/documentation/promise-wrapper
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host,
  user,
  password,
  database,
  waitForConnections: true,
  connectionLimit: 4,
  queueLimit: 0,
});

const connection = await pool.getConnection();
try {
  for (const statement of statements) {
    await connection.query(statement.sql);
  }
} finally {
  connection.release();
}
```

### Pattern 5: Graph Mode Is a Derived View, Not a Second Schema Model
**What:** Build graph nodes and FK edges from canonical `DbSchemaCatalog`, then filter or highlight in the client without inventing a separate persistence model.
**When to use:** For the full-db view, changed-only highlight, and changed-plus-neighbors slice mode.
**Example:**
```typescript
// Source: https://reactflow.dev/api-reference/utils/get-connected-edges
// Source: https://reactflow.dev/api-reference/utils/get-incomers
// Source: https://reactflow.dev/api-reference/utils/get-outgoers
import { getConnectedEdges, getIncomers, getOutgoers } from "@xyflow/react";

function buildFocusedSlice(changedNodes, allNodes, allEdges) {
  const focusedIds = new Set(changedNodes.map((node) => node.id));

  for (const node of changedNodes) {
    for (const neighbor of getIncomers(node, allNodes, allEdges)) focusedIds.add(neighbor.id);
    for (const neighbor of getOutgoers(node, allNodes, allEdges)) focusedIds.add(neighbor.id);
  }

  const focusedNodes = allNodes.filter((node) => focusedIds.has(node.id));
  const focusedEdges = getConnectedEdges(focusedNodes, allEdges);
  return { focusedNodes, focusedEdges };
}
```

### Anti-Patterns to Avoid
- **Separate diff logic for history compare:** snapshot-vs-live and snapshot-vs-snapshot should reuse the same canonical compare service, not fork it.
- **Executing the concatenated `artifact.sql` blob with `multipleStatements`:** the current preview already produces statement objects; execute those rows individually.
- **Updating existing snapshot rows in place:** immutable snapshots plus separate event rows make drift and job history trustworthy.
- **Re-running ELK on every selection or drag event:** layout only on schema/filter changes; interactive pan/zoom is React Flow’s job.
- **Treating graph mode as the new default landing view:** the user explicitly wants diff/history to remain the default operational mode.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Interactive schema canvas | Custom SVG pan/zoom/select/minimap system | `@xyflow/react` | Canvas interaction, viewport control, and graph utilities are already solved |
| Full-schema FK layout | Manual coordinate algorithm | `elkjs` | Port-aware layered layout is harder than it looks; React Flow explicitly expects an external layout engine |
| Neighbor-slice graph traversal | Ad hoc edge walking utilities | `getConnectedEdges`, `getIncomers`, `getOutgoers` from `@xyflow/react` | These utilities already cover the “changed plus related tables” filter mode |
| SQL splitting at apply time | Splitting `artifact.sql` on semicolons | Persist and execute `DbSqlPreviewStatement[]` | SQL text splitting is brittle; the repo already has statement-level artifacts |
| Deploy/audit history logs | JSON files under app data | Drizzle-backed SQLite tables | Queryable, typed, filterable history is required for DEPL-04 |
| Batch rollback semantics | Custom compensating DDL/pretend transaction wrapper | Stop-on-failure job model plus post-job re-introspection | MySQL DDL implicitly commits, so fake rollback guarantees will break trust |

**Key insight:** Hand-roll only the domain-specific policy layer: which changes are safe, how plan hashes are validated, and how history/drift is surfaced. Do not hand-roll graph primitives, layout, or SQL statement parsing.

## Common Pitfalls

### Pitfall 1: Assuming Apply Can Be One Transaction
**What goes wrong:** The UI promises rollback or “all-or-nothing” behavior that MySQL cannot guarantee for a batch of DDL statements.
**Why it happens:** It is easy to apply general migration-tool intuition to MySQL DDL.
**How to avoid:** Execute one statement at a time, persist each result row, stop on first failure, and always re-scan the live schema at the end.
**Warning signs:** Product copy mentions “rollback on failure,” or the apply service tries to wrap all DDL in one transaction.

### Pitfall 2: Letting “Safe Apply” Creep Into PK, FK, and Rebuild Operations
**What goes wrong:** Phase 5 starts auto-running changes that are non-destructive in theory but operationally risky in real MySQL tables.
**Why it happens:** “Non-destructive” is broader than “cheap, online, and conservative.”
**How to avoid:** Start with a narrow safe set:
- `CREATE TABLE`
- `ADD COLUMN` only when the new column is nullable or otherwise server-valid without backfill work
- selected widening-only column changes where the current blocker model already proves no shrink and no nullability tightening

Keep these preview-only in Phase 5:
- table/column drops
- PK changes
- FK adds/changes
- nullability tightening
- type rewrites/shrinks
- any statement that requires manual data remediation
**Warning signs:** New blocker codes are removed just to make apply pass, or rename/FK/PK operations appear in the selectable set without deeper validation.

### Pitfall 3: Snapshot Dedupe Erases Operational History
**What goes wrong:** Repeated scans with “no schema change” disappear, so users cannot tell when the DB was last checked or when drift began.
**Why it happens:** The current snapshot store dedupes correctly by hash, but dedupe alone is not history.
**How to avoid:** Add scan-event rows for every refresh, with `changed` plus `previousSnapshotId/currentSnapshotId`, while keeping snapshots themselves deduped.
**Warning signs:** History views can only show changed snapshots and cannot answer “when did we last scan this DB?”

### Pitfall 4: Recomputing SQL After Preview
**What goes wrong:** The user approves one diff state, but the apply click executes a newly generated plan against a newer live DB.
**Why it happens:** Preview and apply reuse the same service but do not freeze the approved plan.
**How to avoid:** Hash compare context plus approved rename decisions, persist the exact statement list, and reject apply if the current live snapshot hash changed after preview.
**Warning signs:** Apply requests carry only `fileId/sheetName/databaseName` and no plan hash or snapshot hash.

### Pitfall 5: Using Dagre for Dense ER Graphs and Fighting It Later
**What goes wrong:** Large schemas become unreadable and the layout engine becomes the bottleneck for future fixes.
**Why it happens:** Dagre feels simpler up front.
**How to avoid:** Use `elkjs` from the start for full-schema FK diagrams; React Flow documents that dagre does not route edges and has a known sub-flow limitation.
**Warning signs:** Graph requirements start accumulating exceptions such as “skip certain tables,” “don’t cross edges,” or “manually reposition this section.”

### Pitfall 6: Making the Graph Recompute on Every Interaction
**What goes wrong:** The graph mode feels slow or frozen on medium-sized schemas.
**Why it happens:** Layout and filtering are tied directly to transient node/selection state.
**How to avoid:** Keep graph input DTOs stable, run layout only when schema/filter changes, use `onlyRenderVisibleElements`, and keep selection/filter state outside the full nodes array where practical.
**Warning signs:** Every click triggers a layout promise, or the component rebuilds all nodes/edges from scratch on selection changes.

### Pitfall 7: Planning Against Pre-v12 React Flow Knowledge
**What goes wrong:** The implementation follows stale `reactflow` package naming or outdated APIs.
**Why it happens:** React Flow v12 moved to `@xyflow/react`.
**How to avoid:** Plan explicitly against the current v12 docs and package name.
**Warning signs:** New code imports from `reactflow` instead of `@xyflow/react`.

## Code Examples

Verified patterns from official sources:

### MySQL Apply Connection Pattern
```typescript
// Source: https://sidorares.github.io/node-mysql2/docs/documentation/promise-wrapper
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host,
  user,
  password,
  database,
  waitForConnections: true,
  connectionLimit: 4,
  queueLimit: 0,
});

const connection = await pool.getConnection();
try {
  for (const statement of statements) {
    await connection.query(statement.sql);
  }
} finally {
  connection.release();
}
```

### Controlled Graph State Pattern
```typescript
// Source: https://reactflow.dev/api-reference/utils/add-edge
// Source: https://reactflow.dev/api-reference/utils/apply-edge-changes
import { ReactFlow, addEdge, useNodesState, useEdgesState } from "@xyflow/react";

const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

function onConnect(connection) {
  setEdges((current) => addEdge(connection, current));
}

return (
  <ReactFlow
    nodes={nodes}
    edges={edges}
    onNodesChange={onNodesChange}
    onEdgesChange={onEdgesChange}
    onConnect={onConnect}
    onlyRenderVisibleElements
    fitView
  />
);
```

### Changed-Tables-Plus-Neighbors Slice
```typescript
// Source: https://reactflow.dev/api-reference/utils/get-connected-edges
// Source: https://reactflow.dev/api-reference/utils/get-incomers
// Source: https://reactflow.dev/api-reference/utils/get-outgoers
import { getConnectedEdges, getIncomers, getOutgoers } from "@xyflow/react";

function buildNeighborSlice(changedNodes, nodes, edges) {
  const ids = new Set(changedNodes.map((node) => node.id));

  for (const node of changedNodes) {
    for (const incoming of getIncomers(node, nodes, edges)) ids.add(incoming.id);
    for (const outgoing of getOutgoers(node, nodes, edges)) ids.add(outgoing.id);
  }

  const sliceNodes = nodes.filter((node) => ids.has(node.id));
  const sliceEdges = getConnectedEdges(sliceNodes, edges);
  return { sliceNodes, sliceEdges };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `reactflow` package naming and v11-era examples | `@xyflow/react` v12 docs and APIs | React Flow v12 migration guide; current docs updated February 2026 | New Phase 5 code should target current package names and current docs, not stale snippets |
| Static ER rendering or custom SVG | Controlled React Flow canvas plus external layout engine | Current React Flow docs explicitly separate rendering from layouting | Enables full-db view, highlight, fit-to-selection, filter modes, and remembered view state |
| “Wrap the deploy in one transaction” intuition | Statement-scoped atomic DDL plus batch-level implicit commits | Current MySQL 8.4 docs | Apply UX must be job-based and reconciled by post-run re-scan, not transaction-based |
| Baseline as only “last successful deploy” | Changed-only immutable snapshots plus all scan/apply events | Required by current user constraints and consistent with DB-management tooling | Supports drift analysis even when users never apply from the app |

**Deprecated/outdated:**
- Importing new graph code from `reactflow`: use `@xyflow/react`.
- Treating dagre as the default layout for full relational graphs: it is fine for simple flows, but not the right default for this phase’s ER graph.
- Executing one concatenated SQL script and hoping MySQL can roll it back: persist statement rows and treat apply as an auditable job.

## Open Questions

1. **How narrow should the initial safe-apply set be?**
   - What we know: MySQL docs make batch rollback impossible, and current blocker codes already identify several risky classes.
   - What's unclear: Whether Phase 5 should allow confirmed rename operations or widening-only `MODIFY COLUMN` cases on day one.
   - Recommendation: Start with `CREATE TABLE` plus narrowly validated additive/widening operations, and keep rename/FK/PK changes preview-only unless the implementation adds explicit dependency checks.

2. **How large are the real-world schemas that will hit graph mode first?**
   - What we know: The user wants full-db view plus filters, not changed-only view.
   - What's unclear: Whether the first target schemas are dozens of tables or several hundred.
   - Recommendation: Ship full-db plus changed-neighbors filters, `onlyRenderVisibleElements`, and remembered view mode first; profile before adding worker-based layout complexity.

3. **Does the product need live progress during long ALTER statements in Phase 5?**
   - What we know: MySQL exposes ALTER progress through Performance Schema stage tables when enabled.
   - What's unclear: Whether the user needs live percentage updates now, or only durable per-statement final results.
   - Recommendation: Treat live progress as optional. The required v1 bar is durable summary plus drilldown after execution.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node built-in test runner + `tsx` 4.20.5 |
| Config file | none — test commands are in `package.json` |
| Quick run command | `node --test --import tsx test/server/db-apply-phase5.test.ts test/server/db-history-phase5.test.ts test/client/db-management-phase5-ui.test.tsx` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DIFF-02 | Compare live DB against stored snapshots and compare snapshot-to-snapshot | server unit/integration | `node --test --import tsx test/server/db-history-phase5.test.ts` | ❌ Wave 0 |
| DEPL-03 | Apply only approved safe changes and persist per-object/per-statement results | server unit/integration | `node --test --import tsx test/server/db-apply-phase5.test.ts` | ❌ Wave 0 |
| DEPL-04 | Persist deploy jobs and changed-only snapshots per connection/schema | server unit | `node --test --import tsx test/server/db-apply-phase5.test.ts test/server/db-history-phase5.test.ts` | ❌ Wave 0 |
| VIZ-02 | Render graph mode, highlight changed tables, expose filter modes, remember last view | client structural/UI | `node --test --import tsx test/client/db-management-phase5-ui.test.tsx` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `node --test --import tsx test/server/db-apply-phase5.test.ts test/server/db-history-phase5.test.ts test/client/db-management-phase5-ui.test.tsx`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `test/server/db-apply-phase5.test.ts` — covers DEPL-03 and the DEPL-04 apply-job write path
- [ ] `test/server/db-history-phase5.test.ts` — covers DIFF-02 and changed-only snapshot history behavior
- [ ] `test/client/db-management-phase5-ui.test.tsx` — covers VIZ-02 and last-view persistence in `DB 管理`
- [ ] `test/server/db-phase5-fixtures.ts` — canonical schema/snapshot/job fixtures shared by history/apply tests

## Sources

### Primary (HIGH confidence)
- Repository source: `server/lib/extensions/db-management/snapshot-service.ts` — current snapshot hashing/dedupe seam
- Repository source: `server/lib/extensions/db-management/db-diff-service.ts` — current blocker model, SQL preview, and dry-run artifacts
- Repository source: `server/routes/db-management-routes.ts` — existing DB-management route group
- Repository source: `client/src/components/db-management/DbManagementWorkspace.tsx` — current workspace shell and default UX shape
- Repository source: `client/src/hooks/use-db-management.ts` — existing React Query mutation/query pattern
- Repository source: `shared/schema.ts` and `shared/routes.ts` — typed contracts and canonical live-schema model
- MySQL 8.4 Reference Manual: https://dev.mysql.com/doc/refman/8.4/en/implicit-commit.html
- MySQL 8.4 Reference Manual: https://dev.mysql.com/doc/refman/8.4/en/atomic-ddl.html
- MySQL 8.4 Reference Manual: https://dev.mysql.com/doc/refman/8.4/en/innodb-online-ddl-operations.html
- mysql2 Promise Wrapper docs: https://sidorares.github.io/node-mysql2/docs/documentation/promise-wrapper
- React Flow layouting docs: https://reactflow.dev/learn/layouting/layouting
- React Flow v12 migration docs: https://reactflow.dev/learn/troubleshooting/migrate-to-v12
- React Flow performance docs: https://reactflow.dev/learn/advanced-use/performance
- React Flow API reference: https://reactflow.dev/api-reference/react-flow
- React Flow utils: https://reactflow.dev/api-reference/utils/get-connected-edges
- React Flow utils: https://reactflow.dev/api-reference/utils/get-incomers
- React Flow utils: https://reactflow.dev/api-reference/utils/get-outgoers

### Secondary (MEDIUM confidence)
- npm package page for `elkjs` current release line: https://www.npmjs.com/package/elkjs
- npm package page for `@xyflow/react` current release line: https://www.npmjs.com/package/@xyflow/react
- ELK layered algorithm reference: https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - mostly existing repo libraries plus official docs for the one new graph stack
- Architecture: MEDIUM - derived from official DB/graph constraints plus the repo’s current seams; exact safe-set breadth remains a product choice
- Pitfalls: HIGH - directly backed by MySQL and React Flow docs and by the current Phase 4 implementation

**Research date:** 2026-03-17
**Valid until:** 2026-04-16
