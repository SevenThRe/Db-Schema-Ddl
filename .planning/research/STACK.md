# Technology Stack — DB 工作台 New Features

**Project:** DB 工作台 (v1.4, upgrade of `db-connector` builtin extension)
**Researched:** 2026-03-24
**Scope:** Stack additions only — what the new workbench features need beyond what is already present.

---

## Already Present — Do Not Re-add

The following are confirmed in `package.json` and `src-tauri/Cargo.toml`. Do not introduce duplicates.

| Library | Version in repo | Role |
|---------|----------------|------|
| `@monaco-editor/react` | ^4.7.0 | SQL editor React wrapper |
| `monaco-editor` | ^0.55.1 | Core editor (peer dep) |
| `@xyflow/react` | ^12.8.4 | Node graph canvas for ER diagram and explain plan |
| `elkjs` | ^0.10.0 | Auto-layout engine for xyflow |
| `react-window` | ^2.2.6 | Virtual scroll for result grid |
| `sqlx` (Rust) | 0.8 | DB query execution, MySQL + PostgreSQL drivers |
| `tokio` (Rust) | 1 | Async runtime; `sync` feature already enabled |
| `sqlparser` (Rust) | 0.53 | SQL AST parsing for dangerous SQL detection |
| `serde` / `serde_json` (Rust) | 1.0 | JSON serialization |

---

## New Frontend Dependency: SQL Formatter

### Recommendation: `sql-formatter` ^15.7.2

**Install:**
```bash
npm install sql-formatter
```

**Why this library, not hand-rolling:**
- Actively maintained (v15.7.2, published ~Feb 2026, 499+ dependents).
- Supports both `mysql` and `postgresql` dialect modes out of the box — matches the two dialects already in the Rust backend.
- Tree-shakeable ESM; no runtime overhead for unused dialects.
- Preserves SQL comments, which is a hard requirement from design doc §5.2.
- The alternative `@sqltools/formatter` is unmaintained (last publish 2021). `prettier-plugin-sql` requires Prettier runtime, which is unacceptable for an in-editor keybinding.

**API used for EDIT-04 (Alt+Shift+F):**
```ts
import { format } from 'sql-formatter';

// Format selection or full content, dialect from active connection
const formatted = format(sql, {
  language: dialect === 'mysql' ? 'mysql' : 'postgresql',
  keywordCase: 'upper',       // standard convention
  tabWidth: 2,
  linesBetweenQueries: 1,
});
```

**Key options used:**
- `language`: `'mysql'` | `'postgresql'` — maps directly from `DbConnectionConfig.dialect`
- `keywordCase: 'upper'` — consistent output, does not rewrite user identifiers
- `tabWidth: 2` — matches project Prettier config
- `linesBetweenQueries: 1` — clean multi-statement script output

**Confidence:** MEDIUM — version confirmed via npmjs.com search result; API confirmed via GitHub README fetch and npmjs description. No Context7 entry found.

---

## Monaco Autocomplete Provider (AUTO-01)

**No new dependency required.** `monaco-editor` ^0.55.1 already ships `monaco.languages.registerCompletionItemProvider`.

### Implementation pattern

Register once per language when the editor mounts. Store the returned `IDisposable` and call `dispose()` on connection switch or component unmount to avoid duplicate provider accumulation (a known pain point in `@monaco-editor/react`).

```ts
import * as monaco from 'monaco-editor';

// Call inside onMount callback of <Editor />
const disposable = monaco.languages.registerCompletionItemProvider('sql', {
  triggerCharacters: [' ', '.', '('],

  provideCompletionItems(model, position) {
    const wordInfo = model.getWordUntilPosition(position);
    const range = {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: wordInfo.startColumn,
      endColumn: wordInfo.endColumn,
    };

    const suggestions: monaco.languages.CompletionItem[] = [];

    // 1. Keyword completions (static list)
    SQL_KEYWORDS.forEach(kw => suggestions.push({
      label: kw,
      kind: monaco.languages.CompletionItemKind.Keyword,
      insertText: kw,
      range,
    }));

    // 2. Table name completions (from cached DbSchemaSnapshot)
    snapshot.tables.forEach(t => suggestions.push({
      label: t.name,
      kind: monaco.languages.CompletionItemKind.Class,
      insertText: t.name,
      detail: `table (${snapshot.schema})`,
      range,
    }));

    // 3. Column completions scoped to tables in FROM clause
    resolveFromClauseTables(model.getValue(), position).forEach(tableName => {
      const table = snapshot.tables.find(t => t.name === tableName);
      table?.columns.forEach(col => suggestions.push({
        label: col.name,
        kind: monaco.languages.CompletionItemKind.Field,
        insertText: col.name,
        detail: col.dataType,
        range,
      }));
    });

    return { suggestions };
  },
});

// On unmount or connection change:
disposable.dispose();
```

