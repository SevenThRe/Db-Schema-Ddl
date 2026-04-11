import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("result grid keeps backend-driven paging state and unsupported load-more copy", async () => {
  const resultGrid = await read(
    "client/src/components/extensions/db-workbench/ResultGridPane.tsx",
  );

  assert.match(resultGrid, /const hasMore = batch\.hasMore;/);
  assert.match(
    resultGrid,
    /Load \{loadMoreCount\.toLocaleString\(\)\} more rows/,
  );
  assert.match(resultGrid, /const pagingMode = batch\.pagingMode;/);
  assert.match(
    resultGrid,
    /Load more unavailable for this result\./,
  );
  assert.match(resultGrid, /Unknown total/);
});

test("runtime export menu exposes current page, loaded rows, and full result scopes", async () => {
  const exportMenu = await read(
    "client/src/components/extensions/db-workbench/ResultExportMenu.tsx",
  );

  assert.match(exportMenu, /Current page/);
  assert.match(exportMenu, /Loaded rows/);
  assert.match(exportMenu, /Full result/);
  assert.match(
    exportMenu,
    /Only single pageable SELECT-style results support full result export\./,
  );
});

test("workbench runtime path wires paging offsets, backend export, and full-result warning", async () => {
  const workbench = await read(
    "client/src/components/extensions/db-workbench/WorkbenchLayout.tsx",
  );

  assert.match(workbench, /batch\.pagingMode !== "offset" \|\| !batch\.hasMore/);
  assert.match(workbench, /offset: batch\.nextOffset/);
  assert.match(workbench, /hostApi\.connections\.exportRows/);
  assert.match(workbench, /currentPageRows:/);
  assert.match(workbench, /loadedRows: scope === "loaded_rows" \? activeBatch\.rows : undefined/);
  assert.match(
    workbench,
    /Full result export may be truncated at 100000 rows\./,
  );
  assert.match(workbench, /currentRequestId \?\? currentExportRequestId/);
});

test("result grid stop-on-error toggle is controlled by the workbench state", async () => {
  const resultGrid = await read(
    "client/src/components/extensions/db-workbench/ResultGridPane.tsx",
  );
  const workbench = await read(
    "client/src/components/extensions/db-workbench/WorkbenchLayout.tsx",
  );

  assert.match(resultGrid, /stopOnError: boolean;/);
  assert.doesNotMatch(resultGrid, /const \[stopOnError, setStopOnError\] = useState/);
  assert.match(workbench, /stopOnError=\{stopOnError\}/);
});
