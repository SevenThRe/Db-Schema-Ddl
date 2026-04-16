# Phase 23 — UI Review

**Audited:** 2026-04-12
**Baseline:** Abstract 6-pillar standards + historical DB workbench contract from `01-usable-workbench-v1_4/01-UI-SPEC.md`
**Screenshots:** not captured (no dev server detected on `localhost:3000`, `5173`, or `8080`)
**Scope note:** This audit was run against the current worktree UI implementation because no active phase pointer existed. Phase 23 is used as the fallback review slot from `.planning/STATE.md`.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 1/4 | The workbench mixes English, Simplified Chinese, and leftover migration copy inside the same operator flow. |
| 2. Visuals | 2/4 | The editor is no longer the dominant focal point; stacked chrome and multi-purpose panes compete for attention. |
| 3. Color | 3/4 | Most workbench surfaces stay on tokenized neutrals, but semantic colors are doing too much readability work because typography is undersized. |
| 4. Typography | 1/4 | The workbench relies heavily on `9px`/`10px`/`11px` text, pushing critical metadata below a comfortable desktop readability floor. |
| 5. Spacing | 2/4 | Fixed-height bars and stacked status regions compress the actual data surface, especially inside the lower result pane. |
| 6. Experience Design | 2/4 | The shell still exposes multiple overlapping workspace paths, and several advanced tools are attached to the wrong surface. |

**Overall: 11/24**

---

## Top 3 Priority Fixes

1. **Make the SQL editor primary again** — the current shell puts a tab bar, a snippet/history bar, an editor toolbar, and a five-way result multiplexer around the same workspace — move snippets/history into a secondary surface and break non-result tools out of the result tab strip.
2. **Normalize workbench language and tone** — pick one operator language for the workbench and route all strings through one copy system; the current English/Chinese mix makes the product look partially wired and lowers trust.
3. **Raise the type floor to 12px/13px and remove `9px` labels** — the current sidebar and result affordances are too compressed to scan reliably, so the interface depends on memorization instead of legibility.

---

## Detailed Findings

### Pillar 1: Copywriting (1/4)

- `client/src/components/extensions/db-workbench/ConnectionSidebar.tsx:668` shows `数据库当前不可连接`, while the same sidebar still uses English labels such as `Switch connection`, `Schema`, `Object Explorer`, and `Loading schema...` at `537`, `596`, `619`, and `676`.
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx:672`, `1239`, and `1380` raise toasts titled `数据库当前不可连接`, `查询执行失败`, and `Explain 执行失败`, but surrounding controls are English (`Save snippet`, `Recent SQL`, `Results`, `Explain`, `Inspect`) at `2523-2579` and `2616-2634`.
- `client/src/components/extensions/db-workbench/ResultGridPane.tsx:625-641`, `client/src/components/extensions/db-workbench/ObjectInspectionPane.tsx:49-56`, and `client/src/components/extensions/db-workbench/ExplainPlanPane.tsx:275-279` use Chinese success/error toasts even though their panels otherwise speak English.
- `client/src/components/extensions/db-workbench/ObjectInspectionPane.tsx:76-80` and `client/src/components/extensions/db-workbench/SchemaDiffPane.tsx:34-35`, `104-105`, `212` mix Chinese instructional copy with English technical labels inside the same pane, which reads like unfinished migration rather than intentional localization.

### Pillar 2: Visuals (2/4)

- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx:2511-2583` inserts a second toolbar layer for snippets and recent SQL directly between the query tabs and the editor. Combined with the editor toolbar in `client/src/components/extensions/db-workbench/SqlEditorPane.tsx:609-687`, the main focal area starts only after three stacked control bars.
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx:2609-2634` turns the lower pane into a five-way tab strip (`Results`, `Explain`, `Schema Diff`, `Sync`, `Inspect`). That panel is no longer a results area; it is a mini app-switcher competing with the editor.
- `client/src/components/extensions/db-workbench/ConnectionSidebar.tsx:472-530` and `616-626` present dense status, driver, group, schema, and explorer summaries in one narrow block without enough typographic separation to establish a clear hierarchy.

### Pillar 3: Color (3/4)

- The workbench mostly stays on tokenized neutrals and semantic accents, which is the strongest part of the current implementation. Evidence: `SqlEditorPane.tsx:610`, `ResultGridPane.tsx:881`, `WorkbenchLayout.tsx:2609`, and `DangerousSqlDialog.tsx:182-191`.
- The main weakness is that semantic colors are compensating for compressed text rather than reinforcing already readable structure. Examples include `ConnectionSidebar.tsx:749-775`, `ExplainPlanPane.tsx:148-155`, and `ResultGridPane.tsx:1022-1024`, where amber/green badges are attached to `9px` or `10px` text.

### Pillar 4: Typography (1/4)

- Workbench files currently contain **13** occurrences of `text-[9px]`, **74** of `text-[10px]`, and **77** of `text-[11px]`, with only **11** `text-sm` uses. This is far below the historical workbench contract that centered body/heading readability around `12px`/`13px`.
- `client/src/components/extensions/db-workbench/ConnectionSidebar.tsx:693`, `749`, `770`, `811`, `852`, `897`, `946`, and `993` use `text-[9px]` tags for important object-state markers such as `active`, `DDL`, `PK`, and `NN`.
- `client/src/components/extensions/db-workbench/ExplainPlanPane.tsx:148-155` uses `text-[9px]` badges inside graph nodes, which makes the risk markers difficult to scan even though they represent critical execution-plan information.
- `client/src/components/extensions/db-workbench/ResultGridPane.tsx:863-876`, `975-1024`, and `1116-1170` packs counts, staged-edit summaries, and commit actions into `10px`/`11px` metadata bands that should remain readable at a glance during live database work.

### Pillar 5: Spacing (2/4)

- `client/src/components/extensions/db-workbench/ResultGridPane.tsx:608-616` hard-codes header, filter, status, and inspector heights, then subtracts them from the container. On smaller windows this guarantees that the actual row grid is the first thing to collapse.
- `client/src/components/extensions/db-workbench/ResultGridPane.tsx:941-1057` stacks footer status, pending-row summary, commit controls, and the selected-row inspector one after another. That is too many vertical regions for a pane that defaults to only 40% of the workspace height.
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx:2586-2606` gives the lower pane a default size of `40`, but `ResultGridPane` assumes several more fixed-height strips inside it. The pane budget and the child layout model are misaligned.