**Why no `monaco-sql-languages` (DTStack):**
- `monaco-sql-languages` is only guaranteed stable on `monaco-editor@0.37.1`; the project is on `0.55.1`. Version mismatch is a hard blocker.
- It brings `dt-sql-parser` (ANTLR4 grammar, ~800 KB gzipped) — significant bundle cost for a desktop app that only needs MySQL + PostgreSQL.
- The three-level completion model described in design doc §5.2 (keyword → schema-aware → alias-scoped) is fully achievable with native Monaco `registerCompletionItemProvider` and a lightweight FROM-clause scanner. This avoids a heavy parser dependency in Phase 1.

**FROM clause scanner:** A regex-based scanner (`/\bFROM\s+([\w.]+)(?:\s+(?:AS\s+)?(\w+))?/gi`) is sufficient for Phase 1. A full AST parser (e.g., `node-sql-parser` at ~300 KB) can be introduced in Phase 3 for alias resolution if required. Do not add it now.

**Confidence:** HIGH — `registerCompletionItemProvider` is documented on the official Monaco Editor TypeDoc site. Pattern confirmed via multiple implementation articles. `monaco-sql-languages` version incompatibility confirmed via their own README.

---

## elkjs Layout API for ER Diagram and Explain Plan (ER-01, PLAN-01)

**No new dependency required.** `elkjs` ^0.10.0 and `@xyflow/react` ^12.8.4 are already present.

### Layout configuration for tree-structured explain plan

```ts
import ELK from 'elkjs/lib/elk.bundled.js';

const elk = new ELK();

const ELK_OPTIONS = {
  'elk.algorithm': 'layered',              // hierarchical tree layout
  'elk.direction': 'DOWN',                 // root at top, leaves at bottom
  'elk.layered.spacing.nodeNodeBetweenLayers': '80',
  'elk.spacing.nodeNode': '60',
};

async function getLayoutedElements(nodes: Node[], edges: Edge[]) {
  const graph = {
    id: 'root',
    layoutOptions: ELK_OPTIONS,
    children: nodes.map(n => ({
      id: n.id,
      width: 180,   // fixed node width
      height: 60,   // fixed node height
    })),
    edges: edges.map(e => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    })),
  };

  const layouted = await elk.layout(graph);

  return {
    nodes: nodes.map(n => {
      const layoutNode = layouted.children?.find(c => c.id === n.id);
      return {
        ...n,
        position: { x: layoutNode?.x ?? 0, y: layoutNode?.y ?? 0 },
      };
    }),
    edges,
  };
}
```

### Layout configuration for ER diagram

Use `'elk.algorithm': 'layered'` with `'elk.direction': 'RIGHT'` for ER diagrams (foreign key hierarchies read left-to-right). For schemas without FK chains, switch to `'elk.algorithm': 'org.eclipse.elk.force'` to spread tables evenly.

**Why `layered` over `dagre`:**
- `dagre` is not in the existing dependencies; adding it would be a new dependency.
- `elkjs` is already present. The `layered` algorithm handles both trees (explain plans) and DAG-like FK graphs (ER diagrams) from one package.
- `elkjs` supports nested structures (subflows) if schema grouping by database is needed later.

**Worker note:** For large ER diagrams (> 100 nodes), run `elk.layout()` in a Web Worker to avoid blocking the React render thread. `elkjs` ships a worker-compatible bundle at `elkjs/lib/elk-worker.js`. This is not required for Phase 1 (explain plans are small); add it in Phase 3 when ER diagram ships.

**Confidence:** HIGH — Layout options verified directly from the official React Flow / elkjs example page. `elkjs` ^0.10.0 API is stable; the `elk.layout()` async function signature has not changed since 0.8.x.

---

## Rust: Query Cancellation (EXEC-02)

**New Cargo dependency required: `tokio-util`**

```toml
tokio-util = { version = "0.7", features = ["sync"] }
```

**Why this is needed:** `tokio` is already in `Cargo.toml` with `features = ["fs", "io-util", "sync", "process", "time", "macros"]`, but `CancellationToken` lives in `tokio-util::sync`, not in `tokio` itself. `tokio-util` is a separate crate.

### Implementation pattern for `db_query_execute` and `db_query_cancel`

The design doc (§7.3) specifies a `requestId`-based cancel model. The correct Rust pattern:

