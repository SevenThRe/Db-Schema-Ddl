import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("db connector shell exposes one primary workspace route and secondary legacy tools", async () => {
  const workspace = await read(
    "client/src/components/extensions/DbConnectorWorkspace.tsx",
  );

  assert.match(workspace, /Database workspace/);
  assert.match(workspace, /Legacy tools/);
  assert.match(workspace, /\(legacyToolsOpen \|\| legacyToolActive\)/);
  assert.match(
    workspace,
    /连接管理是辅助面，真正的日常 DB 操作应通过统一的 Database Workspace 完成/,
  );
});

test("workbench layout exposes canonical connection-management callback", async () => {
  const workbench = await read(
    "client/src/components/extensions/db-workbench/WorkbenchLayout.tsx",
  );

  assert.match(workbench, /onManageConnections: \(\) => void;/);
  assert.match(workbench, /onClick=\{onManageConnections\}/);
  assert.match(workbench, /Connection Center/);
});
