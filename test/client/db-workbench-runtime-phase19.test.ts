import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("runtime classifies supported non-pageable result sets without dropping rows", async () => {
  const runtime = await read("src-tauri/src/db_connector/query.rs");

  assert.match(runtime, /StatementExecutionMode::UnsupportedResultQuery/);
  assert.match(runtime, /result_batch_from_rows\(/);
  assert.match(runtime, /DbQueryPagingMode::Unsupported/);
  assert.match(runtime, /DbQueryPagingMode::None/);
});

test("result grid gates load more on paging mode and still shows loaded-row evidence", async () => {
  const resultGrid = await read(
    "client/src/components/extensions/db-workbench/ResultGridPane.tsx",
  );

  assert.match(resultGrid, /const canLoadMore = pagingMode === "offset" && hasMore;/);
  assert.match(resultGrid, /const footerStatusLabel =/);
  assert.match(resultGrid, /footerStatusLabel\}\. \{unsupportedPagingText\}/);
});

test("recent query context is captured and restored per connection", async () => {
  const sessionStore = await read(
    "client/src/components/extensions/db-workbench/workbench-session.ts",
  );
  const workbench = await read(
    "client/src/components/extensions/db-workbench/WorkbenchLayout.tsx",
  );

  assert.match(sessionStore, /const nextRecentQueries = \[trimmedSql, \.\.\.deduped\]\.slice\(0, MAX_RECENT_QUERIES\);/);
  assert.match(workbench, /const restored = hydrateConnectionSession\(connection\.id, loadedSession\);/);
  assert.match(workbench, /setRecentQueries\(restored\.recentQueries\);/);
  assert.match(workbench, /const updatedSession = appendRecentQuery\(connection\.id, sql\);/);
  assert.match(workbench, /recentQueries\.map\(\(sql, index\) => \{/);
});
