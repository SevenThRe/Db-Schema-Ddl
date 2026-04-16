import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await fs.readFile(path.join(ROOT, relativePath), "utf8");
}

test("connection form states P0 support scope and keeps unsupported transports out of product claims", async () => {
  const workspace = await read(
    "client/src/components/extensions/DbConnectorWorkspace.tsx",
  );

  assert.match(workspace, /P0 support scope/);
  assert.match(workspace, /Current build supports direct MySQL \/ PostgreSQL connections with saved-password handling/);
  assert.match(workspace, /SSH \/ TLS \/ enterprise auth are not product-supported in this build/);
  assert.match(workspace, /operator controls, not cosmetic metadata/);
});

test("connection center copy explains current supported scope and safety semantics", async () => {
  const workspace = await read(
    "client/src/components/extensions/DbConnectorWorkspace.tsx",
  );

  assert.match(workspace, /当前构建仅承诺 direct MySQL \/ PostgreSQL 连接与安全保存密码/);
  assert.match(workspace, /SSH \/ TLS \/ 企业认证仍未作为产品能力承诺/);
  assert.match(workspace, /启用后，工作台会在运行时阻止 DML \/ DDL \/ Data Sync apply/);
});

test("db workbench design doc records direct-driver scope without overclaiming secure connectivity", async () => {
  const design = await read("docs/db-workbench-extension-design.md");

  assert.match(design, /当前只承诺 direct `MySQL \/ PostgreSQL` 连接/);
  assert.match(design, /不能把 `SSH \/ TLS \/ 企业认证` 写成已交付产品能力/);
});