### Pillar 6: Experience Design (2/4)

- `client/src/components/extensions/DbConnectorWorkspace.tsx:985-1045` still presents `连接中心`, `Database workspace`, and legacy `Schema` / `Diff` side by side. The shell literally labels part of its own navigation as `Legacy`, which is honest, but still leaves the operator choosing between overlapping routes instead of following one canonical flow.
- `client/src/components/extensions/DbConnectorWorkspace.tsx:1363-1490` keeps fully interactive legacy schema/diff tools reachable, while `1495-1529` introduces the new unified workspace. This preserves migration safety but weakens product coherence.
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx:871-904` saves snippets through `window.prompt(...)`. That breaks the desktop-workbench feel, blocks the UI with a browser-native modal, and bypasses the app's own validation/layout patterns.
- `client/src/components/extensions/db-workbench/WorkbenchLayout.tsx:2717-2855` and `2858-2890` embed schema compare and data sync setup directly into the results pane. Those are workflow-level tasks, not alternate result tabs, so they feel bolted on instead of staged.

---

## Registry Safety

Registry audit: `components.json` exists, but the relevant workbench UI contract declares no third-party registries. No registry flags were applicable.

---

## Files Audited

- `E:\work\Db-Schema-Ddl\client\src\components\extensions\DbConnectorWorkspace.tsx`
- `E:\work\Db-Schema-Ddl\client\src\components\extensions\db-workbench\ConnectionSidebar.tsx`
- `E:\work\Db-Schema-Ddl\client\src\components\extensions\db-workbench\DangerousSqlDialog.tsx`
- `E:\work\Db-Schema-Ddl\client\src\components\extensions\db-workbench\ExplainPlanPane.tsx`
- `E:\work\Db-Schema-Ddl\client\src\components\extensions\db-workbench\GridEditCommitDialog.tsx`
- `E:\work\Db-Schema-Ddl\client\src\components\extensions\db-workbench\ObjectInspectionPane.tsx`
- `E:\work\Db-Schema-Ddl\client\src\components\extensions\db-workbench\QueryTabs.tsx`
- `E:\work\Db-Schema-Ddl\client\src\components\extensions\db-workbench\ResultGridPane.tsx`
- `E:\work\Db-Schema-Ddl\client\src\components\extensions\db-workbench\SchemaDiffPane.tsx`
- `E:\work\Db-Schema-Ddl\client\src\components\extensions\db-workbench\SqlEditorPane.tsx`
- `E:\work\Db-Schema-Ddl\client\src\components\extensions\db-workbench\WorkbenchLayout.tsx`
- `E:\work\Db-Schema-Ddl\client\src\components\Sidebar.tsx`
- `E:\work\Db-Schema-Ddl\client\src\pages\Dashboard.tsx`
- `E:\work\Db-Schema-Ddl\.planning\phases\01-usable-workbench-v1_4\01-UI-SPEC.md`
- `E:\work\Db-Schema-Ddl\.planning\phases\01-usable-workbench-v1_4\01-01-SUMMARY.md`
- `E:\work\Db-Schema-Ddl\.planning\phases\19-trusted-query-continuity\19-01-SUMMARY.md`
- `E:\work\Db-Schema-Ddl\.planning\phases\23-release-safety-foundations\23-01-SUMMARY.md`
