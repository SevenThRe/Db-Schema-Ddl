import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("query execution contracts carry cursorOffset through preview and execution paths", async () => {
  const sharedSchema = await read("shared/schema.ts");
  const workbench = await read(
    "client/src/components/extensions/db-workbench/WorkbenchLayout.tsx",
  );
  const runtime = await read("src-tauri/src/db_connector/query.rs");

  assert.match(sharedSchema, /cursorOffset\?: number;/);
  assert.match(workbench, /cursorOffset,\s*\n\s*schema: runtimeSchema,/);
  assert.match(workbench, /previewDangerousSql\(\s*connection\.id,\s*sql,\s*cursorOffset,\s*\)/);
  assert.match(runtime, /resolve_target_sql_statements\(&request\.sql, request\.cursor_offset\)/);
  assert.match(runtime, /request\.cursor_offset\.is_some\(\)/);
});

test("workbench ignores stale query and export responses after cancel or superseding requests", async () => {
  const workbench = await read(
    "client/src/components/extensions/db-workbench/WorkbenchLayout.tsx",
  );

  assert.match(workbench, /const activeQueryRequestIdRef = useRef<string \| null>\(null\);/);
  assert.match(workbench, /const activeExportRequestIdRef = useRef<string \| null>\(null\);/);
  assert.match(workbench, /if \(activeQueryRequestIdRef\.current !== requestId\) \{\s*return null;\s*\}/);
  assert.match(workbench, /if \(activeExportRequestIdRef\.current !== exportRequestId\) \{\s*return null;\s*\}/);
  assert.match(workbench, /activeQueryRequestIdRef\.current = null;\s*setIsExecuting\(false\);\s*setCurrentRequestId\(null\);/);
  assert.match(workbench, /activeExportRequestIdRef\.current = null;\s*setIsExporting\(false\);\s*setCurrentExportRequestId\(null\);/);
});