```rust
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

// State stored in Tauri's managed state
pub struct QueryRegistry {
    tokens: Mutex<HashMap<String, CancellationToken>>,
}

// In db_query_execute command:
pub async fn db_query_execute(
    state: tauri::State<'_, QueryRegistry>,
    request: QueryExecutionRequest,
) -> Result<QueryExecutionResponse, String> {
    let token = CancellationToken::new();
    state.tokens.lock().await.insert(request.request_id.clone(), token.clone());

    let result = tokio::select! {
        _ = token.cancelled() => Err("Query cancelled".to_string()),
        r = execute_query_inner(&request) => r,
    };

    state.tokens.lock().await.remove(&request.request_id);
    result
}

// In db_query_cancel command:
pub async fn db_query_cancel(
    state: tauri::State<'_, QueryRegistry>,
    request_id: String,
) -> Result<(), String> {
    if let Some(token) = state.tokens.lock().await.get(&request_id) {
        token.cancel();
    }
    Ok(())
}
```

**sqlx cancel-safety note:** `sqlx` query futures are NOT cancel-safe (see sqlx issue #2054). When the `CancellationToken` fires, the `tokio::select!` drops the sqlx future mid-execution. The database-side query continues running; only the Rust side stops waiting. This is acceptable behavior for a workbench (the DB will eventually time out or finish). Do not attempt to send a `KILL QUERY` unless building a "hard cancel" feature; that requires a separate admin connection and is out of scope for Phase 1.

**Confidence:** HIGH for tokio-util API (official Rust docs verified). MEDIUM for sqlx cancel behavior (confirmed via sqlx GitHub issue #2054; behavior is documented but not guaranteed stable across sqlx patch versions).

---

## Rust: Parameterized Grid Editing (GRID-01 through GRID-03)

**No new dependency required.** `sqlx` 0.8 supports parameterized queries natively for both MySQL and PostgreSQL via the `query!` macro or `sqlx::query()` with `.bind()`.

### Pattern for `db_grid_commit`

```rust
// Safe UPDATE — column names are validated against the schema snapshot before reaching here.
// Values are always bound, never string-concatenated.
let query = format!(
    "UPDATE {} SET {} WHERE {} = ?",
    validate_identifier(&patch.table_name)?,   // whitelist against schema
    patch.columns.iter()
        .map(|c| format!("{} = ?", validate_identifier(c)?))
        .collect::<Vec<_>>()
        .join(", "),
    validate_identifier(&patch.pk_column)?,
);

let mut q = sqlx::query(&query);
for value in &patch.values {
    q = q.bind(value);   // serde_json::Value via sqlx's Json type
}
q = q.bind(&patch.pk_value);
q.execute(&pool).await?;
```

**Critical constraint:** `validate_identifier()` must whitelist column names against `DbSchemaSnapshot` columns. It must never trust the frontend string directly. This is the only XSS/injection surface in the grid editing path.

**Confidence:** HIGH — sqlx parameterized bind API is stable and well-documented.

---

## react-window API for Result Grid (EXEC-03)

**No new dependency required.** `react-window` ^2.2.6 with `@types/react-window` ^1.8.8 are already present.

### Which component to use

Use `FixedSizeList` for the result grid, not `VariableSizeList`. Row heights in a database result grid are uniform; `VariableSizeList` adds itemSize function complexity for no benefit.

### Key props

```tsx
import { FixedSizeList, ListChildComponentProps } from 'react-window';

<FixedSizeList
  height={gridHeight}          // container pixel height (from panel resize)
  width="100%"
  itemCount={rows.length}
  itemSize={32}                // 32px per row is standard for data grids
  itemData={rows}
  overscanCount={5}            // render 5 rows above/below viewport for smooth scroll
>
  {({ index, style, data }: ListChildComponentProps<DbQueryRow[]>) => (
    <ResultRow row={data[index]} style={style} />
  )}
</FixedSizeList>
```

### Column freeze limitation

`react-window` does NOT have built-in column freeze. Implement frozen columns with a fixed-width overlay `<div>` positioned absolutely over the left edge of the grid, rendered in a separate pass outside `FixedSizeList`. This is the standard workaround and avoids adding a heavier grid library.

**Do not add `react-virtualized` or `ag-grid-react`** — they are either heavier, have incompatible licenses for this use case, or conflict with the existing shadcn/ui + Tailwind styling.

**Confidence:** HIGH — API confirmed via official react-window documentation and multiple implementation guides.

---

## Dangerous SQL Detection (SAFE-01, SAFE-02)

**No new dependency required.** `sqlparser` crate 0.53 is already in `Cargo.toml`. It provides a full SQL AST that can detect `DROP`, `TRUNCATE`, `ALTER TABLE`, `ALTER DATABASE`, `DELETE` without `WHERE`, and `UPDATE` without `WHERE` without regex fragility.

```rust
use sqlparser::dialect::{MySqlDialect, PostgreSqlDialect};
use sqlparser::parser::Parser;
use sqlparser::ast::{Statement, Expr};

fn classify_dangerous(sql: &str, dialect: &str) -> Vec<DangerousSqlWarning> {
    let statements = match dialect {
        "mysql" => Parser::parse_sql(&MySqlDialect {}, sql),
        _       => Parser::parse_sql(&PostgreSqlDialect {}, sql),
    }.unwrap_or_default();

    statements.iter().filter_map(|stmt| match stmt {
        Statement::Drop { .. } => Some(DangerousSqlWarning::Drop),
        Statement::Truncate { .. } => Some(DangerousSqlWarning::Truncate),
        Statement::AlterTable { .. } => Some(DangerousSqlWarning::AlterTable),
        Statement::Delete { selection: None, .. } => Some(DangerousSqlWarning::DeleteWithoutWhere),
        Statement::Update { selection: None, .. } => Some(DangerousSqlWarning::UpdateWithoutWhere),
        _ => None,
    }).collect()
}
```

**Why `sqlparser` over regex:** `sqlparser` handles multi-line, comment-embedded, and CTE-wrapped SQL correctly. Regex-based detection is trivially bypassed by whitespace or comments.

**Confidence:** HIGH — `sqlparser` 0.53 API verified against the crate's own documentation. `MySqlDialect` and `PostgreSqlDialect` are stable API surface.

---

## Summary of Net-New Additions

### Frontend (npm)

| Package | Version | Reason |
|---------|---------|--------|
| `sql-formatter` | ^15.7.2 | SQL formatting (EDIT-04); no hand-rolled formatter |

**Total new npm packages: 1**

### Rust (Cargo)

| Crate | Version | Reason |
|-------|---------|--------|
| `tokio-util` | 0.7 | `CancellationToken` for query cancel (EXEC-02); not in `tokio` itself |

**Total new Rust crates: 1**

---

## Explicitly NOT Adding

| Candidate | Rejected Because |
|-----------|-----------------|
| `monaco-sql-languages` (DTStack) | Only stable on monaco-editor@0.37.1; project is on 0.55.1. Bundle adds ~800 KB for ANTLR4 parser. Native `registerCompletionItemProvider` is sufficient. |
| `node-sql-parser` | Needed only for full alias resolution (Phase 3 autocomplete). Not needed Phase 1. |
| `ag-grid-react` / `react-virtualized` | Heavier than `react-window`; ag-grid community license restrictions; styling conflicts with Tailwind/shadcn. |
| `dagre` | Not currently in repo. `elkjs` (already present) covers same use cases. |
| `tauri-plugin-sql` | Already using raw `sqlx` directly; plugin would create a parallel connection management layer. |
| `prettier` | Too heavy for a keybinding formatter; `sql-formatter` is sufficient and self-contained. |

---

## Installation Commands

```bash
# Frontend — one new package
npm install sql-formatter
```

```toml
# Cargo.toml — one new crate
tokio-util = { version = "0.7", features = ["sync"] }
```

---

## Sources

- sql-formatter npm: https://www.npmjs.com/package/sql-formatter (v15.7.2, ~Feb 2026)
- sql-formatter GitHub: https://github.com/sql-formatter-org/sql-formatter
- Monaco CompletionItemProvider: https://microsoft.github.io/monaco-editor/typedoc/interfaces/languages.CompletionItemProvider.html
- Monaco registerCompletionItemProvider: https://microsoft.github.io/monaco-editor/typedoc/functions/languages.registerCompletionItemProvider.html
- monaco-sql-languages (version constraint note): https://github.com/DTStack/monaco-sql-languages/blob/main/README.md
- elkjs React Flow example: https://reactflow.dev/examples/layout/elkjs
- elkjs layout overview: https://reactflow.dev/learn/layouting/layouting
- tokio-util CancellationToken: https://docs.rs/tokio-util/latest/tokio_util/sync/struct.CancellationToken.html
- sqlx cancel-safety issue: https://github.com/launchbadge/sqlx/issues/2054
- react-window API: https://react-window.vercel.app/ and https://github.com/bvaughn/react-window
- SQL autocompletion in Monaco (implementation guide): https://medium.com/@alanhe421/implementing-sql-autocompletion-in-monaco-editor-493f80342403
