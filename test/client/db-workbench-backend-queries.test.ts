import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("workbench backend queries are centralized outside the layout shell", async () => {
  const layout = await read(
    "client/src/components/extensions/db-workbench/use-workbench-layout-shell-model.ts",
  );
  const controllerGraph = await read(
    "client/src/components/extensions/db-workbench/use-workbench-layout-controller-graph.ts",
  );
  const backendQueries = await read(
    "client/src/components/extensions/db-workbench/use-workbench-backend-queries.ts",
  );

  assert.match(layout, /useWorkbenchLayoutControllerGraph\(\{/);
  assert.match(controllerGraph, /useWorkbenchBackendQueries\(/);
  assert.doesNotMatch(layout, /useQuery\(/);
  assert.match(backendQueries, /CONNECTIONS_QUERY_KEY/);
  assert.match(backendQueries, /SETTINGS_QUERY_KEY/);
  assert.match(backendQueries, /db-workbench-schema/);
  assert.match(backendQueries, /db-workbench-sync-schema/);
  assert.match(backendQueries, /db-workbench-sql-copilot-runtime/);
  assert.match(backendQueries, /enabled: syncSourceConnectionId !== connection\.id/);
  assert.match(backendQueries, /enabled: connection\.driver === "postgres"/);
  assert.match(backendQueries, /enabled: sqlCopilotOpen/);
});
